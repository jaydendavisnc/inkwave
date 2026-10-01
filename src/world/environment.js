// INKWAVE — Environment: everything outside the playable deck.
// Sky dome (gradient + stylized clouds + sun), sun/hemisphere lights, PMREM env map from the sky, stylized animated sea,
// pier pilings + dock details hugging the deck, and far scenery (skyline, port cranes, lighthouse, islands, bridge,
// ferris wheel, sailboats, buoys, gulls). All far scenery fades into the sky with a sky-matched aerial haze.
//
// const env = new Environment(renderer, scene, { bounds, theme: 'day'|'sunset'|'golden', shadowSize, footprint })
//   footprint (optional): array of deck rects = the deck slab's XZ outline (default [bounds]). Each rect is either an
//   axis-aligned {minX,maxX,minZ,maxZ} or an oriented rect {cx,cz,hx,hz,ax,az} (centre, half extents along its local
//   axes, local x axis (ax,az) unit; local z = (−az,ax)) — slabs turned about Y (obox). Internally every rect carries
//   both (orect()), so code that only needs bounds keeps reading minX..maxZ (the AABB).
//   Used for pilings, water foam, under-deck shading and the analytic deck shadow on the water.
//   setTheme(name) switches light/sky/sea in place; rebuildForArena(bounds, footprint) follows a stage change.
//
// Stage looks (layout.env, all optional — the stages without it keep the Inkopolis-bay look untouched):
//   bay: false          hide the default far scenery (city across the bay, port, lighthouse, bridge, ferris, sailboats,
//                       channel buoys) — for a stage somewhere else in the world; gulls: false / buoys: false likewise
//   backdrop(kit)       the stage's own far scenery (src/world/stages/<id>/backdrop.js): built on stage load, disposed on
//                       the next one. kit = SCENERY_KIT (geometry helpers, makeIsland terrain) + { THREE, bounds, runs
//                       (the deck's exposed edges), rnd(seed) }. Returns { static: [geo] (shore-lit scenery), plain: [geo]
//                       (no waterline foam), terrain: [geo] (makeIsland geos: grass / rock / sand / snow shading),
//                       instances: [{ geo, list: [[x, y, z, scale, rotY, '#hex'?], …] }], objects: [Object3D] (the
//                       stage's own live pieces — e.g. a cascade's scrolling water sheet with its own material; never
//                       colliders: they may stand in the arena but are only looks), animate(t)? (every frame) }
//                       kit.sceneryMaterial(flags?) gives a MeshStandardMaterial with the sky haze / fog of the far scenery.
//   theme: { all: {…}, day: {…}, sunset: {…}, golden: {…} }   per-stage overrides of THEMES keys (sea colours, fog, haze,
//                       sky, grade …) for every time / one time of day
//   snow: { line, cover }  snow on the backdrop terrain above `line` m (above the sea) and `cover` (0…1) everywhere
//   weather: { snow: { count, fall, size } | true, mist: { layers, height, reach, inner, opacity, scale, color } | true }
//                       falling snow round the camera; drifting fog banks lying on the water round the arena
//   stars: true         a star field that comes out with the dusk themes (THEMES[*].night)
//   edge: 'none'        no generic pier pilings along the deck edges (the stage dresses its own banks / cliffs)
//   boats: false        no generic moored boats round the arena (like layout.envBoats === false)
//
// Marina water mode (stage property — Halyard, by day or at dusk; each theme supplies its look in THEMES[*].marina):
// level-derived hull / floating-slab sets (no sea inside hulls, deep shade under the decks), calm sheltered basin,
// wall-bounced ripples, froth wherever something stands in the water (analytic for hulls, triangle ∩ water-plane
// contours of the stage props for piles / fenders / boats), waterline strips on the faces (reflected-sun caustics +
// hull wet band), a planar reflection of the stage (Environment._renderReflection, quality-scaled) and a baked
// far-reflection cube for the distant land. The other stages keep the original open-sea shader untouched.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYER } from '../config.js';
import { G } from '../core/ctx.js';

const WATER_Y = PLAYER.waterY; // -1.6
const DEG = Math.PI / 180;
const MAX_RECTS = 48;   // deck slabs (Halyard has 16: every pier/quay slab of both halves; curved outlines use many)
const MAX_WET = 24;     // marina: solids piercing the surface (hulls) or sunk below it
// More rects than that (curved outlines from many thin segments) switch the sea to a baked distance field (DECK_FIELD):
const FIELD_RES = 0.1;  // field texel (m); exact along straight edges (bilinear of a linear field), corners within ~1 cm
const FIELD_R = 10;     // reach (m) of the exact field; past it the distance to the rects' AABB (a lower bound) is used
const HEMI_FLOOR = 0.38; // = the sky-fill floor main.js applies after construction

// ---------------------------------------------------------------------------------------------------------------
// Themes (colours are sRGB hex; converted to linear once)
// ---------------------------------------------------------------------------------------------------------------
const THEMES = {
  day: {
    // key : fill ≈ 3.5 : 1 on the deck — a warm key a little lower than noon (longer shadows model the blocks), a cool
    // sky fill, and a warm bounce off the sunlit deck (hemi ground) so walls turned from the sun keep their form
    sunAz: 222, sunEl: 39,
    sunColor: '#fff0dc', sunIntensity: 3.3, skySun: 2.75,
    hemiSky: '#b4d0ff', hemiGround: '#dcc3a0', hemiGroundK: 2.2, hemiIntensity: 0.45, envK: 0.45,
    zenith: '#1d6fdc', skyMid: '#5aa8f2', horizon: '#d4ecfa', ground: '#6fa4bd',
    horizonGlow: '#fff4dc', horizonGlowK: 0.05, glowColor: '#fff0cc',
    glow: [900, 0.9, 7.0, 0.06],
    sunDisk: '#fff6e6', sunDiskK: 34, sunRadius: 1.25,
    cloudLit: '#ffffff', cloudLitK: 0.94, cloudShade: '#a9bfdc', cloud: [0.44, 1.0, 1.0, 0.5],
    seaDeep: '#0a4f8a', seaShallow: '#12a7b8', seaCrest: '#48e2d6', foam: '#f7fcff',
    seaAmbientK: 0.62, sunSpec: 1.0, waveStrength: 1.0,
    haze: [1 / 1850, 0.9, 260],
    fog: [25, 900],   // a breath of aerial perspective across the arena itself (≈ 4 % at the far spawn)
    night: 0,
    grade: { uExposure: 0.9, uSat: 1.1, uVib: 0.12, uContrast: 1.09, uLift: 0.0, uVignette: 0.2, uShadowTint: [0.92, 0.97, 1.1], uHighTint: [1.035, 1.0, 0.955] },
    marina: { channel: '#0b4552', shade: '#05121a', calm: 0.55, lap: 1.0, caustic: 2.0, wet: 0.5 },
  },
  sunset: {
    // golden key vs indigo fill: the low sun paints every face that turns to it orange, shade falls to a cool blue (the
    // sky IBL is kept low so the purple sky doesn't flood the shade magenta); street lamps pool warm light (night: 1)
    sunAz: 206, sunEl: 15,
    sunColor: '#ffac4c', sunIntensity: 4.6, skySun: 3.7,
    hemiSky: '#5e7fd6', hemiGround: '#c08a66', hemiGroundK: 1.6, hemiIntensity: 0.6, envK: 0.42,
    zenith: '#1b2768', skyMid: '#56509e', horizon: '#ffa266', ground: '#4a4f7a',
    horizonGlow: '#ff8a4a', horizonGlowK: 0.55, glowColor: '#ffb35c',
    glow: [260, 2.2, 5.5, 0.55],
    sunDisk: '#ffd9a0', sunDiskK: 22, sunRadius: 1.7,
    cloudLit: '#ffc39a', cloudLitK: 0.95, cloudShade: '#62598f', cloud: [0.4, 1.0, 1.0, 0.44],
    seaDeep: '#1a2c5e', seaShallow: '#2f6f8f', seaCrest: '#6a8fc4', foam: '#ffe2cf',
    seaAmbientK: 0.5, sunSpec: 1.35, waveStrength: 1.0,
    haze: [1 / 1100, 0.9, 260],
    fog: [25, 800],
    night: 1,
    grade: {
      uExposure: 1.0, uSat: 1.05, uVib: 0.1, uContrast: 1.07, uLift: 0.0, uVignette: 0.28, uShadowTint: [0.88, 0.96, 1.16], uHighTint: [1.07, 1.0, 0.88],
      bloom: [0.4, 0.55, 1.7],   // lanterns, lit windows and the sun's halo bloom a little at dusk
    },
    // marina stages at dusk (Halyard): ink-blue channels, near-black under the decks, orange caustics off the low sun
    marina: { channel: '#132140', shade: '#04060d', calm: 0.55, lap: 1.0, caustic: 1.7, wet: 0.55 },
  },
  // Halyard Marina: late afternoon. Warm low sun from the west (−X, over the islands) side-lights both lanes the same way
  // (fair to both teams: nobody spawns facing it), cool sky fill in the long shadows, warm haze, and the sheltered
  // harbour water of the `marina` block (planar reflections, hull contact foam, caustics, under-deck shade).
  golden: {
    sunAz: 194, sunEl: 28,
    sunColor: '#ffd9ae', sunIntensity: 3.6, skySun: 3.35,
    hemiSky: '#aecaf0', hemiGround: '#cfb08a', hemiGroundK: 1.8, hemiIntensity: 0.42, envK: 0.5,
    zenith: '#2a62b2', skyMid: '#72a3d6', horizon: '#f0d8b8', ground: '#5b7d90',
    horizonGlow: '#ffbf80', horizonGlowK: 0.3, glowColor: '#ffd29a',
    glow: [480, 1.5, 6.0, 0.24],
    sunDisk: '#fff1d8', sunDiskK: 26, sunRadius: 1.35,
    cloudLit: '#f4fbf4', cloudLitK: 0.95, cloudShade: '#909fbc', cloud: [0.42, 1.0, 0.85, 0.46], cloudCov: 0.4, cloudSeed: 7.0,
    seaDeep: '#0a3f53', seaShallow: '#16707a', seaCrest: '#5fc9b6', foam: '#fff6ea',
    seaAmbientK: 0.6, sunSpec: 1.2, waveStrength: 0.8,
    haze: [1 / 1650, 0.9, 240],
    fog: [30, 1000],
    night: 0,
    shafts: 1,
    grade: { uExposure: 0.95, uSat: 1.05, uVib: 0.12, uContrast: 1.1, uLift: 0.0, uVignette: 0.22, uShadowTint: [0.93, 0.98, 1.09], uHighTint: [1.06, 1.0, 0.925] },
    marina: {
      channel: '#0d3a37',   // water colour hugging hulls / quay faces (bottle green, darker)
      shade: '#06110f',     // water under the floating decks
      calm: 0.55,           // wave-normal strength inside the arena's sheltered channels
      lap: 1.0,             // wall-reflected ripple strength
      caustic: 2.2,         // reflected-sun caustics on sunlit faces just above the water (1 = physical estimate)
      wet: 0.55,            // wet-band darkening on hulls at the waterline
    },
  },
};

const lin = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

// ---------------------------------------------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------------------------------------------
const GLSL_NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), u.x), mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), u.x), u.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  float a = hash13(i), b = hash13(i+vec3(1.0,0.0,0.0)), c = hash13(i+vec3(0.0,1.0,0.0)), d = hash13(i+vec3(1.0,1.0,0.0));
  float e = hash13(i+vec3(0.0,0.0,1.0)), f1 = hash13(i+vec3(1.0,0.0,1.0)), g = hash13(i+vec3(0.0,1.0,1.0)), h = hash13(i+vec3(1.0,1.0,1.0));
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y), mix(mix(e,f1,u.x), mix(g,h,u.x), u.y), u.z); }
float fbm2(vec2 p){ float s = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++){ s += a * vnoise2(p); p = m * p + 3.7; a *= 0.5; } return s / 0.96875; }
// Round cumulus lobes: nearest jittered feature point; x = 1 - (d/r)^2 (>0 inside a puff), yz = offset from its centre.
vec3 lobes(vec2 p, float period){
  vec2 i = floor(p), f = fract(p);
  // smooth (soft-min) blend of neighbouring lobes → no Voronoi seams; creases between puffs stay soft
  float acc = 0.0; vec2 ob = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 c = i + g;
    if (period > 0.0) c.x = mod(c.x, period);
    vec2 h = vec2(hash12(c), hash12(c + 17.31));
    float rad = 0.6 + 0.35 * hash12(c + 5.13);
    vec2 o = (g + 0.2 + 0.6 * h - f) / rad;
    float w = exp(-5.0 * dot(o, o));
    acc += w; ob -= w * o;
  }
  acc = max(acc, 1e-6);
  return vec3(1.0 + log(acc) / 5.0, ob / acc);
}
float fbm3(vec3 p){ float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ s += a * vnoise3(p); p = p * 2.02 + vec3(1.7, 9.2, 4.1); a *= 0.5; } return s / 0.96875; }
`;

// Shared sky gradient + aerial haze (used by sky, sea and all far scenery so everything melts into the same horizon).
const GLSL_SKY_COMMON = /* glsl */`
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uSkyMid;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uHorizonGlow;
uniform vec3 uGlowColor;
uniform vec4 uGlowParams;   // x tight power, y tight strength, z horizon band sharpness, w wide strength
uniform vec4 uHaze;         // x density (1/m), y max, z height falloff (m)
uniform float uNight;

vec3 skyGradient(vec3 d) {
  float h = d.y;
  float hp = max(h, 0.0);
  float t = sqrt(hp);
  vec3 c = mix(uHorizon, uSkyMid, smoothstep(0.0, 0.52, t));
  c = mix(c, uZenith, smoothstep(0.4, 1.0, t));
  vec2 sh = normalize(uSunDir.xz + vec2(1e-5));
  vec2 dh = normalize(d.xz + vec2(1e-5));
  float az = dot(sh, dh) * 0.5 + 0.5;
  float band = exp(-hp * uGlowParams.z);
  c += uHorizonGlow * band * (0.2 + 0.8 * az * az * az);
  float sd = max(dot(normalize(vec3(d.x, hp, d.z)), uSunDir), 0.0);
  c += uGlowColor * (pow(sd, uGlowParams.x) * uGlowParams.y + pow(sd, 6.0) * uGlowParams.w);
  // dusk: the horizon opposite the sun lies in the earth's shadow — cooler and dimmer than the sunward side, so the
  // far shore / skyline away from the sun hazes into lavender-blue instead of glowing salmon (sky, env map and haze)
  float anti = (1.0 - az) * (1.0 - az);
  c *= mix(vec3(1.0), vec3(0.7, 0.74, 0.95), uNight * anti * exp(-hp * 2.5));
  c = mix(c, uGround, smoothstep(0.0, -0.22, h));
  return c;
}
vec3 hazeColor(vec3 d) {
  vec3 h = skyGradient(normalize(vec3(d.x, clamp(d.y, 0.0, 1.0) * 0.3, d.z)));
  h = mix(h, uSkyMid * 1.08 + uHorizon * 0.12, 0.22);   // aerial perspective: distant land turns bluer
  // looking down through the haze you see scattered ambient, not the glowing horizon band
  return mix(h, uGround * 1.15 + uSkyMid * 0.25, smoothstep(-0.02, -0.45, d.y) * 0.75);
}
vec3 applyHaze(vec3 col, vec3 wp) {
  vec3 dv = wp - cameraPosition;
  float dist = length(dv);
  vec3 dir = dv / max(dist, 1e-3);
  float hf = exp(-max(wp.y, 0.0) / uHaze.z);
  float f = 1.0 - exp(-dist * uHaze.x * mix(0.45, 1.0, hf));
  return mix(col, hazeColor(dir), min(f, uHaze.y));
}
`;

// ---- baked volumetric cumulus -------------------------------------------------------------------------------------
// One texel = one sky direction (u = azimuth, v = sin(elevation)^(1/1.6), dense near the horizon). Each texel
// ray-marches a field of cumulus heaps (1.1–3 km altitude, out to 55 km) with a short light march toward the sun
// (self-shadowed bellies, lit cauliflower tops, forward-scattered silver lining) and aerial perspective, and stores
// premultiplied radiance + opacity. Re-baked on theme change (sun/sky colours); per frame the sky is one texture fetch.
const CLOUD_W = 2048, CLOUD_H = 640;
const CLOUD_BAKE_FRAG = /* glsl */`
${GLSL_SKY_COMMON}
uniform vec2 uRes;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uSunCol;
uniform vec4 uCloudParams;
uniform float uSeed;
uniform float uCov;
vec3 hash33c(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx) * 2.0 - 1.0; }
vec4 hash42c(vec2 p) { vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }
float gn3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash33c(i), f), b = dot(hash33c(i + vec3(1, 0, 0)), f - vec3(1, 0, 0));
  float c = dot(hash33c(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), d = dot(hash33c(i + vec3(1, 1, 0)), f - vec3(1, 1, 0));
  float e = dot(hash33c(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), g = dot(hash33c(i + vec3(1, 0, 1)), f - vec3(1, 0, 1));
  float h = dot(hash33c(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), k = dot(hash33c(i + vec3(1, 1, 1)), f - vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
const float HB = 1150.0, CELL = 2700.0, RMAX = 55000.0, TOPMAX = 3300.0;
// signed distance (m) to the cumulus field: flattened-base ellipsoid heaps per cell, smooth-merged, then eroded into
// cauliflower lobes by billowy noise that grows toward the tops. hf = height fraction inside the nearest heap.
float smin2(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float ellip(vec3 p, vec2 c, float cy, float r, float ht, float flt) {
  vec3 q = vec3((p.x - c.x) / r, (p.y - cy) / ht, (p.z - c.y) / r);
  q.y = q.y < 0.0 ? q.y * flt : q.y;
  return (length(q) - 1.0) * min(r, ht);
}
// cumulus: a wide low base heap with up to two bubbling turrets on top, smooth-merged across neighbouring cells
float cloudSD(vec3 p, out float hf) {
  vec2 c = floor(p.xz / CELL);
  float sd = 1e5; hf = 0.0; float best = 1e5;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cc = c + vec2(float(i), float(j));
    vec4 h = hash42c(cc + uSeed);
    if (h.x > uCov) continue;
    vec2 ctr = (cc + 0.2 + 0.6 * h.yz) * CELL;
    float r = mix(560.0, 1500.0, h.w * h.w);
    vec4 h2 = hash42c(cc.yx + 17.3);
    float tower = h2.x;
    float hb = HB + 160.0 * h2.y;
    float ht = r * mix(0.4, 0.6, h2.z);
    float e = ellip(p, ctr, hb, r, ht, 2.5);
    float top = hb + ht;
    for (int k = 0; k < 2; k++) {
      vec4 hk = hash42c(cc * 1.31 + vec2(11.0 + float(k) * 7.0, 3.0));
      if (hk.x > 0.85) continue;
      vec2 o = (hk.yz - 0.5) * r * 0.8;
      float rr = r * mix(0.4, 0.62, hk.w) * (tower > 0.8 ? 1.25 : 1.0);
      float hh = rr * mix(0.85, 1.25, hk.x) * (tower > 0.8 ? 1.6 : 1.0);
      float cy = hb + ht * mix(0.2, 0.55, hk.y);
      e = smin2(e, ellip(p, ctr + o, cy, rr, hh, 1.6), 220.0);
      top = max(top, cy + hh);
    }
    if (e < best) { best = e; hf = clamp((p.y - hb) / max(top - hb, 1.0), 0.0, 1.0); }
    sd = smin2(sd, e, 380.0);
  }
  return sd;
}
float cloudDens(vec3 p, out float hf, out float sdo) {
  float sd = cloudSD(p, hf);
  sdo = sd;
  if (sd > 520.0) return 0.0;
  vec3 w = p / 520.0 + vec3(uSeed * 3.1, 0.0, 0.0);
  float b = 1.0 - abs(gn3(w)) * 1.9;                          // billows
  b += 0.5 * (1.0 - abs(gn3(w * 2.3 + 11.7)) * 1.9);
  float fine = gn3(w * 5.1 + 3.3);
  sd += (0.55 - b * 0.45) * mix(310.0, 430.0, hf) + fine * 22.0;
  sdo = sd;
  return clamp(-sd / 42.0, 0.0, 1.0) * smoothstep(HB - 120.0, HB + 60.0, p.y);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float az = (uv.x - 0.5) * 6.28318531;
  float sy = pow(uv.y, 1.6);
  float cy = sqrt(max(1.0 - sy * sy, 0.0));
  vec3 d = vec3(cos(az) * cy, sy, sin(az) * cy);
  vec3 L = vec3(0.0); float T = 1.0;
  if (d.y > 0.004) {
    float t0 = (HB - 60.0) / d.y, t1 = min(TOPMAX / d.y, RMAX);
    if (t0 < t1) {
      float span = t1 - t0;
      const float dt = 16.0;
      float t = t0;
      float cosT = dot(d, uSunDir);
      float g1 = 0.62, g2 = -0.18;
      float ph = min(mix((1.0 - g1 * g1) / pow(1.0 + g1 * g1 - 2.0 * g1 * cosT, 1.5), (1.0 - g2 * g2) / pow(1.0 + g2 * g2 - 2.0 * g2 * cosT, 1.5), 0.62), 2.6);
      float tHit = -1.0;
      for (int s = 0; s < 320; s++) {
        if (t > t1 || T < 0.015) break;
        vec3 p = d * t;
        float hf, sdv;
        float den = cloudDens(p, hf, sdv);
        if (den <= 0.002) { t += clamp(sdv * 0.6, dt, 900.0); continue; }   // sphere-trace the empty space
        {
          if (tHit < 0.0) tHit = t;
          // light march toward the sun (self-shadowing)
          float od = 0.0, ls = 45.0; vec3 lp = p;
          for (int k = 0; k < 6; k++) { lp += uSunDir * ls; float hk, sk; od += cloudDens(lp, hk, sk) * ls; ls *= 1.9; }
          float Tl = exp(-od * 0.0105);
          float powder = 1.0 - exp(-den * 3.0);
          float sun = Tl * mix(0.55, 1.0, powder) * ph * 1.35;
          float amb = mix(0.6, 1.0, smoothstep(0.0, 0.9, hf)) * (0.62 + 0.38 * powder);
          vec3 S = uSunCol * uCloudLit * sun + uCloudShade * amb * 0.95;
          float sig = den * 0.02;
          float Ts = exp(-sig * dt);
          L += T * S * (1.0 - Ts);
          T *= Ts;
        }
        t += dt;
      }
      if (tHit > 0.0) {
        // aerial perspective: far heaps melt into the horizon haze
        float f = 1.0 - exp(-tHit / 26000.0);
        vec3 hz = hazeColor(d);
        L = mix(L, (1.0 - T) * hz, clamp(f * 0.9, 0.0, 0.92));
        // fade the far edge of the field so there is no hard cut-off line
        float edge = smoothstep(RMAX, RMAX * 0.7, tHit);
        L *= edge; T = mix(1.0, T, edge);
      }
    }
  }
  gl_FragColor = vec4(L, 1.0 - T);
}
`;

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
}
`;

const SKY_FRAG = /* glsl */`
${GLSL_SKY_COMMON}
${GLSL_NOISE}
uniform vec3 uSunDisk;
uniform float uSunCos;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec4 uCloudParams;   // x overhead coverage, y horizon bank amount, z drift speed, w bank height
uniform sampler2D uCloudTex;
varying vec3 vDir;

void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyGradient(d);
  float sd = dot(d, uSunDir);
  float cloudA = 0.0;
  vec2 sunH = normalize(uSunDir.xz + vec2(1e-4));

  // ---- baked volumetric cumulus (slow drift = rotation of the whole field) ----
  {
    float u = atan(d.z, d.x) / 6.28318531 + 0.5 + uTime * 0.00035 * uCloudParams.z;
    float v = pow(clamp(d.y, 0.0, 1.0), 1.0 / 1.6);
    vec4 cl = textureLod(uCloudTex, vec2(u, v), 0.0);
    cl *= smoothstep(-0.002, 0.012, d.y);
    col = col * (1.0 - cl.a) + cl.rgb;
    cloudA = cl.a;
  }
  // ---- high cirrus veil: faint, streaky, far above the cumulus ----
  if (d.y > 0.02) {
    vec2 cp = d.xz / (d.y + 0.08) * 0.9 + vec2(uTime * 0.004, uTime * 0.0015) * uCloudParams.z;
    vec2 cs = vec2(cp.x * 0.35 + cp.y * 0.9, cp.y * 0.35 - cp.x * 0.9);
    float ci = fbm2(cs * vec2(0.55, 3.2) + 4.0) - 0.52;
    ci = smoothstep(0.02, 0.3, ci) * smoothstep(0.06, 0.35, d.y) * (1.0 - cloudA) * 0.11;
    col = mix(col, uCloudLit * 0.95 + uGlowColor * 0.1, ci);
  }
#if defined(SKY_SHAFTS) && !defined(ENV_PASS)
  // crepuscular rays: walk from this direction toward the sun across the baked cloud layer — clear paths glow, paths
  // behind a heap fall into its shade, so shafts fan out from the sun between the clouds
  {
    float sdo = dot(d, uSunDir);
    if (sdo > 0.35 && d.y > -0.05) {
      float occ = 0.0;
      for (int k = 0; k < 6; k++) {
        vec3 s = normalize(mix(d, uSunDir, (float(k) + 0.5) / 6.0));
        float uu = atan(s.z, s.x) / 6.28318531 + 0.5 + uTime * 0.00035 * uCloudParams.z;
        float vv = pow(clamp(s.y, 0.0, 1.0), 1.0 / 1.6);
        occ += textureLod(uCloudTex, vec2(uu, vv), 0.0).a * smoothstep(-0.002, 0.012, s.y);
      }
      occ /= 6.0;
      float w = smoothstep(0.35, 1.0, sdo);
      w *= w;
      col += uGlowColor * (1.0 - occ) * w * 0.1 * (1.0 - cloudA);
      col *= 1.0 - occ * w * 0.2 * (1.0 - cloudA);
    }
  }
#endif

#ifndef ENV_PASS
  // ---- sun disk + tight halo (HDR → blooms) ----
  float aa = 0.00012;
  float disk = smoothstep(uSunCos - aa, uSunCos + aa, sd);
  col += uSunDisk * disk * (1.0 - cloudA * 0.94);
  col += uSunDisk * 0.02 * pow(max(sd, 0.0), 1400.0) * (1.0 - cloudA * 0.6);
#else
  // env map: soft sun lobe only (a tiny HDR disk would sparkle in rough mips)
  col += uGlowColor * pow(max(sd, 0.0), 64.0) * 1.2;
  col *= 0.72;
#endif

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
#ifndef ENV_PASS
  gl_FragColor.rgb += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
#endif
}
`;

// Deck / hull rects are oriented: uRects[i] = (centre x, centre z, half extent along local x, along local z),
// uRectAx[i] = the local x axis (unit, world xz); local z = (−ax.y, ax.x). Axis-aligned slabs pass (1, 0), for which
// the rotation below is exact (x·1 + z·0), so they shade exactly as the old min/max rects did.
const GLSL_DECK = /* glsl */`
uniform vec4 uRects[${MAX_RECTS}];
uniform vec2 uRectAx[${MAX_RECTS}];
uniform int uRectCount;
// axis-aligned rect given as (minX, minZ, maxX, maxZ) — the arena bounds
float sdRect(vec2 p, vec4 r) {
  vec2 c = (r.xy + r.zw) * 0.5; vec2 h = (r.zw - r.xy) * 0.5;
  vec2 q = abs(p - c) - h;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
// oriented rect: r = (centre, half extents), a = local x axis
float sdORect(vec2 p, vec4 r, vec2 a) {
  vec2 d = p - r.xy;
  vec2 q = abs(vec2(dot(d, a), dot(d, vec2(-a.y, a.x)))) - r.zw;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
#ifdef DECK_FIELD
// more rects than uniform slots: the deck union (R) and the marina hull union (G) baked into a signed-distance field
// (Environment._bakeDeckField), exact within uDeckFieldK.y of any rect; past that, the distance to the rects' AABB
uniform sampler2D uDeckField;
uniform vec4 uDeckFieldRect;   // field origin (x, z), 1 / field size (x, z)
uniform vec4 uDeckFieldK;      // x: texel (m), y: exact reach (m)
uniform vec4 uDeckBox;         // AABB of the deck rects (minX, minZ, maxX, maxZ)
uniform vec4 uWetBox;          // AABB of the hull rects
vec2 deckField(vec2 p) { return textureLod(uDeckField, clamp((p - uDeckFieldRect.xy) * uDeckFieldRect.zw, 0.0, 1.0), 0.0).rg; }
float sdDeck(vec2 p) { return max(deckField(p).r, sdRect(p, uDeckBox)); }
#else
float sdDeck(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < ${MAX_RECTS}; i++) { if (i >= uRectCount) break; d = min(d, sdORect(p, uRects[i], uRectAx[i])); }
  return d;
}
#endif
#ifdef MARINA
uniform vec4 uWet[${MAX_WET}];
uniform vec2 uWetAx[${MAX_WET}];
uniform int uWetCount;
uniform vec4 uArena;        // arena bounds (minX, minZ, maxX, maxZ): the harbour basin around it is sheltered
float basinK(vec2 p) { return smoothstep(60.0, 210.0, sdRect(p, uArena)); }   // 0 in the basin → 1 open sea
#ifdef DECK_FIELD
float sdWet(vec2 p) { return max(deckField(p).g, sdRect(p, uWetBox)); }
#else
float sdWet(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < ${MAX_WET}; i++) { if (i >= uWetCount) break; d = min(d, sdORect(p, uWet[i], uWetAx[i])); }
  return d;
}
#endif
#endif
`;

const GLSL_SWELL = /* glsl */`
// long gentle swell; returns height (unit amplitude) and writes gradient
float swell(vec2 p, float t, out vec2 g) {
  float h = 0.0; g = vec2(0.0);
  vec2 k; float ph;
  k = vec2(0.110, 0.047); ph = dot(p, k) + t * 0.95;        h += 0.45 * sin(ph); g += 0.45 * k * cos(ph);
  k = vec2(-0.052, 0.097); ph = dot(p, k) + t * 1.13 + 1.7; h += 0.35 * sin(ph); g += 0.35 * k * cos(ph);
  k = vec2(0.173, -0.141); ph = dot(p, k) + t * 1.61 + 4.1; h += 0.20 * sin(ph); g += 0.20 * k * cos(ph);
  return h;
}
float swellAmp(float dDeck) { return mix(0.035, 0.16, smoothstep(3.0, 70.0, dDeck)); }
`;

// Marina water (theme.marina — Halyard): sheltered harbour water in narrow channels between floating piers and hulls.
//   • uWet (hulls, anything piercing the surface): never any sea inside; a lapping froth line hugs their sides
//   • uRects (floating slabs): the water carries on underneath in deep shade — no sky showing through the gap
//   • calm, glassy channels: wave normals damped near the faces, plus ripples bounced back off every face
//   • planar reflection of the real scene (uReflTex, Environment._renderReflection) over the analytic sky + baked
//     clouds; reflected geometry occludes the sun glints
//   • colour: open harbour teal → darker bottle green hugging the faces
const GLSL_SEA_MARINA = /* glsl */`
${GLSL_NOISE}
uniform sampler2D uReflTex;
uniform mat4 uReflMat;
uniform float uReflOn;
uniform samplerCube uFarCube;   // far scenery (hills, city, port, bridge) baked from the arena centre, alpha = coverage
uniform float uFarOn;
uniform sampler2D uCloudTex;
uniform vec4 uCloudParams;
uniform vec3 uChannelCol;
uniform vec3 uShadeCol;
uniform vec4 uMarinaK;     // x calm (wave-normal scale hugging faces), y face-ripple strength, z reflection distortion (m)
// distance (m) + outward unit gradient (world xz) to an oriented rect / the nearest rect of a set. The gradient is
// found in the rect's frame and rotated back (g.x·a + g.y·(−a.y, a.x)); exact for axis-aligned rects (a = (1, 0)).
vec3 sdORectG(vec2 p, vec4 r, vec2 a) {
  vec2 b = vec2(-a.y, a.x);
  vec2 d = p - r.xy;
  vec2 l = vec2(dot(d, a), dot(d, b));
  vec2 s = vec2(l.x < 0.0 ? -1.0 : 1.0, l.y < 0.0 ? -1.0 : 1.0);
  vec2 q = abs(l) - r.zw;
  vec3 o;
  if (max(q.x, q.y) > 0.0) { vec2 m = max(q, 0.0); float len = max(length(m), 1e-4); o = vec3(len, s * m / len); }
  else o = q.x > q.y ? vec3(q.x, s.x, 0.0) : vec3(q.y, 0.0, s.y);
  return vec3(o.x, o.y * a + o.z * b);
}
#ifdef DECK_FIELD
// field mode: both unions + outward gradients from five taps (central differences one texel apart)
void deckWetG(vec2 p, out vec3 gd, out vec3 gw) {
  float h = uDeckFieldK.x;
  vec2 c = deckField(p);
  vec2 dx = deckField(p + vec2(h, 0.0)) - deckField(p - vec2(h, 0.0));
  vec2 dz = deckField(p + vec2(0.0, h)) - deckField(p - vec2(0.0, h));
  vec2 nd = vec2(dx.x, dz.x), nw = vec2(dx.y, dz.y);
  float ld = length(nd), lw = length(nw);
  gd = vec3(max(c.x, sdRect(p, uDeckBox)), ld > 1e-5 ? nd / ld : vec2(0.0, 1.0));
  gw = vec3(max(c.y, sdRect(p, uWetBox)), lw > 1e-5 ? nw / lw : vec2(0.0, 1.0));
}
#else
vec3 sdDeckG(vec2 p) {
  vec3 b = vec3(1e5, 0.0, 1.0);
  for (int i = 0; i < ${MAX_RECTS}; i++) { if (i >= uRectCount) break; vec3 r = sdORectG(p, uRects[i], uRectAx[i]); if (r.x < b.x) b = r; }
  return b;
}
vec3 sdWetG(vec2 p) {
  vec3 b = vec3(1e5, 0.0, 1.0);
  for (int i = 0; i < ${MAX_WET}; i++) { if (i >= uWetCount) break; vec3 r = sdORectG(p, uWet[i], uWetAx[i]); if (r.x < b.x) b = r; }
  return b;
}
#endif
vec3 skyRefl(vec3 R) {
  vec3 c = skyGradient(normalize(R + vec3(0.0, 0.015, 0.0)));
  float u = atan(R.z, R.x) / 6.28318531 + 0.5 + uTime * 0.00035 * uCloudParams.z;
  float v = pow(clamp(R.y, 0.0, 1.0), 1.0 / 1.6);
  vec4 cl = textureLod(uCloudTex, vec2(u, v), 0.0) * smoothstep(-0.002, 0.012, R.y);
  return c * (1.0 - cl.a) + cl.rgb;
}
void main() {
  vec3 P = vWorld;
  vec3 toCam = cameraPosition - P;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 p = P.xz;
  float detail = 1.0 - smoothstep(35.0, 380.0, dist);

  // the per-rect work only matters near the stage: past 24 m from the arena every face is out of reach
  float dA = sdRect(p, uArena);
  vec3 gw = vec3(dA, 0.0, 1.0), gd = gw;
  if (dA < 24.0) {
#ifdef DECK_FIELD
    deckWetG(p, gd, gw);
    if (gw.x < -0.03) discard;
#else
    gw = sdWetG(p);
    if (gw.x < -0.03) discard;                     // inside a hull / over a sunken floor: no sea
    gd = sdDeckG(p);
#endif
  }
  vec3 gs = gd.x < gw.x ? gd : gw;                 // nearest face: distance + outward normal
  float dS = gs.x;
  float shelter = smoothstep(0.3, 9.0, max(dS, 0.0));

  vec4 w1 = texture2D(uWaveTex, p * 0.041 + uTime * vec2(0.012, 0.007));
  vec4 w2 = texture2D(uWaveTex, p * 0.097 + vec2(0.37, 0.61) + uTime * vec2(-0.019, 0.013));
  vec4 w3 = texture2D(uWaveTex, p * 0.0083 + uTime * vec2(0.0034, -0.0022));
  float nearF = 1.0 - smoothstep(6.0, 40.0, dist);
  vec4 w4 = texture2D(uWaveTex, p * 0.29 + vec2(0.71, 0.13) + uTime * vec2(0.031, -0.026));
  vec2 g = (w3.xy - 0.5) * 0.9 + ((w1.xy - 0.5) * 0.85 + (w2.xy - 0.5) * 0.55) * mix(0.3, 1.0, detail);
  float basin = smoothstep(60.0, 210.0, dA);   // = basinK(p)
  g *= uWaveStrength * 0.42 * mix(uMarinaK.x, 1.0, shelter) * mix(0.62, 1.0, basin);
  // fine cat's-paw ripples close to the camera are not damped: glassy, never dead flat
  g += (w4.xy - 0.5) * 0.45 * nearF * uWaveStrength * 0.42 * 0.85;
  // ripples bounced off the faces: crests parallel to the nearest face, running outward, gone within ~3 m
  float along = dot(p, vec2(-gs.z, gs.y));
  float ph1 = dS * 4.4 - uTime * 1.8 + sin(along * 0.62 + uTime * 0.55) * 0.9 + w2.z * 3.0;
  float ph2 = dS * 7.1 - uTime * 2.6 + sin(along * 1.25 - uTime * 0.45) * 0.8 + w1.z * 2.2;
  float lapA = uMarinaK.y * exp(-max(dS, 0.0) * 0.85) * smoothstep(-0.25, 0.1, dS) * (0.4 + 0.9 * w3.z);
  g += gs.yz * lapA * (0.055 * sin(ph1) + 0.03 * sin(ph2)) * detail;
  vec2 gRip = g;
  g += vSwellGrad;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float crest = (w1.z * 0.9 + w2.z * 0.5 + w3.z * 0.9) / 2.3;

  vec2 fuv = (p - uFoamRect.xy) * uFoamRect.zw;
  float inField = step(0.0, fuv.x) * step(fuv.x, 1.0) * step(0.0, fuv.y) * step(fuv.y, 1.0);
  float dObj = mix(uMarinaK.w, texture2D(uFoamTex, clamp(fuv, 0.0, 1.0)).r * uMarinaK.w, inField);

  // light: the shadow map (it covers every slab and hull here); no sky / sun under the floating slabs
  float shadow = getShadowMask();
  float under = smoothstep(0.0, -0.8, gd.x);
  float skyVis = mix(0.55, 1.0, smoothstep(-0.2, 3.0, dS)) * (1.0 - 0.9 * under);

  vec3 body = mix(uSeaDeep, uSeaShallow, clamp(0.4 + 0.5 * (w3.z - 0.5), 0.0, 1.0));
  body = mix(uChannelCol, body, 0.3 + 0.7 * shelter);
  body += uSeaCrest * smoothstep(0.55, 0.95, crest) * (0.3 + 0.7 * shadow) * 0.3 * mix(0.25, 1.0, detail) * shelter;
  float NdL = max(dot(N, uSunDir), 0.0);
  vec3 lit = body * (uSeaAmbient * skyVis + uSunLight * (0.35 + 0.65 * NdL) * shadow * 0.5);

  // reflection: sky + clouds, then the planar reflection of everything standing above the water
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyRefl(R);
  float occl = 0.0;
  if (uFarOn > 0.5) {
    vec4 fc = textureLod(uFarCube, R, clamp(log2(1.0 + dist * 0.008) + length(gRip) * 4.0, 0.0, 5.0));
    float fa = clamp(fc.a, 0.0, 1.0);
    refl = refl * (1.0 - fa) + fc.rgb;
    occl = fa;
  }
  refl *= skyVis;
  if (uReflOn > 0.5) {
    vec2 off = (N.xz - vSwellGrad * 0.5) * uMarinaK.z;
    vec4 rp = uReflMat * vec4(P.x + off.x, ${WATER_Y.toFixed(3)}, P.z + off.y, 1.0);
    vec2 ruv = rp.xy / max(rp.w, 1e-4);
    float lod = clamp(log2(1.0 + dist * 0.035) + length(gRip) * 5.0, 0.0, 4.5);
    vec4 rc = textureLod(uReflTex, clamp(ruv, 0.001, 0.999), lod);
    float ra = clamp(rc.a, 0.0, 1.0);   // coverage: anything additive in the mirror must never push it past 1
    refl = refl * (1.0 - ra) + rc.rgb;
    occl = max(occl, ra);
  }
  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float fres = min((0.025 + 0.975 * pow(1.0 - NdV, 5.0)) * 1.1, 1.0);
  vec3 col = mix(lit, refl, fres);
  col = mix(col, uShadeCol * (uSeaAmbient + 0.02), under * 0.85);

  // sun glints (blocked by shadows and by anything reflected in front of the sky)
  float rs = clamp(dot(R, uSunDir), 0.0, 1.0);
  float spec = pow(rs, 1600.0) * 9.0 + pow(rs, 200.0) * 0.38 + pow(rs, 24.0) * 0.04;
  col += uSunLight * spec * uSunSpec * shadow * (1.0 - under) * (1.0 - occl);

  // foam — calm harbour water: a thin, broken froth line where the water laps a hull or anything standing in it (the
  // contour field: piles, fenders, moored boats), a few drifting clumps, faint rings pushed off by the lapping
  float dC = min(gw.x, dObj);                       // nearest thing standing in the water
  if (dC < 1.2) {
    float fn = w2.z * 0.6 + w1.z * 0.4;
    // non-repeating value noise (the wave texture tiles every ~1 m at froth scale)
    float nA = vnoise2(p * 3.3 + uTime * vec2(0.13, -0.09));
    float nB = vnoise2(p * 0.8 + vec2(17.0, 3.0) - uTime * vec2(0.05, 0.03));
    float froth = nA * 0.55 + nB * 0.45;
    float contact = smoothstep(0.03 + 0.07 * nA, 0.0, dC) * (0.35 + 0.65 * smoothstep(0.3, 0.7, nB)) * smoothstep(-0.04, 0.0, gw.x);
    float clump = smoothstep(0.66, 0.86, froth) * smoothstep(0.7, 0.05, dC) * smoothstep(0.35, 0.8, nB);
    float lapF = smoothstep(0.05, 0.0, abs(fract(dC * 1.5 - uTime * 0.2 + fn * 0.4) - 0.5) - 0.46)
      * smoothstep(1.1, 0.1, dC) * smoothstep(0.4, 0.75, nB);
    float foam = clamp(contact * 0.7 + clump * 0.35 + lapF * 0.15, 0.0, 1.0) * (1.0 - 0.8 * under);
    vec3 foamCol = uFoamColor * (uSeaAmbient * 1.2 * skyVis + uSunLight * (0.3 + 0.7 * shadow) * 0.55);
    col = mix(col, foamCol, foam * detail);
  }

  col = applyHaze(col, P);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const SEA_VERT = /* glsl */`
#include <common>
#include <shadowmap_pars_vertex>
uniform float uTime;
${GLSL_DECK}
${GLSL_SWELL}
varying vec3 vWorld;
varying vec2 vSwellGrad;
varying float vDeckD;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  float dd = sdDeck(worldPosition.xz);
#ifdef MARINA
  dd = min(dd, sdWet(worldPosition.xz));
#endif
  float amp = swellAmp(dd);
#ifdef MARINA
  amp *= mix(0.45, 1.0, basinK(worldPosition.xz));
#endif
  vec2 g;
  float h = swell(worldPosition.xz, uTime, g);
  worldPosition.y += h * amp;
  vWorld = worldPosition.xyz;
  vSwellGrad = g * amp;
  vDeckD = dd;
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 transformedNormal = normalMatrix * vec3(0.0, 1.0, 0.0);
  #include <shadowmap_vertex>
  gl_Position = projectionMatrix * mvPosition;
}
`;

const SEA_FRAG = /* glsl */`
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
${GLSL_SKY_COMMON}
${GLSL_DECK}
uniform sampler2D uWaveTex;
uniform sampler2D uFoamTex;
uniform vec4 uFoamRect;
uniform vec3 uSeaDeep;
uniform vec3 uSeaShallow;
uniform vec3 uSeaCrest;
uniform vec3 uFoamColor;
uniform vec3 uSunLight;
uniform vec3 uSeaAmbient;
uniform float uSunSpec;
uniform float uWaveStrength;
varying vec3 vWorld;
varying vec2 vSwellGrad;
varying float vDeckD;

#ifdef MARINA
${GLSL_SEA_MARINA}
#else
void main() {
  vec3 P = vWorld;
  vec3 toCam = cameraPosition - P;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 p = P.xz;
  float detail = 1.0 - smoothstep(35.0, 380.0, dist);

  vec4 w1 = texture2D(uWaveTex, p * 0.041 + uTime * vec2(0.012, 0.007));
  vec4 w2 = texture2D(uWaveTex, p * 0.097 + vec2(0.37, 0.61) + uTime * vec2(-0.019, 0.013));
  vec4 w3 = texture2D(uWaveTex, p * 0.0083 + uTime * vec2(0.0034, -0.0022));
  float nearF = 1.0 - smoothstep(6.0, 40.0, dist);
  vec4 w4 = texture2D(uWaveTex, p * 0.29 + vec2(0.71, 0.13) + uTime * vec2(0.031, -0.026));
  vec2 g = (w3.xy - 0.5) * 0.9 + ((w1.xy - 0.5) * 0.85 + (w2.xy - 0.5) * 0.55) * mix(0.3, 1.0, detail) + (w4.xy - 0.5) * 0.45 * nearF;
  g = g * uWaveStrength * 0.42 + vSwellGrad;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float crest = (w1.z * 0.9 + w2.z * 0.5 + w3.z * 0.9) / 2.3;

  float dEdge = sdDeck(p);
  // the sea never shows through inside the arena footprint (e.g. dry-dock trenches below sea level)
  if (dEdge < -0.05) discard;
  vec2 fuv = (p - uFoamRect.xy) * uFoamRect.zw;
  float inField = step(0.0, fuv.x) * step(fuv.x, 1.0) * step(0.0, fuv.y) * step(fuv.y, 1.0);
  float dObj = mix(8.0, texture2D(uFoamTex, clamp(fuv, 0.0, 1.0)).r * 8.0, inField);

  // shadows: real shadow map (deck, walls, boats) + analytic deck-slab shadow as a fallback outside the shadow camera
  float sm = getShadowMask();
  vec2 q = p + uSunDir.xz * ((-0.6 - P.y) / max(uSunDir.y, 0.06));
  float ash = smoothstep(-0.2, 0.45, sdDeck(q));
  float shadow = min(sm, ash);
  float under = smoothstep(0.3, -2.4, dEdge);

  // body colour: turquoise shallows near the pier, deep blue further out; crests catch light
  float shallow = smoothstep(8.0, 0.5, dEdge) * (0.7 + 0.6 * (w3.z - 0.5));
  vec3 body = mix(uSeaDeep, uSeaShallow, clamp(shallow, 0.0, 1.0) * 0.6);
  body += uSeaCrest * smoothstep(0.55, 0.95, crest) * (0.3 + 0.7 * shadow) * 0.4 * mix(0.25, 1.0, detail);
  float NdL = max(dot(N, uSunDir), 0.0);
  vec3 lit = body * (uSeaAmbient + uSunLight * (0.4 + 0.6 * NdL) * shadow * 0.55);

  // reflection of the sky
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyGradient(normalize(R + vec3(0.0, 0.015, 0.0)));
  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.035 + 0.965 * pow(1.0 - NdV, 5.0);
  fres = min(fres * 1.1, 1.0);
  vec3 col = mix(lit, refl, fres * mix(1.0, 0.45, under));
  col *= mix(1.0, 0.2, under);

  // sun glint: broad sheen + tight sparkles from the fine normals
  float rs = clamp(dot(R, uSunDir), 0.0, 1.0);
  float spec = pow(rs, 1600.0) * 9.0 + pow(rs, 200.0) * 0.38 + pow(rs, 24.0) * 0.04;
  col += uSunLight * spec * uSunSpec * shadow * (1.0 - under);

  // foam: lapping band along the deck edge, rings around pilings / boats / buoys
  float fn = w2.z * 0.6 + w1.z * 0.4;
  float edgeF = smoothstep(0.75, 0.0, dEdge + (fn - 0.5) * 0.9) * smoothstep(-1.0, -0.2, dEdge);
  float lapPhase = fract(dEdge * 0.7 - uTime * 0.3);
  float lap = smoothstep(0.1, 0.0, abs(lapPhase - 0.5) - 0.4) * smoothstep(3.4, 0.5, dEdge) * step(0.0, dEdge);
  lap *= smoothstep(0.35, 0.7, fn + 0.15);
  float objF = smoothstep(0.55, 0.0, dObj + (fn - 0.5) * 0.45);
  objF += 0.45 * smoothstep(0.1, 0.0, abs(fract(dObj * 0.9 - uTime * 0.35) - 0.5) - 0.42) * smoothstep(2.2, 0.4, dObj) * smoothstep(0.35, 0.7, fn + 0.1);
  float foam = clamp(edgeF + lap * 0.5 + objF, 0.0, 1.0) * mix(1.0, 0.35, under);
  vec3 foamCol = uFoamColor * (uSeaAmbient * 1.3 + uSunLight * (0.35 + 0.65 * shadow) * 0.6);
  col = mix(col, foamCol, foam * detail);

  col = applyHaze(col, P);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
#endif
`;

// ---- scenery material patch (MeshStandardMaterial + sky haze + optional windows / waterline / gull flap) ----
const HZ_VERT_DECL = /* glsl */`
uniform float uTime;
attribute float glow;
varying float vGlow;
varying vec3 vHzWorld;
varying vec3 vHzNormal;
varying float vHzSeed;
#ifdef HZ_GULL
attribute float aPhase;
#endif
#ifdef HZ_CITY
attribute vec3 bld;
varying vec3 vBld;
#endif
`;
const HZ_VERT_BEGIN_GULL = /* glsl */`
#ifdef HZ_GULL
{
  float side = abs(transformed.x);
  float glide = 0.35 + 0.65 * smoothstep(-0.3, 0.6, sin(uTime * 0.55 + aPhase * 17.0));
  float flap = sin(uTime * 8.5 + aPhase * 6.2831);
  transformed.y += flap * glide * side * 0.62 * smoothstep(0.08, 0.35, side);
  transformed.y -= 0.12 * side * side;
}
#endif
`;
const HZ_VERT_WORLD = /* glsl */`
{
  vec4 hzW = vec4(transformed, 1.0);
  vec3 hzN = objectNormal;
  vHzSeed = 0.0;
#ifdef USE_INSTANCING
  hzW = instanceMatrix * hzW;
  hzN = mat3(instanceMatrix) * hzN;
  vHzSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
#endif
  hzW = modelMatrix * hzW;
  vHzWorld = hzW.xyz;
  vHzNormal = normalize(mat3(modelMatrix) * hzN);
  vGlow = glow;
#ifdef HZ_CITY
  vBld = bld;
#endif
}
`;
const HZ_FRAG_DECL = /* glsl */`
${GLSL_SKY_COMMON}
${GLSL_NOISE}
uniform vec4 uSnow;
#ifdef HZ_CITY
varying vec3 vBld;
float aaBand(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * smoothstep(b + w, b - w, x); }
float aaLine(float x, float hw, float w) { float d = min(x, 1.0 - x); return smoothstep(hw + w, hw - w, d); }
vec3 hzLitCol = vec3(0.0);
#endif
varying float vGlow;
varying vec3 vHzWorld;
varying vec3 vHzNormal;
varying float vHzSeed;
float hzWin = 0.0;
float hzLit = 0.0;
vec3 hzEmit = vec3(0.0);   // night lights: added after the haze so they punch through it (and bloom)
`;
const HZ_FRAG_COLOR = /* glsl */`
#ifdef HZ_CITY
{
  // facade styles (vBld.x): 0 solid, 1 punched windows w/ mullion, 2 ribbon bands, 3 curtain wall, 4 vertical piers, 5 bands only (round towers)
  vec3 wn = normalize(vHzNormal);
  float style = floor(vBld.x + 0.5);
  float seed = vBld.y;
  float v = vHzWorld.y - vBld.z;
  if (style > 0.5 && abs(wn.y) < 0.5) {
    vec2 tdir = normalize(vec2(-wn.z, wn.x));
    float u = dot(vHzWorld.xz, tdir) + seed * 37.0;
    float bay = style < 1.5 ? 3.3 : style < 2.5 ? 1.7 : style < 3.5 ? 1.5 : style < 4.5 ? 2.8 : 2.0;
    float flH = style < 2.5 ? 3.5 : 3.9;
    vec2 cell = vec2(u / bay, v / flH);
    vec2 f = fract(cell), id = floor(cell);
    vec2 fw = fwidth(cell);
    float far = smoothstep(0.22, 0.75, max(fw.x, fw.y));
    float glass = 0.0, mull = 0.0, avg = 0.5;
    if (style < 1.5) {
      glass = aaBand(f.x, 0.2, 0.8, fw.x) * aaBand(f.y, 0.27, 0.86, fw.y);
      mull = aaBand(f.x, 0.485, 0.515, fw.x) * glass;
      avg = 0.6 * 0.59;
    } else if (style < 2.5) {
      glass = aaBand(f.y, 0.3, 0.9, fw.y);
      mull = aaLine(f.x, 0.04, fw.x) * glass;
      avg = 0.58;
    } else if (style < 3.5) {
      glass = 1.0;
      mull = max(aaLine(f.x, 0.035, fw.x), aaLine(f.y, 0.05, fw.y) * 0.8);
      avg = 0.86;
    } else if (style < 4.5) {
      glass = aaBand(f.x, 0.32, 0.92, fw.x) * aaBand(f.y, 0.06, 0.97, fw.y);
      mull = aaLine(f.y, 0.04, fw.y) * glass;
      avg = 0.52;
    } else {
      glass = aaBand(f.y, 0.36, 0.9, fw.y);
      avg = 0.54;
    }
    glass = mix(glass * (1.0 - mull), avg, far);
    // ground-floor storefront band, and no glass right at the roofline
    glass = mix(glass, 0.75 * smoothstep(0.5, 0.9, v), 1.0 - smoothstep(3.6, 4.2, v));
    float r = hash12(id + seed * 113.0);
    vec3 gcol = mix(vec3(0.11, 0.16, 0.23), vec3(0.2, 0.27, 0.33), r);                 // blinds / interiors vary per window
    if (style > 2.5 && style < 3.5) gcol = mix(vec3(0.24, 0.37, 0.47), vec3(0.34, 0.47, 0.55), r * 0.7) * mix(0.9, 1.08, fract(seed * 7.1));
    gcol = mix(gcol, vec3(0.22, 0.29, 0.36), far);
    diffuseColor.rgb = mix(diffuseColor.rgb, gcol, glass);
    diffuseColor.rgb *= 1.0 - mull * 0.3 * (1.0 - far);
    // floor-line grooves on the solid parts
    diffuseColor.rgb *= 1.0 - 0.07 * aaLine(f.y, 0.025, fw.y) * (1.0 - glass) * (1.0 - far);
    hzWin = glass;
    float lit = step(r, style > 2.5 && style < 3.5 ? 0.34 : 0.44);
    lit = mix(lit, 0.38, far);
    vec3 lc = mix(vec3(1.0, 0.72, 0.4), vec3(0.8, 0.88, 1.0), step(0.78, hash12(id * 1.7 + seed)));
    hzLitCol = lc * lit * glass;
  }
}
#endif
#ifdef HZ_TERRAIN
{
  // stylised hills: meadow grass on gentle slopes, clumpy woodland canopy, warm dry meadows on the tops, layered rock on
  // steep faces, a sand + wet-sand beach line at the shore; vGlow carries baked fold AO
  vec3 wn = normalize(vHzNormal);
  float hgt = vHzWorld.y - ${WATER_Y.toFixed(3)};
  vec2 tp = vHzWorld.xz;
  float n1 = fbm2(tp * 0.011);
  float n2 = vnoise2(tp * 0.05) * 0.6 + vnoise2(tp * 0.17) * 0.4;
  float nt = vnoise2(tp * 0.3) * 0.55 + vnoise2(tp * 0.83 + 7.0) * 0.45;
  vec3 tint = diffuseColor.rgb;
  float slope = 1.0 - wn.y;
  vec3 grass = tint * mix(0.9, 1.08, n1);
  float wood = smoothstep(0.47, 0.62, n1 + (n2 - 0.5) * 0.3) * smoothstep(0.62, 0.3, slope) * smoothstep(1.5, 5.0, hgt);
  vec3 canopy = tint * vec3(0.5, 0.66, 0.52) * mix(0.68, 1.14, smoothstep(0.3, 0.78, nt));
  grass = mix(grass, canopy, wood * 0.92);
  grass = mix(grass, tint * vec3(1.12, 1.06, 0.8), smoothstep(0.34, 0.12, n1) * (1.0 - wood) * 0.5);
  vec3 rock = vec3(0.56, 0.55, 0.51) * (0.82 + 0.3 * n2);
  rock *= 0.9 + 0.1 * sin(vHzWorld.y * 0.85 + n2 * 5.0);
  float rockM = smoothstep(0.34, 0.54, slope + (n2 - 0.5) * 0.2) * 0.88;
  vec3 sand = vec3(0.95, 0.88, 0.72) * (0.95 + 0.08 * n2);
  float sandM = smoothstep(1.6, 0.6, hgt + (n1 - 0.5) * 1.6);
  vec3 c = mix(grass, rock, rockM);
  c = mix(c, sand, sandM);
  c = mix(c, sand * vec3(0.72, 0.7, 0.66), smoothstep(0.45, 0.1, hgt) * sandM);
  // stage looks: snow above the snow line (ragged by noise) and a dusting everywhere (cover), never on the steepest rock
  float snowM = max(smoothstep(uSnow.x - 6.0, uSnow.x + 6.0, hgt + (n1 - 0.5) * 22.0 + (n2 - 0.5) * 6.0), uSnow.y * smoothstep(0.3, 0.7, n2 + 0.35));
  snowM *= smoothstep(0.72, 0.42, slope + (n2 - 0.5) * 0.25);
  c = mix(c, vec3(0.93, 0.95, 0.99) * (0.94 + 0.08 * nt), snowM);
  diffuseColor.rgb = c * vGlow;
}
#endif
#ifdef HZ_WATERLINE
{
  float wl = vHzWorld.y - ${WATER_Y.toFixed(3)};
  diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.0, 0.45, wl));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.27, 0.18), smoothstep(0.3, 0.0, wl) * 0.55);
}
#endif
#ifdef HZ_SHORE
{
  float wl = vHzWorld.y - ${WATER_Y.toFixed(3)};
  float wob = 0.12 * sin(uTime * 1.2 + vHzWorld.x * 0.21 + vHzWorld.z * 0.17);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 0.98), smoothstep(0.45, 0.05, abs(wl - 0.12 - wob)) * 0.85);
}
#endif
`;
const HZ_FRAG_ROUGH = /* glsl */`
#ifdef HZ_CITY
roughnessFactor = mix(roughnessFactor, 0.14, hzWin);
#endif
`;
const HZ_FRAG_EMISSIVE = /* glsl */`
{
  float blink = step(0.55, fract(uTime * 0.7 + vHzWorld.x * 0.013 + vHzWorld.z * 0.007));
#ifndef HZ_TERRAIN
  float gAmt = vGlow > 1.5 ? blink * 1.5 : vGlow;
  hzEmit += vColor.rgb * gAmt * (vGlow > 1.5 ? max(uNight, 0.35) : uNight) * 7.0;
#endif
#ifdef HZ_CITY
  hzEmit += uNight * hzLitCol * 1.5;   // warm lit windows, not white: 3.0 blew them out through the tone curve
#endif
#ifdef HZ_WATERLINE
  float wl2 = vHzWorld.y - ${WATER_Y.toFixed(3)};
  vec2 cq = vHzWorld.xz * 1.7 + vec2(vHzWorld.y * 2.3, 0.0);
  float cz = sin(cq.x + uTime * 1.3 + sin(cq.y * 1.3 + uTime * 0.9) * 1.6) * sin(cq.y * 1.1 - uTime * 1.1 + sin(cq.x * 0.9 - uTime * 0.7) * 1.4);
  float side = 1.0 - abs(normalize(vHzNormal).y);
  totalEmissiveRadiance += uGlowColor * 0.07 * side * smoothstep(0.45, 0.95, cz) * smoothstep(1.1, 0.15, wl2) * step(0.0, wl2);
#endif
}
`;
const HZ_FRAG_HAZE = /* glsl */`
#include <opaque_fragment>
#ifdef HZ_CITY
{
  // glass reflects the sky gradient (grazing angles → mirror-bright), so towers pick up the sky's colours
  vec3 wn2 = normalize(vHzNormal);
  vec3 V = normalize(vHzWorld - cameraPosition);
  vec3 Rr = reflect(V, wn2);
  float fres = 0.05 + 0.95 * pow(1.0 - clamp(dot(-V, wn2), 0.0, 1.0), 5.0);
  vec3 refl = min(skyGradient(normalize(vec3(Rr.x, max(Rr.y, 0.02), Rr.z))), vec3(1.1));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, refl * mix(0.92, 0.55, uNight), hzWin * clamp(0.18 + fres * 0.75, 0.0, 0.85) * (1.0 - uNight * 0.75));
  // dusk: the skyline across the bay settles a stop darker so its lit windows carry it (was one flat salmon glow)
  gl_FragColor.rgb *= 1.0 - 0.38 * uNight;
}
#endif
gl_FragColor.rgb = applyHaze(gl_FragColor.rgb, vHzWorld) + hzEmit * exp(-length(vHzWorld - cameraPosition) * uHaze.x * 0.35);
`;

// ---- marina waterline strips -------------------------------------------------------------------------------------
// Thin quads 1.2 cm proud of every level face that stands in / just over the water (slab fascias, hull sides, slab
// undersides). One pass does two things with blend (ONE, SRC_ALPHA) → out = src.rgb + dst * src.a:
//   rgb = reflected-sun caustics: the moving filament network at the water spot whose mirror-reflected sunlight lands on
//         this point (looked up in the shadow map there — no light from shaded water), weighted by how squarely the
//         face meets that reflected light, softened with height; tinted by the face albedo
//   a   = wet band on hulls: darker just above the bobbing waterline, freshest right at the line
const STRIP_VERT = /* glsl */`
#include <common>
#include <shadowmap_pars_vertex>
uniform vec3 uSunDir;
attribute vec4 aInfo;        // rgb = face albedo (linear), a = kind (0 slab fascia / underside, 1 hull in the water)
varying vec3 vP;
varying vec3 vPw;
varying vec3 vN;
varying vec4 vInfo;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vInfo = aInfo;
  float h = max(wp.y - ${WATER_Y.toFixed(3)}, 0.0);
  vec2 k = uSunDir.xz / max(uSunDir.y, 0.08);
  vPw = vec3(wp.x + k.x * h, ${WATER_Y.toFixed(3)}, wp.z + k.y * h);
  vec4 worldPosition = vec4(vPw, 1.0);
  vec4 mvPosition = viewMatrix * wp;
  vec3 transformedNormal = normalMatrix * vec3(0.0, 1.0, 0.0);
  #include <shadowmap_vertex>
  gl_Position = projectionMatrix * mvPosition;
}
`;
const STRIP_FRAG = /* glsl */`
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunLight;
uniform vec4 uStripK;      // x caustic strength, y wet-band darkening
varying vec3 vP;
varying vec3 vPw;
varying vec3 vN;
varying vec4 vInfo;
vec2 hash22s(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
// distance to the nearest cell border of a jittered grid whose points wander (F2 − F1): 0 on the borders
float cellEdge(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 h = hash22s(i + g);
    vec2 o = 0.5 + 0.4 * sin(t * (0.7 + 0.6 * h) + 6.2831 * h.yx);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return d2 - d1;
}
// focused-light network of a rippled surface (mean ≈ 1)
float caustic(vec2 p, float t, float blur) {
  vec2 w = p + 0.3 * vec2(sin(p.y * 1.1 + t * 0.8), sin(p.x * 0.9 - t * 0.7));
  float c1 = 1.0 - smoothstep(0.0, 0.08 + blur, cellEdge(w * 2.2, t * 1.2));
  float c2 = 1.0 - smoothstep(0.0, 0.08 + blur * 1.4, cellEdge(w * 3.3 + 7.3, t * 1.5));
  return (c1 * 0.8 + c2 * 0.5 + c1 * c2 * 1.4) * 2.4;
}
float swellH(vec2 p, float t) {
  return 0.45 * sin(dot(p, vec2(0.110, 0.047)) + t * 0.95) + 0.35 * sin(dot(p, vec2(-0.052, 0.097)) + t * 1.13 + 1.7) + 0.20 * sin(dot(p, vec2(0.173, -0.141)) + t * 1.61 + 4.1);
}
void main() {
  vec3 n = normalize(vN);
  float h = vP.y - ${WATER_Y.toFixed(3)};
  // cosine between the face and the light bouncing up off the water (away from the sun)
  float facing = max(dot(n, vec3(uSunDir.x, -uSunDir.y, uSunDir.z)), 0.0);
  vec3 add = vec3(0.0);
  if (facing > 0.002) {
    float lit = getShadowMask();
    if (lit > 0.002) {
      float c = caustic(vPw.xz, uTime, 0.02 + max(h, 0.0) * 0.1);
      float fall = exp(-max(h, 0.0) * 0.8) * smoothstep(-0.02, 0.05, h);
      vec3 alb = max(vInfo.rgb, vec3(0.12));
      add = uSunLight * alb * (c * 0.06) * facing * lit * fall * uStripK.x;
    }
  }
  float mul = 1.0;
  if (vInfo.a > 0.5) {
    // hull in the water: the line bobs with the swell; a dark wet band above it, freshest right at the line
    float wl = ${WATER_Y.toFixed(3)} + 0.035 * swellH(vP.xz, uTime) + 0.018 * sin(uTime * 1.7 + (vP.x + vP.z) * 1.3);
    float top = 0.22 + 0.07 * sin(vP.x * 1.7 + vP.z * 1.3) + 0.04 * sin(vP.x * 5.1 - vP.z * 4.3);
    float band = smoothstep(wl + top, wl + top - 0.14, vP.y);
    float fresh = smoothstep(wl + 0.05, wl + 0.004, vP.y);
    mul = 1.0 - uStripK.y * (0.75 * band + 0.25 * fresh);
    add *= 1.0 - 0.5 * band;
  }
  gl_FragColor = vec4(add, mul);
}
`;

function patchScenery(mat, U, flags = {}) {
  const defs = [];
  if (flags.city) defs.push('HZ_CITY');
  if (flags.terrain) defs.push('HZ_TERRAIN');
  if (flags.waterline) defs.push('HZ_WATERLINE');
  if (flags.shore) defs.push('HZ_SHORE');
  if (flags.gull) defs.push('HZ_GULL');
  mat.defines = mat.defines || {};
  for (const d of defs) mat.defines[d] = '';
  mat.fog = false;
  mat.onBeforeCompile = (sh) => {
    for (const k of ['uTime', 'uSunDir', 'uZenith', 'uSkyMid', 'uHorizon', 'uGround', 'uHorizonGlow', 'uGlowColor', 'uGlowParams', 'uHaze', 'uNight', 'uSnow']) sh.uniforms[k] = U[k];
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + HZ_VERT_DECL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + HZ_VERT_BEGIN_GULL)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + HZ_VERT_WORLD);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HZ_FRAG_DECL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + HZ_FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + HZ_FRAG_ROUGH)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + HZ_FRAG_EMISSIVE)
      .replace('#include <opaque_fragment>', HZ_FRAG_HAZE);
  };
  mat.customProgramCacheKey = () => 'inkwave-env:' + defs.join(',');
  return mat;
}

// ---------------------------------------------------------------------------------------------------------------
// JS helpers: seeded rng, value noise, geometry builders
// ---------------------------------------------------------------------------------------------------------------
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, oct = 4) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x, y); n += a; x = x * 2.03 + 5.3; y = y * 2.03 - 1.7; a *= 0.5; } return s / n; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const polar = (deg, d) => [Math.cos(deg * DEG) * d, Math.sin(deg * DEG) * d];

// ---- oriented deck rects (footprint / marina deck + wet sets) -------------------------------------------------
// { cx, cz, hx, hz, ax, az, minX, maxX, minZ, maxZ, aligned }: centre, half extents along the local axes, local x axis
// (ax, az) (unit), local z = (−az, ax), plus the XZ AABB. `aligned` rects keep their exact min/max and take the exact
// axis-aligned code paths below (so axis-aligned stages build exactly what they always did). Accepts a legacy
// {minX..maxZ} rect, an oriented {cx,cz,hx,hz,ax,az} one, or both; extra fields (y0, y1 …) are kept.
function orect(r) {
  if (r.hx === undefined) return { ...r, cx: (r.minX + r.maxX) / 2, cz: (r.minZ + r.maxZ) / 2, hx: (r.maxX - r.minX) / 2, hz: (r.maxZ - r.minZ) / 2, ax: 1, az: 0, aligned: true };
  let ax = r.ax ?? 1, az = r.az ?? 0, hx = r.hx, hz = r.hz;
  const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
  // quarter turns are axis-aligned rects (swap the extents for 90° / 270°)
  if (Math.abs(az) < 1e-7) { ax = 1; az = 0; } else if (Math.abs(ax) < 1e-7) { ax = 1; az = 0; [hx, hz] = [hz, hx]; }
  const aligned = ax === 1 && az === 0;
  const o = { ...r, hx, hz, ax, az, aligned };
  if (!(aligned && r.minX !== undefined)) {
    const ex = Math.abs(ax) * hx + Math.abs(az) * hz, ez = Math.abs(az) * hx + Math.abs(ax) * hz;
    o.minX = r.cx - ex; o.maxX = r.cx + ex; o.minZ = r.cz - ez; o.maxZ = r.cz + ez;
  }
  return o;
}
// a level block as a deck rect (null for ramps / anything tilted: only boxes turned about Y qualify)
function blockRect(b) {
  if (b.aligned) return orect({ minX: b.aabbMin.x, maxX: b.aabbMax.x, minZ: b.aabbMin.z, maxZ: b.aabbMax.z });
  if (Math.abs(b.axes[1].y) < 0.9999) return null;
  return orect({ cx: b.center.x, cz: b.center.z, hx: b.half.x, hz: b.half.z, ax: b.axes[0].x, az: b.axes[0].z });
}
// point strictly inside rect r grown by pad
function inRect(r, x, z, pad = 0) {
  if (r.aligned) return x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;
  const dx = x - r.cx, dz = z - r.cz;
  return Math.abs(dx * r.ax + dz * r.az) < r.hx + pad && Math.abs(dz * r.ax - dx * r.az) < r.hz + pad;
}
// signed distance (m) from (x, z) to rect r (matches sdORect in the sea shaders)
function sdRectJS(r, x, z) {
  const dx = x - r.cx, dz = z - r.cz;
  const qx = Math.abs(dx * r.ax + dz * r.az) - r.hx, qz = Math.abs(dz * r.ax - dx * r.az) - r.hz;
  return qx > 0 || qz > 0 ? Math.sqrt((qx > 0 ? qx * qx : 0) + (qz > 0 ? qz * qz : 0)) : Math.max(qx, qz);
}
// world (x, z) of the rect-local point (lx, lz)
const rectPt = (r, lx, lz) => [r.cx + lx * r.ax - lz * r.az, r.cz + lx * r.az + lz * r.ax];
// the four edges, counter-clockwise from the (−x, −z) corner, with outward unit normals: aligned rects keep the
// exact min/max corners and (0, ±1) / (±1, 0) normals
function rectEdges(r) {
  let c, n;
  if (r.aligned) {
    c = [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]];
    n = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  } else {
    c = [rectPt(r, -r.hx, -r.hz), rectPt(r, r.hx, -r.hz), rectPt(r, r.hx, r.hz), rectPt(r, -r.hx, r.hz)];
    n = [[r.az, -r.ax], [r.ax, r.az], [-r.az, r.ax], [-r.ax, -r.az]];
  }
  return c.map((p, i) => ({ ax: p[0], az: p[1], bx: c[(i + 1) & 3][0], bz: c[(i + 1) & 3][1], nx: n[i][0] + 0, nz: n[i][1] + 0 }));
}

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
// planar-reflection scratch
const _rv = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _rv2 = new THREE.Vector2(), _rv4 = [new THREE.Vector4(), new THREE.Vector4()], _rPlane = new THREE.Plane(), _rCol = new THREE.Color();
const _bb = new THREE.Box3(), _ident = new THREE.Matrix4();

// Normalise any geometry to non-indexed {position, normal, color, glow} so everything can be merged.
function prep(geo, hex = '#ffffff', glow = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color' && k !== 'glow') g.deleteAttribute(k);
  g.clearGroups();
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.color) {
    const c = new THREE.Color(hex);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  if (!g.attributes.glow) g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
  return g;
}
function xf(g, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  g.applyMatrix4(_m4); return g;
}
const box = (w, h, d, hex, glow) => prep(new THREE.BoxGeometry(w, h, d), hex, glow);
const cyl = (rt, rb, h, seg, hex, glow, open = false) => prep(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), hex, glow);
const sph = (r, ws, hs, hex, glow) => prep(new THREE.SphereGeometry(r, ws, hs), hex, glow);
function beam(ax, ay, az, bx, by, bz, t, hex, glow = 0) { // square beam between two points
  const dx = bx - ax, dy = by - ay, dz = bz - az; const L = Math.hypot(dx, dy, dz);
  const g = box(t, L, t, hex, glow);
  _q.setFromUnitVectors(_v.set(0, 1, 0), _s.set(dx / L, dy / L, dz / L));
  _m4.compose(_v.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(1, 1, 1));
  g.applyMatrix4(_m4); return g;
}
function tube(points, r, hex, seg = 4, glow = 0) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return prep(new THREE.TubeGeometry(curve, Math.max(4, Math.round(points.length * 1.2)), r, seg, false), hex, glow);
}
function sag(a, b, s, n = 12) { // catenary-ish rope points
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - s * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]); }
  return pts;
}
function triGeo(verts, hex, doubleSided = true, glow = 0) { // verts: flat array of xyz triangles
  const arr = doubleSided ? new Float32Array(verts.length * 2) : new Float32Array(verts);
  if (doubleSided) {
    arr.set(verts, 0);
    for (let i = 0; i < verts.length; i += 9) { // reversed copy
      arr.set([verts[i], verts[i + 1], verts[i + 2], verts[i + 6], verts[i + 7], verts[i + 8], verts[i + 3], verts[i + 4], verts[i + 5]], verts.length + i);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); g.computeVertexNormals();
  return prep(g, hex, glow);
}
function vcolorBy(g, fn) { // recolour vertices: fn(x,y,z,nx,ny,nz) -> THREE.Color|null
  const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) { const col = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); if (col) c.setXYZ(i, col.r, col.g, col.b); }
  return g;
}

// Tileable wave normal/height texture from integer-frequency sine sums (perfectly periodic).
function makeWaveTexture(size = 256, seed = 11) {
  const rnd = mulberry(seed);
  const waves = [];
  const wind = 0.55;
  for (let i = 0; i < 44; i++) {
    const f = 2 + Math.pow(rnd(), 1.5) * 26;
    const ang = wind + (rnd() - 0.5) * 2.4;
    let kx = Math.round(Math.cos(ang) * f), ky = Math.round(Math.sin(ang) * f);
    if (kx === 0 && ky === 0) kx = 2;
    const kl = Math.hypot(kx, ky);
    waves.push([kx, ky, 1 / Math.pow(kl, 1.3), rnd() * Math.PI * 2]);
  }
  const N = size * size;
  const H = new Float32Array(N), GX = new Float32Array(N), GY = new Float32Array(N);
  let hMin = Infinity, hMax = -Infinity, gMax = 0;
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let h = 0, gx = 0, gy = 0;
      for (let k = 0; k < waves.length; k++) {
        const w = waves[k];
        const ph = TAU * (w[0] * u + w[1] * v) + w[3];
        const s = Math.sin(ph), c = Math.cos(ph);
        h += w[2] * s; gx += w[2] * w[0] * c; gy += w[2] * w[1] * c;
      }
      const i = y * size + x;
      H[i] = h; GX[i] = gx; GY[i] = gy;
      if (h < hMin) hMin = h; if (h > hMax) hMax = h;
      gMax = Math.max(gMax, Math.abs(gx), Math.abs(gy));
    }
  }
  const data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const hn = (H[i] - hMin) / (hMax - hMin);
    data[i * 4] = Math.round((GX[i] / gMax * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((GY[i] / gMax * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round(Math.pow(hn, 1.8) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Lofted boat hull (bow at +z). Returns prepared geometry with vertex colours.
function hullGeo({ L, B, D, F, sheer = 0.3, hull = '#ffffff', stripe = '#3c6e8f', bottom = '#c75c52', deck = '#d9c7a6' }) {
  const NS = 14, NP = 5;
  const secs = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const z = (t - 0.5) * L;
    let w;
    if (t < 0.55) w = 0.5 * B * (0.82 + 0.18 * Math.sin((t / 0.55) * Math.PI / 2));
    else { const u = (t - 0.55) / 0.45; w = 0.5 * B * Math.sqrt(Math.max(0, 1 - u * u * 0.995)); }
    const keel = -D * (t < 0.62 ? 1 : 1 - 0.8 * Math.pow((t - 0.62) / 0.38, 1.4));
    const top = F + sheer * t * t;
    const pts = [];
    for (let j = -NP; j <= NP; j++) {
      const s = Math.abs(j) / NP;
      const x = Math.sign(j) * w * Math.pow(Math.sin(s * Math.PI / 2), 0.75);
      const y = keel + (top - keel) * (1 - Math.cos(s * Math.PI / 2));
      pts.push([x, y, z]);
    }
    secs.push({ pts, top, z, w });
  }
  const pos = [];
  const pushTri = (a, b, c, refY) => {
    // orient outward: normal should point away from the hull centreline (0, refY, z)
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz;
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
    if (nx * cx + ny * (cy - refY) < 0) pos.push(...a, ...c, ...b); else pos.push(...a, ...b, ...c);
  };
  for (let i = 0; i < NS; i++) {
    const A = secs[i].pts, Bp = secs[i + 1].pts;
    const refY = (secs[i].top) * 0.7;
    for (let j = 0; j < A.length - 1; j++) {
      pushTri(A[j], A[j + 1], Bp[j + 1], refY);
      pushTri(A[j], Bp[j + 1], Bp[j], refY);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  prep(g, hull);
  const cH = new THREE.Color(hull), cS = new THREE.Color(stripe), cB = new THREE.Color(bottom), cK = new THREE.Color('#2b3440');
  vcolorBy(g, (x, y, z) => {
    const i = Math.min(NS, Math.max(0, Math.round((z / L + 0.5) * NS)));
    const top = secs[i].top;
    if (y < 0.02) return cB;
    if (y < 0.12) return cK;
    if (y > top - 0.2) return cS;
    return cH;
  });
  // deck + transom
  const parts = [g];
  const dv = [];
  for (let i = 0; i < NS; i++) {
    const a = secs[i], b = secs[i + 1];
    const yA = a.top - 0.14, yB = b.top - 0.14;
    const la = [-a.w * 0.96, yA, a.z], ra = [a.w * 0.96, yA, a.z], lb = [-b.w * 0.96, yB, b.z], rb = [b.w * 0.96, yB, b.z];
    dv.push(...la, ...rb, ...ra, ...la, ...lb, ...rb);
  }
  parts.push(triGeo(dv, deck, false));
  const st = secs[0].pts; const tv = [];
  const cy = (st[0][1] + st[NP][1]) * 0.5; const sz = secs[0].z;
  for (let j = 0; j < st.length - 1; j++) tv.push(0, cy, sz, ...st[j + 1], ...st[j]);
  parts.push(triGeo(tv, hull, true));
  return mergeGeometries(parts);
}

// Smooth stylised island/hill (indexed radial grid → soft normals). Vertex colour = grass tint, 'glow' = baked fold AO
// (the HZ_TERRAIN shader does grass/rock/sand by slope + height). Returns { geo, heightAt, localF, sample }.
function makeIsland(o) {
  const { x: cx, z: cz, rx, rz, h, seed = 1, rot = 0, plateau = false, R = 12, S = 44, grass = '#9ccf7f', ridge = 0.3 } = o;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const hLocal = (lx, lz) => {
    const r = Math.hypot(lx, lz);
    const a = Math.atan2(lz, lx);
    const edge = 1 + (fbm(Math.cos(a) * 1.2 + seed * 3.7, Math.sin(a) * 1.2 - seed * 1.9, 3) - 0.5) * 0.34;
    const f = r / edge;
    if (f >= 1) return -(f - 1) * 30 - 0.6;
    const n = fbm(lx * 1.15 + seed * 5.1, lz * 1.15 - seed * 2.3, 4);
    if (plateau) return h * smooth(1.0, 0.8, f) * (0.92 + 0.16 * n) + (1 - f) * 0.6 - 0.35;
    // rounded ridgelines: smooth |x| keeps crests soft (stylised, no knife edges), gentle spurs down the flanks
    const q = 2 * fbm(lx * 1.7 + seed * 1.7, lz * 1.7 - seed * 0.9, 3) - 1;
    const rg = 1 - Math.sqrt(q * q + 0.035);
    const prof = Math.pow(1 - f * f, 1.35);
    return h * prof * (0.52 + 0.6 * n + ridge * rg * rg) + (1 - f) * 0.6 - 0.35;
  };
  const toLocal = (wx, wz) => { const dx = wx - cx, dz = wz - cz; return [(dx * cr + dz * sr) / rx, (-dx * sr + dz * cr) / rz]; };
  const toWorld = (lx, lz) => [cx + lx * rx * cr - lz * rz * sr, cz + lx * rx * sr + lz * rz * cr];
  const pos = [], col = [], ao = [], idx = [], nor = [];
  const tint = new THREE.Color(grass);
  const dl = 0.05;
  // smooth analytic normals from the height field (never the mesh facets)
  const eW = Math.max(rx, rz) * 0.012;
  const hW = (wx, wz) => { const [lx, lz] = toLocal(wx, wz); return hLocal(lx, lz); };
  const push = (lx, lz, yOverride) => {
    const [wx, wz] = toWorld(lx, lz);
    const hy = yOverride ?? hLocal(lx, lz);
    pos.push(wx, WATER_Y + hy, wz);
    if (yOverride !== undefined) nor.push(0, 1, 0);
    else {
      const gx = (hW(wx + eW, wz) - hW(wx - eW, wz)) / (2 * eW), gz = (hW(wx, wz + eW) - hW(wx, wz - eW)) / (2 * eW);
      const il = 1 / Math.hypot(gx, 1, gz);
      nor.push(-gx * il, il, -gz * il);
    }
    const tv = 0.94 + 0.12 * hash2(Math.round(wx), Math.round(wz));
    col.push(tint.r * tv, tint.g * tv, tint.b * tv);
    // fold AO from the local height laplacian (concave → darker)
    const lap = (hLocal(lx + dl, lz) + hLocal(lx - dl, lz) + hLocal(lx, lz + dl) + hLocal(lx, lz - dl)) / 4 - hy;
    ao.push(yOverride !== undefined ? 1 : 1 - Math.min(1, Math.max(0, lap / (0.02 * h + 0.4))) * 0.42);
  };
  push(0, 0);
  const rings = R + 2;
  for (let k = 1; k < rings; k++) {
    const f = k === rings - 1 ? 1.4 : (k / R) * 1.1;
    for (let sI = 0; sI < S; sI++) {
      const a = (sI / S) * Math.PI * 2;
      push(Math.cos(a) * f, Math.sin(a) * f, k === rings - 1 ? -6 : undefined);
    }
  }
  const ring = (k, sI) => 1 + (k - 1) * S + ((sI + S) % S);
  for (let sI = 0; sI < S; sI++) idx.push(0, ring(1, sI + 1), ring(1, sI));
  for (let k = 1; k < rings - 1; k++) {
    for (let sI = 0; sI < S; sI++) {
      const a = ring(k, sI), b = ring(k, sI + 1), c = ring(k + 1, sI + 1), d = ring(k + 1, sI);
      idx.push(a, c, d, a, b, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('glow', new THREE.Float32BufferAttribute(ao, 1));
  g.setIndex(idx);
  return {
    geo: prep(g),
    heightAt: (wx, wz) => { const [lx, lz] = toLocal(wx, wz); return WATER_Y + hLocal(lx, lz); },
    localF: (wx, wz) => { const [lx, lz] = toLocal(wx, wz); return Math.hypot(lx, lz); },
    sample: (rnd, maxF = 0.8) => { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * maxF; return toWorld(Math.cos(a) * r, Math.sin(a) * r); },
  };
}

// transparent stage looks stay out of override passes (GTAO normals / depth): see _buildStageLook
function aoGate(renderer, scene, camera, geometry) { geometry.drawRange.count = scene.overrideMaterial ? 0 : Infinity; }

// Far-scenery builders for a stage's own backdrop (layout.env.backdrop — see the top of this file). Every geometry is
// vertex-coloured (prep) and merged by the environment into a few meshes; `glow` 1 = a lamp lit at dusk, 2 = blinking.
export const SCENERY_KIT = { box, cyl, sph, prep, xf, beam, tube, sag, triGeo, vcolorBy, hullGeo, makeIsland, mulberry, hash2, fbm, vnoise, smooth, polar, DEG, WATER_Y };

// ---------------------------------------------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------------------------------------------
export class Environment {
  static get THEMES() { return THEMES; }   // audit / lab hook: tweak a theme live, then setTheme(name)
  constructor(renderer, scene, opts = {}) {
    this.renderer = renderer;
    this.scene = scene;
    const b = opts.bounds || { minX: -25, maxX: 25, minZ: -44, maxZ: 44 };
    this.bounds = { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
    this.footprint = (opts.footprint && opts.footprint.length ? opts.footprint : [this.bounds]).map(orect);
    this.shadowSize = opts.shadowSize || 4096;
    this.waterY = WATER_Y;
    this.time = 0;
    this.theme = null;
    this.envMap = null;
    this.fogColor = new THREE.Color();
    this._envRT = null;

    this.root = new THREE.Group();
    this.root.name = 'Environment';
    scene.add(this.root);
    // marina water mode follows the STAGE (Halyard, by day or at dusk): level-derived hull / slab sets, waterline
    // strips, planar reflections, and no generic dock kit (the stage dresses its own pier edges and moored boats).
    // The theme only supplies its look (THEMES[*].marina).
    this._marina = this._stageMarina();
    this._frameId = 0;
    this.reflections = true;   // marina planar reflections (perf lever; low quality turns them off regardless)

    this._initUniforms();
    this._buildLights();
    this._buildSky();
    this._buildSea();
    this._buildDock();
    this._buildScenery();
    this._buildLife();
    this._groupBay();
    this._buildStageLook();
    scene.fog = new THREE.Fog(this.fogColor, 70, 1500);
    this.setTheme(opts.theme || 'day');
  }

  // ------------------------------------------------------------------ uniforms
  _initUniforms() {
    const V3 = () => ({ value: new THREE.Vector3() });
    const C = () => ({ value: new THREE.Color() });
    this.U = {
      uTime: { value: 0 }, uSunDir: V3(),
      uZenith: C(), uSkyMid: C(), uHorizon: C(), uGround: C(), uHorizonGlow: C(), uGlowColor: C(),
      uGlowParams: { value: new THREE.Vector4() }, uHaze: { value: new THREE.Vector4() }, uNight: { value: 0 },
      uSunDisk: C(), uSunCos: { value: 0.9998 }, uCloudLit: C(), uCloudShade: C(), uCloudParams: { value: new THREE.Vector4() },
      uRects: { value: Array.from({ length: MAX_RECTS }, () => new THREE.Vector4()) }, uRectCount: { value: 0 },
      uRectAx: { value: Array.from({ length: MAX_RECTS }, () => new THREE.Vector2(1, 0)) },
      uWaveTex: { value: null }, uFoamTex: { value: null }, uFoamRect: { value: new THREE.Vector4() },
      uSeaDeep: C(), uSeaShallow: C(), uSeaCrest: C(), uFoamColor: C(), uSunLight: C(), uSeaAmbient: C(),
      uSunSpec: { value: 1 }, uWaveStrength: { value: 1 },
      uCloudTex: { value: null },
      uSnow: { value: new THREE.Vector4(1e4, 0, 0, 0) },   // stage looks: backdrop terrain snow (line above the sea, cover)
      // marina water (theme.marina)
      uWet: { value: Array.from({ length: MAX_WET }, () => new THREE.Vector4()) }, uWetCount: { value: 0 }, uArena: { value: new THREE.Vector4() },
      uWetAx: { value: Array.from({ length: MAX_WET }, () => new THREE.Vector2(1, 0)) },
      // DECK_FIELD (more rects than slots): baked deck / hull distance field
      uDeckField: { value: null }, uDeckFieldRect: { value: new THREE.Vector4() }, uDeckFieldK: { value: new THREE.Vector4() },
      uDeckBox: { value: new THREE.Vector4() }, uWetBox: { value: new THREE.Vector4() },
      uReflTex: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 },
      uFarCube: { value: null }, uFarOn: { value: 0 },
      uChannelCol: C(), uShadeCol: C(), uMarinaK: { value: new THREE.Vector4(1, 1, 0.3, 0) },
      uStripK: { value: new THREE.Vector4(1, 0.4, 0, 0) },
    };
    this._syncDeckShading();
  }

  // Push the deck rects (open sea: the footprint; marina: floating slabs + hulls) to the sea shaders: oriented-rect
  // uniforms while they fit the slots (exact SDFs), else the baked distance field (DECK_FIELD, any number of rects).
  // JS-side consumers (pilings, runs, waterline, waterHeightAt) always use the full rect lists.
  _syncDeckShading() {
    const U = this.U, M = this._marina ? this._marinaData : null;
    const decks = M ? M.decks : this.footprint, wet = M ? M.wet : [];
    const field = decks.length > MAX_RECTS || wet.length > MAX_WET || !!this.forceDeckField;   // (forceDeckField: debug A/B)
    if (field) {
      this._bakeDeckField(decks, wet);
      U.uRectCount.value = 0; U.uWetCount.value = 0;
    } else {
      this._writeRects(decks); this._writeWet(wet);
      if (this._fieldRT) { this._fieldRT.dispose(); this._fieldRT = null; this._fieldKey = null; U.uDeckField.value = null; }
    }
    if (this.seaMat && ('DECK_FIELD' in this.seaMat.defines) !== field) {
      if (field) this.seaMat.defines.DECK_FIELD = ''; else delete this.seaMat.defines.DECK_FIELD;
      this.seaMat.needsUpdate = true;
    }
  }

  // Signed distance to the union of the deck rects (R) and of the hull rects (G): 10 cm texels over the arena + reach,
  // half-float, bilinear, rendered on the GPU (one pass; every texel takes the min over all rects, clamped at FIELD_R).
  _bakeDeckField(decks, wet) {
    const U = this.U, b = this.bounds, R = FIELD_R;
    const aabb = (rs) => {
      if (!rs.length) return [1e4, 1e4, 1e4, 1e4];      // none: far away (like the analytic 1e5)
      const a = [Infinity, Infinity, -Infinity, -Infinity];
      for (const r of rs) { a[0] = Math.min(a[0], r.minX); a[1] = Math.min(a[1], r.minZ); a[2] = Math.max(a[2], r.maxX); a[3] = Math.max(a[3], r.maxZ); }
      return a;
    };
    const db = aabb(decks), wb = aabb(wet);
    // field extent: the bounds and every rect (within 60 m of the bounds), plus the reach
    let x0 = b.minX, z0 = b.minZ, x1 = b.maxX, z1 = b.maxZ;
    for (const r of [...decks, ...wet]) { x0 = Math.min(x0, r.minX); z0 = Math.min(z0, r.minZ); x1 = Math.max(x1, r.maxX); z1 = Math.max(z1, r.maxZ); }
    x0 = Math.max(x0, b.minX - 60) - R - 1; z0 = Math.max(z0, b.minZ - 60) - R - 1; x1 = Math.min(x1, b.maxX + 60) + R + 1; z1 = Math.min(z1, b.maxZ + 60) + R + 1;
    let res = FIELD_RES;
    while (((x1 - x0) / res) * ((z1 - z0) / res) > 2.2e6) res *= 1.25;      // ≤ ~18 MB of RGBA16F
    const W = Math.ceil((x1 - x0) / res), H = Math.ceil((z1 - z0) / res);
    const key = [x0, z0, W, H, res, ...[decks, wet].map((rs) => rs.map((r) => [r.cx, r.cz, r.hx, r.hz, r.ax, r.az].join()).join(';'))].join('|');
    if (key !== this._fieldKey) {
      const t0 = performance.now();
      this._fieldKey = key;
      // rects → float texture: row 0 decks, row 1 hulls; texel 2i = (cx, cz, hx, hz), 2i + 1 = (ax, az)
      const n = Math.max(1, decks.length, wet.length), data = new Float32Array(2 * n * 2 * 4);
      [decks, wet].forEach((rs, row) => rs.forEach((r, i) => data.set([r.cx, r.cz, r.hx, r.hz, r.ax, r.az, 0, 0], (row * 2 * n + 2 * i) * 4)));
      const rectTex = new THREE.DataTexture(data, 2 * n, 2, THREE.RGBAFormat, THREE.FloatType);
      rectTex.needsUpdate = true;
      if (!this._fieldMat) {
        this._fieldMat = new THREE.ShaderMaterial({
          name: 'DeckFieldBake', depthTest: false, depthWrite: false,
          uniforms: { uRectTex: { value: null }, uN: { value: new THREE.Vector2() }, uField: { value: new THREE.Vector4() }, uR: { value: R } },
          vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
          fragmentShader: /* glsl */`
            uniform sampler2D uRectTex; uniform vec2 uN; uniform vec4 uField; uniform float uR;
            varying vec2 vUv;
            float sdSet(vec2 p, int n, int row) {
              float d = uR;
              for (int i = 0; i < n; i++) {
                vec4 r = texelFetch(uRectTex, ivec2(2 * i, row), 0);
                vec2 a = texelFetch(uRectTex, ivec2(2 * i + 1, row), 0).xy;
                vec2 e = p - r.xy;
                vec2 q = abs(vec2(dot(e, a), dot(e, vec2(-a.y, a.x)))) - r.zw;
                d = min(d, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
              }
              return d;
            }
            void main() { vec2 p = uField.xy + vUv * uField.zw; gl_FragColor = vec4(sdSet(p, int(uN.x), 0), sdSet(p, int(uN.y), 1), 0.0, 1.0); }`,
        });
        this._fieldQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._fieldMat);
        this._fieldQuad.frustumCulled = false;
        this._fieldScene = new THREE.Scene(); this._fieldScene.add(this._fieldQuad);
        this._fieldCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      }
      const fu = this._fieldMat.uniforms;
      fu.uRectTex.value = rectTex; fu.uN.value.set(decks.length, wet.length); fu.uField.value.set(x0, z0, W * res, H * res);
      if (!this._fieldRT || this._fieldRT.width !== W || this._fieldRT.height !== H) {
        this._fieldRT?.dispose();
        this._fieldRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
          generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace });
      }
      const r = this.renderer, prev = r.getRenderTarget(), xr = r.xr.enabled;
      r.xr.enabled = false;
      r.setRenderTarget(this._fieldRT);
      r.render(this._fieldScene, this._fieldCam);
      r.setRenderTarget(prev);
      r.xr.enabled = xr;
      rectTex.dispose();
      U.uDeckField.value = this._fieldRT.texture;
      this.fieldBakeMs = performance.now() - t0;
    }
    U.uDeckFieldRect.value.set(x0, z0, 1 / (W * res), 1 / (H * res));
    U.uDeckFieldK.value.set(res, R, 0, 0);
    U.uDeckBox.value.set(...db); U.uWetBox.value.set(...wb);
  }

  // deck rects → uRects (centre, half extents) + uRectAx (local x axis); marina hulls → uWet + uWetAx
  _writeRects(rects = this.footprint) {
    const U = this.U;
    rects.forEach((r, i) => { U.uRects.value[i].set(r.cx, r.cz, r.hx, r.hz); U.uRectAx.value[i].set(r.ax, r.az); });
    U.uRectCount.value = rects.length;
  }
  _writeWet(rects) {
    const U = this.U;
    rects.forEach((r, i) => { U.uWet.value[i].set(r.cx, r.cz, r.hx, r.hz); U.uWetAx.value[i].set(r.ax, r.az); });
    U.uWetCount.value = rects.length;
  }

  // ------------------------------------------------------------------ lights
  _buildLights() {
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.name = 'Sun';
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.shadowSize, this.shadowSize);
    sun.shadow.radius = 2.2 * (this.shadowSize / 4096) + 0.8;
    const cx = (this.bounds.minX + this.bounds.maxX) / 2, cz = (this.bounds.minZ + this.bounds.maxZ) / 2;
    sun.target.position.set(cx, 0, cz);
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.5);
    this.hemi.name = 'SkyFill';
    this.scene.add(this.hemi);
  }

  // Fit the orthographic shadow camera tightly around the arena box as seen from the sun.
  _fitShadow() {
    const b = this.bounds, m = 6;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const dir = this.U.uSunDir.value;
    const target = new THREE.Vector3(cx, 0, cz);
    const pos = target.clone().addScaledVector(dir, 160);
    this.sun.position.copy(pos);
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
    const look = new THREE.Matrix4().lookAt(pos, target, new THREE.Vector3(0, 1, 0));
    const inv = new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z).multiply(look).invert();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const p = new THREE.Vector3();
    for (const x of [b.minX - m, b.maxX + m]) for (const y of [WATER_Y - 0.3, 14]) for (const z of [b.minZ - m, b.maxZ + m]) {
      p.set(x, y, z).applyMatrix4(inv);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const cam = this.sun.shadow.camera;
    cam.left = minX; cam.right = maxX; cam.bottom = minY; cam.top = maxY;
    cam.near = Math.max(0.5, -maxZ - 30); cam.far = -minZ + 2;
    cam.updateProjectionMatrix();
    const range = cam.far - cam.near;
    this.sun.shadow.bias = -0.025 / range;
    const texel = Math.max(maxX - minX, maxY - minY) / this.shadowSize;
    this.sun.shadow.normalBias = Math.max(0.012, texel * 1.4);
    this.sun.shadow.needsUpdate = true;
  }

  // ------------------------------------------------------------------ sky + env map
  _buildSky() {
    const geo = new THREE.SphereGeometry(1, 48, 24);
    // the in-game dome is depth-tested at the far plane and drawn after every opaque object, so only pixels where sky
    // is actually visible get shaded; the env-map copy renders alone
    const mk = (env) => new THREE.ShaderMaterial({
      name: env ? 'SkyEnv' : 'Sky', uniforms: this.U, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: !env, depthFunc: THREE.LessEqualDepth, fog: false, defines: env ? { ENV_PASS: '' } : {},
    });
    this.skyMat = mk(false);
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.name = 'SkyDome';
    this.sky.frustumCulled = false;
    this.sky.renderOrder = 9000;
    this._initCloudBake();
    this.root.add(this.sky);
    this._envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(geo, mk(true));
    envSky.frustumCulled = false;
    this._envScene.add(envSky);
    this._pmrem = new THREE.PMREMGenerator(this.renderer);
  }

  _initCloudBake() {
    this._cloudRT = new THREE.WebGLRenderTarget(CLOUD_W, CLOUD_H, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false,
    });
    this.U.uCloudTex.value = this._cloudRT.texture;
    this._cloudMat = new THREE.ShaderMaterial({
      name: 'CloudBake', vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: CLOUD_BAKE_FRAG,
      uniforms: { ...this.U, uRes: { value: new THREE.Vector2(CLOUD_W, CLOUD_H) }, uSunCol: { value: new THREE.Color() }, uSeed: { value: 3.0 }, uCov: { value: 0.46 } },
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const q = new THREE.Mesh(g, this._cloudMat); q.frustumCulled = false;
    this._cloudScene = new THREE.Scene(); this._cloudScene.add(q);
    this._cloudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  // Bake the cumulus dome for the current theme (sun direction/colour + sky). Rendered in horizontal strips so no
  // single GPU job runs long; ~0.1–0.3 s once per theme change.
  _bakeClouds(T) {
    const r = this.renderer, u = this._cloudMat.uniforms;
    u.uSunCol.value.copy(lin(T.sunColor, (T.skySun ?? T.sunIntensity) / 2.75));
    u.uCov.value = T.cloudCov ?? 0.46;
    u.uSeed.value = T.cloudSeed ?? 3.0;
    const prev = r.getRenderTarget(), ac = r.autoClear, xr = r.xr.enabled;
    r.autoClear = false; r.xr.enabled = false;
    const rt = this._cloudRT;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0); r.clear(true, false, false);
    const strips = 10, h = Math.ceil(CLOUD_H / strips);
    rt.scissorTest = true;
    for (let i = 0; i < strips; i++) {
      rt.scissor.set(0, i * h, CLOUD_W, Math.min(h, CLOUD_H - i * h));
      r.setRenderTarget(rt);
      r.render(this._cloudScene, this._cloudCam);
    }
    rt.scissorTest = false;
    r.setRenderTarget(prev);
    r.autoClear = ac; r.xr.enabled = xr;
  }

  _rebuildEnvMap() {
    const old = this._envRT;
    this._envRT = this._pmrem.fromScene(this._envScene, 0, 0.1, 100, { size: 256 });
    const prev = this.envMap;
    this.envMap = this._envRT.texture;
    if (this.scene.environment === prev || this.scene.environment == null) this.scene.environment = this.envMap;
    if (old) old.dispose();
  }

  // ------------------------------------------------------------------ sea
  _buildSea() {
    this.U.uWaveTex.value = makeWaveTexture(256, 11);
    // polar grid: dense near the arena, stretching to the horizon
    const rings = [0];
    let r = 1.5;
    while (r < 6000) { rings.push(r); r = r * 1.1 + 0.5; }
    rings.push(6000);
    const S = 128;
    const pos = [], idx = [];
    pos.push(0, 0, 0);
    for (let k = 1; k < rings.length; k++) for (let s = 0; s < S; s++) { const a = (s / S) * Math.PI * 2; pos.push(Math.cos(a) * rings[k], 0, Math.sin(a) * rings[k]); }
    for (let s = 0; s < S; s++) idx.push(0, 1 + ((s + 1) % S), 1 + s);
    for (let k = 1; k < rings.length - 1; k++) {
      const a0 = 1 + (k - 1) * S, a1 = 1 + k * S;
      for (let s = 0; s < S; s++) { const s1 = (s + 1) % S; idx.push(a0 + s, a0 + s1, a1 + s1, a0 + s, a1 + s1, a1 + s); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setIndex(idx);
    const uniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights), ...this.U };
    this.seaMat = new THREE.ShaderMaterial({ name: 'Sea', uniforms, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, lights: true, fog: false });
    this.sea = new THREE.Mesh(geo, this.seaMat);
    this.sea.name = 'Sea';
    this.sea.position.y = WATER_Y;
    this.sea.frustumCulled = false;
    this.sea.receiveShadow = true;
    this.sea.renderOrder = -1;
    // marina: the planar reflection is rendered right before the sea draws (camera already final for this frame)
    this.sea.onBeforeRender = (renderer, scene, camera) => this._renderReflection(renderer, scene, camera);
    this.root.add(this.sea);
  }

  // ------------------------------------------------------------------ marina water
  // Planar reflection: the scene mirrored in the water plane (oblique near plane = the water, so nothing below it
  // reflects), rendered without sea or sky dome into a mip-mapped HDR target; alpha = coverage, so the sea shader keeps
  // its analytic sky + clouds wherever nothing stands above the water. Once per frame, only in marina mode, skipped for
  // override passes (GTAO normals) and when the camera dips under the surface. Resolution follows the quality preset.
  _renderReflection(renderer, scene, camera) {
    const U = this.U;
    if (!this._marina || this._reflBusy || scene.overrideMaterial || this._reflFrame === this._frameId) return;
    this._reflFrame = this._frameId;
    const q = G.settings?.quality || 'high';
    const scale = !this.reflections || q === 'low' ? 0 : (q === 'medium' ? 0.28 : q === 'ultra' ? 0.5 : 0.4) * (this.reflScale ?? 1);
    const cp = _rv[0].setFromMatrixPosition(camera.matrixWorld);
    if (!scale || cp.y < WATER_Y + 0.05) { U.uReflOn.value = 0; return; }
    if (!this._reflRT) {
      this._reflRT = new THREE.WebGLRenderTarget(64, 64, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace, depthBuffer: true, stencilBuffer: false,
        minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true,
      });
      this._reflRT.texture.name = 'SeaReflection';
      this._reflCam = new THREE.PerspectiveCamera();
      this._reflCam.matrixAutoUpdate = true;
      U.uReflTex.value = this._reflRT.texture;
    }
    const rt = this._reflRT, rc = this._reflCam;
    renderer.getDrawingBufferSize(_rv2);
    const w = Math.max(64, Math.round(_rv2.x * scale)), h = Math.max(64, Math.round(_rv2.y * scale));
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    // mirror the camera frame in the plane y = WATER_Y
    const fwd = _rv[1].set(0, 0, -1).transformDirection(camera.matrixWorld);
    const up = _rv[2].set(0, 1, 0).transformDirection(camera.matrixWorld);
    fwd.y = -fwd.y; up.y = -up.y;
    rc.position.set(cp.x, 2 * WATER_Y - cp.y, cp.z);
    rc.up.copy(up);
    rc.lookAt(_rv[3].copy(rc.position).add(fwd));
    rc.updateMatrixWorld(true);
    rc.layers.mask = camera.layers.mask;
    rc.projectionMatrix.copy(camera.projectionMatrix);
    // oblique near plane on the water (Lengyel): nothing under the surface ends up in the reflection
    _rPlane.normal.set(0, 1, 0); _rPlane.constant = -WATER_Y;
    _rPlane.applyMatrix4(rc.matrixWorldInverse);
    const cv = _rv4[0].set(_rPlane.normal.x, _rPlane.normal.y, _rPlane.normal.z, _rPlane.constant);
    const pm = rc.projectionMatrix.elements;
    const qv = _rv4[1].set((Math.sign(cv.x) + pm[8]) / pm[0], (Math.sign(cv.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    cv.multiplyScalar(2 / cv.dot(qv));
    pm[2] = cv.x; pm[6] = cv.y; pm[10] = cv.z + 1; pm[14] = cv.w;
    rc.projectionMatrixInverse.copy(rc.projectionMatrix).invert();
    U.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    // render
    const prevRT = renderer.getRenderTarget(), xr = renderer.xr.enabled, sAuto = renderer.shadowMap.autoUpdate, sNeed = renderer.shadowMap.needsUpdate;
    renderer.getClearColor(_rCol); const ca = renderer.getClearAlpha();
    // What the water mirrors: the level, hulls / piles / fenders / boats / rails (props) and the near dock kit. Far
    // scenery comes from the baked far-reflection cube; below ultra the squid kids, FX particles, lamp posts, palms,
    // flags, light glows and spinners stay out too — they are most of the pass's draw calls (its real cost is CPU:
    // ~50 µs per draw) and all but vanish in a wave-broken reflection.
    const hide = [this.sea, this.sky, this.lhBeam, this.city, this.terrain, this.staticScenery, this.ferris, this.trees, this.sailInst, this.gullInst];
    if (q !== 'ultra') {
      for (const a of G.actors || []) if (a.character && a.character.root) hide.push(a.character.root);
      hide.push(...this._reflSkips(scene));
    }
    for (let i = hide.length - 1; i >= 0; i--) if (!hide[i]) hide.splice(i, 1);
    const vis = hide.map((o) => o.visible);
    this._reflBusy = true;
    try {
      for (const o of hide) o.visible = false;
      renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(scene, rc);
    } finally {
      hide.forEach((o, i) => { o.visible = vis[i]; });
      renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = sAuto; renderer.shadowMap.needsUpdate = sNeed;
      renderer.setClearColor(_rCol, ca);
      renderer.setRenderTarget(prevRT);
      this._reflBusy = false;
    }
    U.uReflOn.value = 1;
  }

  // Far reflections: the distant land (hills, city, port, bridge, lighthouse) only ever reflects near the horizon and
  // never moves, so it is baked once per theme / stage into a cube from the arena centre (transparent elsewhere) and
  // looked up by reflection direction under the planar reflection — calm harbour water mirrors the skyline for free.
  _bakeFarReflection() {
    const U = this.U;
    if (!this._marina) { U.uFarOn.value = 0; return; }
    const r = this.renderer;
    if (!this._farRT) {
      this._farRT = new THREE.WebGLCubeRenderTarget(512, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace,
        generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      });
      this._farRT.texture.name = 'FarReflection';
      this._farCam = new THREE.CubeCamera(2, 30000, this._farRT);
      U.uFarCube.value = this._farRT.texture;
    }
    const far = new Set([this.terrain, this.city, this.staticScenery, this.ferris, this.trees].filter(Boolean));
    const hidden = [];
    for (const o of this.scene.children) if (o !== this.root && o.visible && !o.isLight) { o.visible = false; hidden.push(o); }
    for (const o of this.root.children) if (o.visible && !far.has(o)) { o.visible = false; hidden.push(o); }
    const b = this.bounds;
    this._farCam.position.set((b.minX + b.maxX) / 2, WATER_Y + 1.5, (b.minZ + b.maxZ) / 2);
    this._farCam.updateMatrixWorld(true);
    const prevRT = r.getRenderTarget(), ac = r.autoClear, cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    const sAuto = r.shadowMap.autoUpdate, sNeed = r.shadowMap.needsUpdate;
    try {
      // at boot the sun's shadow map does not exist yet: let this render create it (the next frame redraws it fully),
      // otherwise lit materials would sample a placeholder through their shadow samplers
      r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = !this.sun.shadow.map;
      r.autoClear = true;
      r.setClearColor(0x000000, 0);
      this._farCam.update(r, this.scene);
    } finally {
      for (const o of hidden) o.visible = true;
      r.setClearColor(cc, ca); r.autoClear = ac; r.setRenderTarget(prevRT);
      r.shadowMap.autoUpdate = sAuto; r.shadowMap.needsUpdate = sNeed;
    }
    U.uFarOn.value = 1;
  }

  // Scene parts left out of the planar reflection below ultra (cached per prop build): FX, decor, small prop batches.
  _reflSkips(scene) {
    const props = scene.children.find((o) => o.name === 'props');
    const key = scene.children.length + ':' + (props ? props.uuid + props.children.length : '-');
    if (this._reflSkipKey === key) return this._reflSkipList;
    const list = [];
    for (const o of scene.children) if (o.name === 'FX' || o.name === 'decor') list.push(o);
    if (props) for (const m of props.children) if (/glow|blink|flags|spin:|fence|blob|foliage/.test(m.name || '')) list.push(m);
    this._reflSkipKey = key; this._reflSkipList = list;
    return list;
  }

  // Is the current stage a marina (sheltered basin, hulls in the water)? A layout can say so with `water: 'marina'`.
  _stageMarina() {
    const lay = G.level && G.level.layout;
    return !!(lay && (lay.water === 'marina' || lay.id === 'halyard'));
  }

  // Which level blocks float over the water (slabs: under-deck shade + dark undersides) and which pierce it or sit
  // below it (hulls, dry-dock floors: no sea inside, contact foam). Read from the live level (y extents matter here —
  // the main.js footprint only carries XZ). Axis-aligned boxes and boxes turned about Y (oriented rects); ramps and
  // other tilted blocks are left out.
  _marinaSets() {
    const L = G.level, decks = [], wet = [];
    if (L) for (const b of L.blocks) {
      if (!b.solid || b.hidden || b.grate) continue;
      const lo = b.aabbMin, hi = b.aabbMax;
      const inWet = lo.y < WATER_Y - 0.02 && hi.y > -30, inDeck = !inWet && lo.y >= WATER_Y - 0.02 && lo.y < WATER_Y + 0.9;
      if (!inWet && !inDeck) continue;
      const r = blockRect(b);
      if (!r) continue;
      r.y0 = lo.y; r.y1 = hi.y;
      (inWet ? wet : decks).push(r);          // wet: pierces the surface / sunk below it
    }
    return { decks, wet };
  }

  // (Re)apply marina mode for the current theme + level: rect sets, waterline strips, slab undersides, uniforms.
  _applyMarina() {
    const U = this.U;
    if (this.marinaFx) {
      this.root.remove(this.marinaFx);
      this.marinaFx.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this.marinaFx = null;
    }
    const on = this._marina;
    if (('MARINA' in this.seaMat.defines) !== on) {       // presence test: the define's value is ''
      if (on) this.seaMat.defines.MARINA = ''; else delete this.seaMat.defines.MARINA;
      this.seaMat.needsUpdate = true;
    }
    if (!on) { this._marinaData = null; U.uWetCount.value = 0; U.uReflOn.value = 0; this._syncDeckShading(); return; }
    const M = (this._marinaData = this._marinaSets());
    U.uArena.value.set(this.bounds.minX, this.bounds.minZ, this.bounds.maxX, this.bounds.maxZ);
    this._syncDeckShading();
    this._buildFoamField([...(this._foamShapes || []), ...this._waterContours(M.wet)]);
    this._buildMarinaFx(M);
  }

  _buildMarinaFx(M) {
    const L = G.level;
    if (!L) return;
    const grp = new THREE.Group();
    grp.name = 'MarinaWaterline';
    const open = (x, z) => !M.decks.some((r) => inRect(r, x, z)) && !M.wet.some((r) => inRect(r, x, z));
    const pos = [], nor = [], info = [];
    const quad = (a, b, c, d, n, col, kind) => {   // a b c d counter-clockwise seen from the front (n)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let i = 0; i < 6; i++) { nor.push(n.x, n.y, n.z); info.push(col.r, col.g, col.b, kind); }
    };
    const OFF = 0.012;
    for (const f of L.faces) {
      const b = L.blocks[f.block];
      if (!f.wall || (!b.aligned && Math.abs(b.axes[1].y) < 0.9999) || b.hidden || b.grate || !b.solid) continue;   // boxes, upright or turned about Y
      const yb = b.aabbMin.y, yt = b.aabbMax.y;
      const inWater = yb < WATER_Y - 0.02 && yt > WATER_Y + 0.02;
      const overWater = !inWater && yb >= WATER_Y - 0.02 && yb < WATER_Y + 0.9;
      if (!inWater && !overWater) continue;
      // hull strips stand 3.5 cm proud (clear of boot-top / livery panels); slab-fascia strips stop under the whaler
      const off = inWater ? 0.035 : OFF;
      const y0 = inWater ? WATER_Y - 0.1 : yb + 0.004;
      const y1 = Math.min(inWater ? yt - 0.16 : yt - 0.36, inWater ? WATER_Y + 1.7 : yb + 1.15);
      if (y1 < y0 + 0.15) continue;
      const n = f.n, u = f.u;
      const steps = Math.max(2, Math.ceil(f.su / 0.2));
      const ds = f.su / steps;
      const emit = (s0, s1) => {
        const e0 = s0 < 0.01 ? 0.15 : 0.03, e1 = s1 > f.su - 0.01 ? 0.15 : 0.03;
        s0 += e0; s1 -= e1;
        if (s1 - s0 < 0.25) return;
        const px = (s, y) => [f.origin.x + u.x * s + n.x * off, y, f.origin.z + u.z * s + n.z * off];
        quad(px(s0, y0), px(s1, y0), px(s1, y1), px(s0, y1), n, f.color, inWater ? 1 : 0);
      };
      let s0 = -1;
      for (let i = 0; i <= steps; i++) {
        const s = i * ds;
        const ok = open(f.origin.x + u.x * s + n.x * 0.3, f.origin.z + u.z * s + n.z * 0.3);
        if (ok && s0 < 0) s0 = s;
        if (s0 >= 0 && (!ok || i === steps)) { emit(s0, ok ? s : s - ds); s0 = -1; }
      }
    }
    // slab undersides: dark timber seen in the reflections / from the water, with the caustic band along the sunny edge
    const under = [];
    const dn = new THREE.Vector3(0, -1, 0), dark = new THREE.Color('#2e2923');
    for (const r of M.decks) {
      const y = r.y0 - 0.002, e = 0.004;
      let A, B, Cc, D;
      if (r.aligned) { A = [r.minX + e, y, r.minZ + e]; B = [r.maxX - e, y, r.minZ + e]; Cc = [r.maxX - e, y, r.maxZ - e]; D = [r.minX + e, y, r.maxZ - e]; } else {
        // turned slab: the same quad in its own frame (a rotation keeps the winding)
        const P = (lx, lz) => { const q = rectPt(r, lx, lz); return [q[0], y, q[1]]; }, hx = r.hx - e, hz = r.hz - e;
        A = P(-hx, -hz); B = P(hx, -hz); Cc = P(hx, hz); D = P(-hx, hz);
      }
      under.push(...A, ...B, ...Cc, ...A, ...Cc, ...D);     // winding faces −Y
      const y2 = y - 0.006;
      quad([A[0], y2, A[2]], [B[0], y2, B[2]], [Cc[0], y2, Cc[2]], [D[0], y2, D[2]], dn, dark.clone().multiplyScalar(4), 0);
    }
    if (under.length) {
      const ug = new THREE.BufferGeometry();
      ug.setAttribute('position', new THREE.Float32BufferAttribute(under, 3));
      ug.computeVertexNormals();
      const um = new THREE.Mesh(ug, this._underMat || (this._underMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.95, metalness: 0 })));
      um.name = 'SlabUndersides';
      grp.add(um);
    }
    if (pos.length) {
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      sg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      sg.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
      if (!this._stripMat) {
        const uniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights), uTime: this.U.uTime, uSunDir: this.U.uSunDir, uSunLight: this.U.uSunLight, uStripK: this.U.uStripK };
        this._stripMat = new THREE.ShaderMaterial({
          name: 'Waterline', uniforms, vertexShader: STRIP_VERT, fragmentShader: STRIP_FRAG, lights: true, fog: false,
          transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
          blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
          polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
        });
      }
      const sm = new THREE.Mesh(sg, this._stripMat);
      sm.name = 'WaterlineStrips';
      sm.receiveShadow = true;
      sm.frustumCulled = false;
      grp.add(sm);
    }
    this.marinaFx = grp;
    this.root.add(grp);
  }

  // Distance field (metres, 0..range) to pilings, boats, buoys around the deck → foam rings on the water.
  // Marina mode: finer (0.1 m) and short-range (2.5 m, 1 cm steps), fed by the real waterline contours.
  _buildFoamField(shapes) {
    const marina = this._marina;
    const b = this.bounds, pad = 22, res = marina ? 0.1 : 0.2, range = marina ? 2.5 : 8;
    const minX = b.minX - pad, minZ = b.minZ - pad;
    const W = Math.ceil((b.maxX - b.minX + pad * 2) / res), H = Math.ceil((b.maxZ - b.minZ + pad * 2) / res);
    const data = new Uint8Array(W * H).fill(255);
    const segDist = (px, pz, ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
      return Math.hypot(px - ax - dx * t, pz - az - dz * t);
    };
    for (const s of shapes) {
      const reach = s.r + (s.reach ?? 3);
      const x0 = Math.max(0, Math.floor((Math.min(s.ax, s.bx) - reach - minX) / res)), x1 = Math.min(W - 1, Math.ceil((Math.max(s.ax, s.bx) + reach - minX) / res));
      const z0 = Math.max(0, Math.floor((Math.min(s.az, s.bz) - reach - minZ) / res)), z1 = Math.min(H - 1, Math.ceil((Math.max(s.az, s.bz) + reach - minZ) / res));
      for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
        const px = minX + (i + 0.5) * res, pz = minZ + (j + 0.5) * res;
        const d = Math.max(0, segDist(px, pz, s.ax, s.az, s.bx, s.bz) - s.r);
        const v = Math.min(255, Math.round((d / range) * 255));
        const k = j * W + i;
        if (v < data[k]) data[k] = v;
      }
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
    tex.unpackAlignment = 1;
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    if (this.U.uFoamTex.value) this.U.uFoamTex.value.dispose();
    this.U.uFoamTex.value = tex;
    this.U.uFoamRect.value.set(minX, minZ, 1 / (W * res), 1 / (H * res));
    this.U.uMarinaK.value.w = range;
  }

  // Marina: where anything the stage dressed (piles, fenders, ladders, moored boats, buoys…) crosses the sea surface.
  // Triangle ∩ plane y = WATER_Y segments from the prop meshes → zero-radius capsules for the foam field, so froth
  // rings whatever actually stands in the water, whoever placed it. Hull dressing hugging a wet rect is left to the
  // analytic hull contact line.
  _waterContours(wet) {
    const out = [];
    const b = this.bounds, pad = 21;
    const X0 = b.minX - pad, X1 = b.maxX + pad, Z0 = b.minZ - pad, Z1 = b.maxZ + pad;
    const Wy = WATER_Y;
    const A = new THREE.Vector3(), Bv = new THREE.Vector3(), Cv = new THREE.Vector3(), pts = [];
    const nearWet = (x, z) => wet.some((r) => inRect(r, x, z, 0.12));
    const cut = (p, q) => { const t = (Wy - p.y) / (q.y - p.y); pts.push(p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t); };
    const scan = (geo, mat) => {
      const pos = geo.attributes.position, idx = geo.index;
      if (!pos) return;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = _bb.copy(geo.boundingBox);
      if (mat) bb.applyMatrix4(mat);
      if (bb.min.y > Wy || bb.max.y < Wy || bb.max.x < X0 || bb.min.x > X1 || bb.max.z < Z0 || bb.min.z > Z1) return;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i + 2 < n; i += 3) {
        const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
        if (!mat) {
          const ya = pos.getY(ia) - Wy, yb = pos.getY(ib) - Wy, yc = pos.getY(ic) - Wy;
          if ((ya > 0 && yb > 0 && yc > 0) || (ya <= 0 && yb <= 0 && yc <= 0)) continue;
        }
        A.fromBufferAttribute(pos, ia); Bv.fromBufferAttribute(pos, ib); Cv.fromBufferAttribute(pos, ic);
        if (mat) { A.applyMatrix4(mat); Bv.applyMatrix4(mat); Cv.applyMatrix4(mat); }
        const sa = A.y > Wy, sb = Bv.y > Wy, sc = Cv.y > Wy;
        if (sa === sb && sb === sc) continue;
        pts.length = 0;
        if (sa !== sb) cut(A, Bv);
        if (sb !== sc) cut(Bv, Cv);
        if (sc !== sa) cut(Cv, A);
        if (pts.length !== 4) continue;
        const mx = (pts[0] + pts[2]) / 2, mz = (pts[1] + pts[3]) / 2;
        if (mx < X0 || mx > X1 || mz < Z0 || mz > Z1 || nearWet(mx, mz)) continue;
        out.push({ ax: pts[0], az: pts[1], bx: pts[2], bz: pts[3], r: 0, reach: 1.6 });
      }
    };
    const _mi = new THREE.Matrix4();
    for (const grp of this.scene.children) {
      if (grp === this.root || grp.name !== 'props') continue;
      grp.updateMatrixWorld(true);
      grp.traverse((o) => {
        if (!o.isMesh || !o.geometry || o.visible === false) return;
        if (o.isInstancedMesh) {
          for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, _mi); _mi.premultiply(o.matrixWorld); scan(o.geometry, _mi); }
        } else scan(o.geometry, o.matrixWorld.equals(_ident) ? null : o.matrixWorld);
      });
    }
    return out;
  }

  // ------------------------------------------------------------------ dock: pilings, fenders, ladders, moored boats
  _insideFootprint(x, z) { return this.footprint.some((r) => inRect(r, x, z)); }
  _insideBounds(x, z) { const b = this.bounds; return x > b.minX + 0.01 && x < b.maxX - 0.01 && z > b.minZ + 0.01 && z < b.maxZ - 0.01; }

  // exposed stretches of the footprint outline (edge samples whose outside is open water), along each rect's real
  // (possibly turned) edges: { ax, az → bx, bz, outward nx, nz, len, s0..s1 }
  _boundaryRuns() {
    const runs = [];
    for (const r of this.footprint) {
      for (const e of rectEdges(r)) {
        const len = Math.hypot(e.bx - e.ax, e.bz - e.az);
        const step = 0.25;
        let start = -1;
        const n = Math.floor(len / step);
        for (let i = 0; i <= n; i++) {
          const s = i * step, t = s / len;
          const x = e.ax + (e.bx - e.ax) * t, z = e.az + (e.bz - e.az) * t;
          const out = !this._insideFootprint(x + e.nx * 0.05, z + e.nz * 0.05);
          if (out && start < 0) start = s;
          if (start >= 0 && (!out || i === n)) {
            const end = out ? s : s - step;
            if (end - start > 0.6) runs.push({ ...e, len, s0: start, s1: end });
            start = -1;
          }
        }
      }
    }
    return runs;
  }

  _buildDock() {
    const b = this.bounds;
    // marina stages dress their own pier edges (piles, fenders, ladders) and moored boats: keep only the hidden
    // under-slab piling grid here
    const marina = this._marina;
    const runs = this._boundaryRuns();
    this._runs = runs;
    const pilings = []; // [x, z, radius, topY]
    const foamShapes = [];
    const bare = this._stageEnv()?.edge === 'none';   // the stage dresses its own deck edges (banks, cliffs)
    for (const run of marina || bare ? [] : runs) {
      const dx = (run.bx - run.ax) / run.len, dz = (run.bz - run.az) / run.len;
      const L = run.s1 - run.s0;
      const n = Math.max(2, Math.round(L / 3.4) + 1);
      for (let i = 0; i < n; i++) {
        const s = run.s0 + 0.3 + (L - 0.6) * (i / (n - 1));
        const ex = run.ax + dx * s, ez = run.az + dz * s;
        let x = ex + run.nx * 0.24, z = ez + run.nz * 0.24, top = -0.07, rad = 0.2;
        if (this._insideBounds(x, z)) { x = ex - run.nx * 0.45; z = ez - run.nz * 0.45; top = -1.2; rad = 0.24; }
        pilings.push([x, z, rad, top]);
        foamShapes.push({ ax: x, az: z, bx: x, bz: z, r: rad });
      }
    }
    // interior grid under the slab (seen from the water), on the slab's own (possibly turned) grid
    for (const r of bare ? [] : this.footprint) {
      if (r.aligned) {
        for (let x = r.minX + 3.5; x <= r.maxX - 3.5; x += 7) for (let z = r.minZ + 3.5; z <= r.maxZ - 3.5; z += 7) {
          pilings.push([x, z, 0.3, -1.2]);
        }
      } else {
        for (let u = -r.hx + 3.5; u <= r.hx - 3.5 + 1e-6; u += 7) for (let v = -r.hz + 3.5; v <= r.hz - 3.5 + 1e-6; v += 7) {
          const [x, z] = rectPt(r, u, v);
          pilings.push([x, z, 0.3, -1.2]);
        }
      }
    }

    // ---- moored boats + dolphins (outside the bounds) ----
    // (a stage that dresses its own water can switch these off: layout.envBoats === false)
    const boatsSpec = marina || G.level?.layout?.envBoats === false || this._stageEnv()?.boats === false ? [] : [
      { kind: 'fishing', x: b.maxX + 3.25, z: b.minZ + (b.maxZ - b.minZ) * 0.77, yaw: 0 },
      { kind: 'launch', x: b.minX - 2.85, z: b.minZ + (b.maxZ - b.minZ) * 0.2, yaw: Math.PI },
      { kind: 'row', x: b.minX - 1.75, z: b.minZ + (b.maxZ - b.minZ) * 0.86, yaw: 0.12 },
    ];
    this._mooredSpec = boatsSpec;
    // nearest exposed deck edge to (x, z) whose outward normal faces (nx, nz), within 8 m: spring-line rings and ladders
    // hang on the real (possibly turned) slab face rather than on the arena bounds; none near → left out
    const edgeAt = (x, z, nx, nz) => {
      let best = null, bd = 8;
      for (const r of runs) {
        if (r.nx * nx + r.nz * nz < 0.5) continue;
        const dx = (r.bx - r.ax) / r.len, dz = (r.bz - r.az) / r.len;
        const s = Math.min(r.s1, Math.max(r.s0, (x - r.ax) * dx + (z - r.az) * dz));
        const px = r.ax + dx * s, pz = r.az + dz * s, d = Math.hypot(px - x, pz - z);
        if (d < bd) { bd = d; best = { x: px, z: pz, nx: r.nx, nz: r.nz }; }
      }
      return best && bd < 1e-6 && best.nx === nx && best.nz === nz ? { x, z, nx, nz } : best;   // on the edge: as asked
    };
    const ringAt = (e) => dockParts.push(xf(prep(new THREE.TorusGeometry(0.09, 0.02, 5, 10), '#8d969e'), e.x + e.nx * 0.04, -0.36, e.z + e.nz * 0.04, e.nz === 0 ? Math.PI / 2 : Math.atan2(e.nx, e.nz)));
    const dockParts = [];
    const pushRope = (a, c, s = 0.35, r = 0.035) => dockParts.push(tube(sag(a, c, s), r, '#dccaa0'));
    const dolphin = (x, z, h = -0.28) => {
      for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.3; pilings.push([x + Math.cos(a) * 0.42, z + Math.sin(a) * 0.42, 0.22, h - 0.25]); }
      foamShapes.push({ ax: x, az: z, bx: x, bz: z, r: 0.7 });
      dockParts.push(xf(box(1.5, 0.45, 1.5, '#d6cfc2'), x, h, z));
      dockParts.push(xf(box(1.56, 0.08, 1.56, '#b8b0a2'), x, h - 0.26, z));
      dockParts.push(xf(cyl(0.16, 0.19, 0.38, 10, '#44505b'), x, h + 0.41, z));
      dockParts.push(xf(cyl(0.26, 0.22, 0.12, 12, '#f1c95a'), x, h + 0.62, z));
      return [x, h + 0.45, z];
    };
    for (const bs of boatsSpec) {
      const len = bs.kind === 'fishing' ? 8.6 : bs.kind === 'launch' ? 6.4 : 3.4;
      const sgn = bs.x > 0 ? 1 : -1;
      const fwdZ = Math.cos(bs.yaw) >= 0 ? 1 : -1;
      foamShapes.push({ ax: bs.x, az: bs.z - len * 0.46, bx: bs.x, bz: bs.z + len * 0.46, r: bs.kind === 'row' ? 0.55 : 1.05 });
      const edgeX = sgn > 0 ? b.maxX : b.minX;
      if (bs.kind !== 'row') {
        const d1 = dolphin(bs.x + sgn * 0.4, bs.z + fwdZ * (len * 0.5 + 3.2));
        const d2 = dolphin(bs.x + sgn * 0.4, bs.z - fwdZ * (len * 0.5 + 3.2));
        const fb = bs.kind === 'fishing' ? 1.15 : 0.85;
        const bow = [bs.x, WATER_Y + fb + 0.35, bs.z + fwdZ * len * 0.42], stern = [bs.x, WATER_Y + fb + 0.05, bs.z - fwdZ * len * 0.44];
        pushRope(bow, d1, 0.35); pushRope(stern, d2, 0.35);
        // spring lines to rings on the slab face
        const e1 = edgeAt(edgeX, bs.z + 2.8, sgn, 0), e2 = edgeAt(edgeX, bs.z - 3.2, sgn, 0);
        if (e1) pushRope([bs.x - sgn * 1.0, WATER_Y + fb, bs.z + 1.0], [e1.x + e1.nx * 0.06, -0.3, e1.z + e1.nz * 0.06], 0.2);
        if (e2) pushRope([bs.x - sgn * 1.0, WATER_Y + fb, bs.z - 1.4], [e2.x + e2.nx * 0.06, -0.3, e2.z + e2.nz * 0.06], 0.2);
        for (const e of [e1, e2]) if (e) ringAt(e);
      } else {
        const e = edgeAt(edgeX, bs.z + 2.6, sgn, 0);
        if (e) { pushRope([bs.x, WATER_Y + 0.5, bs.z + 1.5], [e.x + e.nx * 0.06, -0.3, e.z + e.nz * 0.06], 0.25, 0.025); ringAt(e); }
      }
    }

    // ---- tyre fenders + ladders hung on the outer slab faces ----
    const fenderSlots = [];
    for (const run of marina ? [] : runs) {
      const dx = (run.bx - run.ax) / run.len, dz = (run.bz - run.az) / run.len;
      const mx = run.ax + dx * (run.s0 + run.s1) / 2 + run.nx * 0.3, mz = run.az + dz * (run.s0 + run.s1) / 2 + run.nz * 0.3;
      if (this._insideBounds(mx, mz)) continue; // notch edges: no fenders
      for (let s = run.s0 + 2.1; s < run.s1 - 1.5; s += 6.8) fenderSlots.push({ run, s, dx, dz });
    }
    const tyre = new THREE.TorusGeometry(0.34, 0.13, 6, 12);
    fenderSlots.forEach((f) => {
      const { run, s, dx, dz } = f;
      const x = run.ax + dx * s + run.nx * 0.16, z = run.az + dz * s + run.nz * 0.16;
      const yaw = Math.atan2(run.nx, run.nz);
      dockParts.push(xf(prep(tyre.clone(), '#3b3f47'), x, -0.66, z, yaw));
      dockParts.push(xf(cyl(0.022, 0.022, 0.42, 5, '#d8c69c'), x + run.nx * 0.02, -0.12, z + run.nz * 0.02));
    });
    // ladders near the moored boats
    const ladderAt = (x, z, nx, nz) => {
      const yaw = Math.atan2(nx, nz);
      const tx = Math.cos(yaw), tz = -Math.sin(yaw); // tangent
      const off = 0.08;
      for (const sd of [-0.28, 0.28]) dockParts.push(xf(cyl(0.035, 0.035, 2.3, 6, '#aab3bb'), x + nx * off + tx * sd, -0.95, z + nz * off + tz * sd));
      for (let y = -1.9; y < 0; y += 0.32) dockParts.push(xf(cyl(0.025, 0.025, 0.56, 5, '#aab3bb'), x + nx * off, y, z + nz * off, yaw, 0, Math.PI / 2));
      // grab rail loop over the top edge
      dockParts.push(tube([[x + nx * off + tx * 0.28, -0.1, z + nz * off + tz * 0.28], [x + nx * 0.02 + tx * 0.28, 0.02, z + nz * 0.02 + tz * 0.28]], 0.035, '#aab3bb'));
    };
    if (boatsSpec.length) {
      for (const [x, z, nx] of [[b.maxX, boatsSpec[0].z - 5.5, 1], [b.minX, boatsSpec[1].z + 4.5, -1]]) { const e = edgeAt(x, z, nx, 0); if (e) ladderAt(e.x, e.z, e.nx, e.nz); }
    }

    // ---- pilings (instanced) ----
    const pGeo = mergeGeometries([prep(new THREE.CylinderGeometry(1, 1, 1, 9, 1, true), '#ffffff'), xf(prep(new THREE.CircleGeometry(1, 9), '#ffffff'), 0, 0.5, 0, 0, -Math.PI / 2)]);
    xf(pGeo, 0, 0.5, 0);
    vcolorBy(pGeo, (x, y, z, nx, ny) => (ny > 0.5 ? new THREE.Color('#e3d8c4') : null));
    const pMat = patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }), this.U, { waterline: true });
    const pInst = new THREE.InstancedMesh(pGeo, pMat, pilings.length);
    const rnd = mulberry(5);
    const woodA = new THREE.Color('#b99c7d'), woodB = new THREE.Color('#a88d74'), conc = new THREE.Color('#b7b3aa'), tmp = new THREE.Color();
    const bottomY = WATER_Y - 3.5;
    pilings.forEach((p, i) => {
      const h = p[3] - bottomY;
      _m4.compose(_v.set(p[0], bottomY, p[1]), _q.setFromEuler(_e.set(0, rnd() * 6, 0)), _s.set(p[2], h, p[2]));
      pInst.setMatrixAt(i, _m4);
      if (p[2] >= 0.29) tmp.copy(conc); else tmp.copy(woodA).lerp(woodB, rnd());
      pInst.setColorAt(i, tmp);
    });
    pInst.name = 'Pilings';
    pInst.receiveShadow = true;
    pInst.castShadow = true;
    pInst.computeBoundingSphere();
    this.root.add(pInst);
    this.pilings = pInst;

    const dockMat = patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 }), this.U, { waterline: true });
    this.dockProps = new THREE.Mesh(dockParts.length ? mergeGeometries(dockParts) : new THREE.BufferGeometry(), dockMat);
    this.dockProps.name = 'DockProps';
    this.dockProps.receiveShadow = true;
    this.dockProps.castShadow = true;
    this.root.add(this.dockProps);

    // ---- moored boats ----
    const boatMat = patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.0 }), this.U, { waterline: true });
    this.moored = [];
    for (const bs of boatsSpec) {
      const geo = bs.kind === 'fishing' ? this._fishingBoatGeo() : bs.kind === 'launch' ? this._launchGeo() : this._rowboatGeo();
      const m = new THREE.Mesh(geo, boatMat);
      m.name = 'Moored_' + bs.kind;
      m.castShadow = true; m.receiveShadow = true;
      m.position.set(bs.x, WATER_Y, bs.z);
      m.rotation.y = bs.yaw;
      this.root.add(m);
      this.moored.push({ mesh: m, spec: bs, phase: rnd() * 10, roll: bs.kind === 'row' ? 0.05 : 0.025 });
    }
    this._foamShapes = foamShapes;
  }

  _fishingBoatGeo() {
    const parts = [hullGeo({ L: 8.6, B: 2.9, D: 0.75, F: 1.15, sheer: 0.55, hull: '#f4f1ea', stripe: '#5f93b8', bottom: '#d0675c', deck: '#d7c29c' })];
    // wheelhouse
    parts.push(xf(box(2.0, 1.6, 2.2, '#f7f5f0'), 0, 1.85, -0.9));
    parts.push(xf(box(2.25, 0.14, 2.5, '#5f93b8'), 0, 2.72, -0.9));
    for (const sx of [-1.01, 1.01]) parts.push(xf(box(0.04, 0.6, 1.5, '#23364a'), sx, 2.1, -0.9));
    parts.push(xf(box(1.6, 0.6, 0.04, '#23364a'), 0, 2.1, 0.21));
    // mast, boom, radar, lamp
    parts.push(xf(cyl(0.06, 0.08, 3.6, 6, '#e8e4dc'), 0, 3.9, -0.6));
    parts.push(beam(0, 3.2, -0.6, 0, 1.6, 3.2, 0.08, '#e8e4dc'));
    parts.push(xf(box(0.9, 0.08, 0.2, '#dfe3e6'), 0, 5.2, -0.6));
    parts.push(xf(sph(0.1, 8, 6, '#ffe7b0', 1), 0, 5.75, -0.6));
    // net drum + fish boxes + life ring
    parts.push(xf(cyl(0.45, 0.45, 1.3, 12, '#6b8f6a'), 0, 1.45, -3.1, 0, 0, Math.PI / 2));
    parts.push(xf(box(0.7, 0.35, 0.5, '#f0a66b'), 0.6, 1.2, 2.0));
    parts.push(xf(box(0.7, 0.35, 0.5, '#8cc3d9'), -0.5, 1.2, 2.3));
    parts.push(xf(prep(new THREE.TorusGeometry(0.28, 0.07, 6, 14), '#ff7f5c'), 1.03, 1.9, -1.2, Math.PI / 2));
    return mergeGeometries(parts);
  }
  _launchGeo() {
    const parts = [hullGeo({ L: 6.4, B: 2.3, D: 0.55, F: 0.85, sheer: 0.4, hull: '#dff0ec', stripe: '#e98b6d', bottom: '#3d5c7a', deck: '#e7dcc6' })];
    parts.push(xf(box(1.6, 0.9, 1.4, '#fbfaf7'), 0, 1.25, 0.4));
    parts.push(beam(-0.75, 1.7, 1.1, 0.75, 1.7, 1.1, 0.05, '#2a3b4d'));
    parts.push(xf(box(1.5, 0.5, 0.05, '#23364a'), 0, 1.95, 1.05, 0, -0.5));
    parts.push(xf(box(1.8, 0.08, 1.6, '#e98b6d'), 0, 2.15, 0.2));
    for (const sx of [-0.8, 0.8]) parts.push(xf(cyl(0.03, 0.03, 0.75, 5, '#d0d6da'), sx, 1.78, -0.45));
    parts.push(xf(box(0.45, 0.9, 0.5, '#3a3f47'), 0, 0.85, -3.35));
    parts.push(xf(box(1.9, 0.08, 1.6, '#e7dcc6'), 0, 0.85, -1.9));
    return mergeGeometries(parts);
  }
  _rowboatGeo() {
    const parts = [hullGeo({ L: 3.4, B: 1.35, D: 0.3, F: 0.45, sheer: 0.18, hull: '#f2d38b', stripe: '#c8745b', bottom: '#8e5b4a', deck: '#b58b62' })];
    for (const z of [-0.6, 0.45]) parts.push(xf(box(1.2, 0.06, 0.28, '#b58b62'), 0, 0.42, z));
    parts.push(beam(-0.5, 0.52, -0.2, 0.9, 0.3, 1.2, 0.05, '#d9b98c'));
    parts.push(beam(0.5, 0.52, -0.2, -0.3, 0.35, 1.3, 0.05, '#d9b98c'));
    return mergeGeometries(parts);
  }

  // ------------------------------------------------------------------ far scenery
  _buildScenery() {
    const U = this.U;
    const staticParts = [];
    const shoreMat = patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }), U, { shore: true });
    const rnd = mulberry(42);
    const islands = [];
    const terrainParts = [];
    const addIsland = (o) => { const isl = makeIsland(o); terrainParts.push(isl.geo); islands.push({ ...o, isl }); return isl; };

    // --- city land across the bay (east / north-east) + backdrop hills ---
    const [ccx, ccz] = polar(22, 900);
    const city = addIsland({ x: ccx, z: ccz, rx: 600, rz: 360, h: 3.2, seed: 3, rot: (22 + 90) * DEG, plateau: true, R: 10, S: 56, grass: '#c5d3ac' });
    this._cityIsland = city;
    this._cityFrame = { cx: ccx, cz: ccz, rot: (22 + 90) * DEG };
    for (const [a, d, rx, h, s] of [[8, 1450, 420, 210, 11], [40, 1520, 380, 260, 12], [68, 1380, 300, 170, 13], [-22, 1320, 330, 150, 14], [95, 1600, 360, 230, 15]]) {
      const [x, z] = polar(a, d); addIsland({ x, z, rx, rz: rx * 0.62, h: h * 0.85, seed: s, rot: (a + 90) * DEG, R: 20, S: 84, grass: '#7fb86f', ridge: 0.4 });
    }
    // --- west + south islands and headlands ---
    const isl = [
      { a: 178, d: 640, rx: 250, rz: 120, h: 72, seed: 21, trees: 60 },
      { a: 236, d: 300, rx: 42, rz: 30, h: 13, seed: 22, trees: 14 },
      { a: 300, d: 470, rx: 95, rz: 60, h: 28, seed: 23, trees: 22 },
      { a: 94, d: 1080, rx: 220, rz: 150, h: 62, seed: 24, trees: 26 },
      { a: 153, d: 1000, rx: 240, rz: 160, h: 70, seed: 25, trees: 30 },
      { a: 188, d: 1500, rx: 380, rz: 200, h: 120, seed: 26 },
      { a: 262, d: 1350, rx: 420, rz: 180, h: 150, seed: 27 },
      { a: 318, d: 1600, rx: 380, rz: 200, h: 210, seed: 28 },
      { a: 232, d: 1750, rx: 300, rz: 150, h: 90, seed: 29 },
    ];
    for (const o of isl) {
      const [x, z] = polar(o.a, o.d);
      const big = o.rx > 150;
      const r = addIsland({ x, z, rx: o.rx, rz: o.rz, h: o.h, seed: o.seed, rot: (o.a + 90) * DEG + (hash2(o.seed, 1) - 0.5), R: big ? 20 : 12, S: big ? 84 : 48, ridge: o.h > 100 ? 0.4 : 0.25, grass: o.h > 100 ? '#7fb86f' : '#8fca74' });
      o.isl = r;
    }
    // lighthouse outcrop
    const [lhx, lhz] = polar(248, 178);
    const rock = addIsland({ x: lhx, z: lhz, rx: 24, rz: 17, h: 7.5, seed: 31, rot: 0.4, R: 9, S: 32, ridge: 0.6, grass: '#a7cf8a' });
    const lhBase = rock.heightAt(lhx, lhz);
    this._buildLighthouse(staticParts, lhx, lhBase - 0.3, lhz);

    // --- port quay + cranes + containers (south-east) ---
    const [qx, qz] = polar(-52, 335);
    const qYaw = Math.atan2(-qx, -qz); // local +z faces the arena
    const quayTop = WATER_Y + 2.7;
    const quay = xf(box(210, quayTop - WATER_Y + 6, 80, '#cfc9bd'), qx, (quayTop + WATER_Y - 6) / 2, qz, qYaw);
    staticParts.push(quay);
    const toQ = (lx, lz) => { const c = Math.cos(qYaw), s = Math.sin(qYaw); return [qx + lx * c + lz * s, qz - lx * s + lz * c]; };
    const craneCols = ['#e8927f', '#6fa6cf', '#e8927f'];
    [-55, 0, 55].forEach((lx, i) => { const [x, z] = toQ(lx, 30); staticParts.push(this._craneGeo(x, quayTop, z, qYaw, craneCols[i])); });
    const contCols = ['#e9967a', '#7fb8c9', '#e8c56b', '#a99fd3', '#8fcf9f', '#f2efe8', '#d97f8f', '#6f9fd8'];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 12; col++) {
        if (rnd() < 0.18) continue;
        const stack = 1 + Math.floor(rnd() * 4);
        const lx = -85 + col * 14.5, lz = -25 + row * 3.1;
        for (let k = 0; k < stack; k++) {
          const [x, z] = toQ(lx + (rnd() - 0.5) * 0.6, lz);
          staticParts.push(xf(box(12.2, 2.6, 2.45, contCols[Math.floor(rnd() * contCols.length)]), x, quayTop + 1.3 + k * 2.6, z, qYaw + Math.PI / 2 + (rnd() - 0.5) * 0.02));
        }
      }
    }
    // quay lamps
    for (let lx = -100; lx <= 100; lx += 25) { const [x, z] = toQ(lx, 38); staticParts.push(xf(cyl(0.25, 0.3, 9, 5, '#9aa4ad'), x, quayTop + 4.5, z)); staticParts.push(xf(sph(0.9, 6, 4, '#ffd9a0', 1), x, quayTop + 9.3, z)); }

    // --- bridge (north) between the two headlands ---
    this._buildBridge(staticParts, polar(97, 960), polar(150, 890));

    // --- ferris wheel on the city waterfront ---
    let fwd = 470;
    for (; fwd < 900; fwd += 3) if (city.heightAt(...polar(4, fwd)) > WATER_Y + 2.6) break;
    const [fwx, fwz] = polar(4, fwd + 30);
    this._buildFerris(staticParts, fwx, city.heightAt(fwx, fwz) - 0.3, fwz);

    // --- waterfront promenade lights along the city shore ---
    for (let a = -14; a <= 58; a += 1.3) {
      let d = 480;
      for (; d < 900; d += 4) if (city.heightAt(...polar(a, d)) > WATER_Y + 2.2) break;
      if (d >= 900) continue;
      const [x, z] = polar(a, d + 6);
      staticParts.push(xf(cyl(0.3, 0.35, 7, 5, '#a3a9b3'), x, city.heightAt(x, z) + 3.5, z));
      staticParts.push(xf(sph(1.1, 6, 4, '#ffcf8f', 1), x, city.heightAt(x, z) + 7.4, z));
    }

    const terrainMat = patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), U, { terrain: true, shore: true });
    this.terrain = new THREE.Mesh(mergeGeometries(terrainParts), terrainMat);
    this.terrain.name = 'Terrain';
    this.terrain.frustumCulled = false;
    this.root.add(this.terrain);
    this.staticScenery = new THREE.Mesh(mergeGeometries(staticParts), shoreMat);
    this.staticScenery.name = 'FarScenery';
    this.staticScenery.frustumCulled = false;
    this.root.add(this.staticScenery);

    // --- city buildings (instanced boxes + round towers, window shader) ---
    this._buildCity(city, rnd);

    // --- trees on islands (instanced) ---
    const treeParts = [
      xf(cyl(0.35, 0.5, 3.2, 5, '#8a6a52'), 0, 1.6, 0),
      xf(sph(2.6, 8, 6, '#ffffff'), 0, 4.8, 0, 0.3, 0, 0, 1, 0.9, 1),
      xf(sph(1.8, 7, 5, '#ffffff'), 0.6, 6.5, 0.3, 1.1),
    ];
    const treeGeo = mergeGeometries(treeParts);
    const trees = [];
    for (const o of isl) {
      if (!o.trees) continue;
      let placed = 0, tries = 0;
      while (placed < o.trees && tries++ < o.trees * 12) {
        const [x, z] = o.isl.sample(rnd, 0.78);
        const y = o.isl.heightAt(x, z);
        if (y < WATER_Y + 2.2) continue;
        const sl = Math.abs(o.isl.heightAt(x + 3, z) - o.isl.heightAt(x - 3, z)) + Math.abs(o.isl.heightAt(x, z + 3) - o.isl.heightAt(x, z - 3));
        if (sl > 7) continue;
        trees.push([x, y - 0.3, z, 0.8 + rnd() * 1.1]);
        placed++;
      }
    }
    const treeMat = patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), U, {});
    const treeInst = new THREE.InstancedMesh(treeGeo, treeMat, trees.length);
    const tg = [new THREE.Color('#79b86a'), new THREE.Color('#5fa35e'), new THREE.Color('#93c979'), new THREE.Color('#6aa98a')];
    trees.forEach((t, i) => {
      _m4.compose(_v.set(t[0], t[1], t[2]), _q.setFromEuler(_e.set(0, rnd() * 6.28, 0)), _s.set(t[3], t[3] * (0.9 + rnd() * 0.4), t[3]));
      treeInst.setMatrixAt(i, _m4);
      treeInst.setColorAt(i, tg[i % tg.length]);
    });
    treeInst.name = 'Trees';
    treeInst.frustumCulled = false;
    this.root.add(treeInst);
    this.trees = treeInst;
  }

  _buildLighthouse(parts, x, y, z) {
    const bands = ['#f7f4ee', '#ea7f6e', '#f7f4ee', '#ea7f6e', '#f7f4ee'];
    const H = 17, r0 = 2.5, r1 = 1.75;
    parts.push(xf(cyl(3.4, 3.8, 2.2, 14, '#d9d2c4'), x, y + 1.1, z));
    for (let i = 0; i < bands.length; i++) {
      const t0 = i / bands.length, t1 = (i + 1) / bands.length;
      parts.push(xf(cyl(r0 + (r1 - r0) * t1, r0 + (r1 - r0) * t0, H / bands.length, 16, bands[i]), x, y + 2.2 + (t0 + t1) / 2 * H, z));
    }
    const top = y + 2.2 + H;
    parts.push(xf(cyl(2.5, 2.3, 0.45, 16, '#4c5661'), x, top + 0.22, z));
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; parts.push(xf(cyl(0.05, 0.05, 1.0, 4, '#4c5661'), x + Math.cos(a) * 2.35, top + 0.95, z + Math.sin(a) * 2.35)); }
    parts.push(xf(prep(new THREE.TorusGeometry(2.35, 0.06, 4, 24), '#4c5661'), x, top + 1.45, z, 0, Math.PI / 2));
    parts.push(xf(cyl(1.3, 1.3, 2.3, 12, '#ffe6a6', 1), x, top + 1.6, z));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; parts.push(xf(box(0.12, 2.3, 0.12, '#4c5661'), x + Math.cos(a) * 1.32, top + 1.6, z + Math.sin(a) * 1.32)); }
    parts.push(xf(cyl(0.2, 1.6, 1.3, 12, '#ea7f6e'), x, top + 3.4, z));
    parts.push(xf(sph(0.3, 8, 6, '#4c5661'), x, top + 4.1, z));
    // keeper's cottage
    const hx = x + 6.5, hz = z + 3;
    parts.push(xf(box(6, 3.2, 4.5, '#f4efe4'), hx, y + 1.3, hz, 0.4));
    parts.push(xf(prep(new THREE.CylinderGeometry(0.01, 3.5, 2.2, 4, 1), '#6f8fb7'), hx, y + 3.9, hz, 0.4 + Math.PI / 4, 0, 0, 1.25, 1, 0.9));
    parts.push(xf(box(0.9, 1.0, 0.05, '#ffe2a0', 1), hx + Math.sin(0.4) * 2.28, y + 1.6, hz + Math.cos(0.4) * 2.28, 0.4));
    this.lighthouseTop = new THREE.Vector3(x, top + 1.6, z);
    // rotating beam (sunset only)
    const bGeo = new THREE.CylinderGeometry(9, 0.4, 150, 20, 1, true);
    bGeo.translate(0, 75, 0); bGeo.rotateZ(-Math.PI / 2);
    const bMat = new THREE.ShaderMaterial({
      uniforms: { uNight: this.U.uNight, uCol: { value: new THREE.Color('#ffe2a8') } },
      vertexShader: /* glsl */`varying float vA; varying vec3 vN; varying vec3 vV;
        void main(){ vA = clamp(position.x / 150.0, 0.0, 1.0); vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`uniform float uNight; uniform vec3 uCol; varying float vA; varying vec3 vN; varying vec3 vV;
        void main(){ float e = pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.0); float a = e * pow(max(1.0 - vA, 0.0), 1.6) * smoothstep(0.0, 0.03, vA) * 0.5 * uNight;
          gl_FragColor = vec4(uCol * a, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    this.lhBeam = new THREE.Mesh(bGeo, bMat);
    this.lhBeam.name = 'LighthouseBeam';
    this.lhBeam.position.copy(this.lighthouseTop);
    this.lhBeam.frustumCulled = false;
    this.root.add(this.lhBeam);
  }

  _craneGeo(x, y, z, yaw, col) {
    const p = [];
    const W = '#f3f0ea';
    for (const lx of [-9, 9]) for (const lz of [-7, 7]) p.push(xf(box(1.4, 38, 1.4, col), lx, 19, lz));
    for (const lz of [-7, 7]) p.push(xf(box(20, 1.8, 1.6, col), 0, 38, lz));
    for (const lx of [-9, 9]) { p.push(xf(box(1.6, 1.8, 16, col), lx, 38, 0)); p.push(xf(box(1.0, 1.2, 14, col), lx, 16, 0)); }
    for (const lz of [-7, 7]) { p.push(beam(-9, 2, lz, 9, 36, lz, 0.6, col)); p.push(xf(box(20, 1.2, 1.2, col), 0, 22, lz)); }
    p.push(xf(box(3.2, 3.2, 100, W), 0, 41, 20));
    p.push(xf(box(4.6, 1.2, 100, col), 0, 39, 20));
    for (const sx of [-4, 4]) { p.push(beam(sx, 40, -6, 0, 64, -8, 1.1, col)); p.push(beam(sx, 40, 6, 0, 64, -8, 1.0, col)); }
    p.push(beam(0, 64, -8, 0, 42.5, 68, 0.35, '#8f9aa5'));
    p.push(beam(0, 64, -8, 0, 42.5, 40, 0.35, '#8f9aa5'));
    p.push(beam(0, 64, -8, 0, 42.5, -28, 0.35, '#8f9aa5'));
    p.push(xf(box(10, 6, 12, W), 0, 45.5, -20));
    p.push(xf(box(8, 1, 10, col), 0, 49, -20));
    p.push(xf(box(3, 3.8, 4, W), 0, 36, 10));
    p.push(xf(box(4, 2.2, 6, '#7a8591'), 0, 38.4, 34));
    p.push(beam(0, 37.5, 34, 0, 16, 34, 0.25, '#58626c'));
    p.push(xf(box(3, 1.2, 12, '#e8c56b'), 0, 15.5, 34));
    p.push(xf(sph(0.8, 6, 4, '#ff4a3a', 2), 0, 65, -8));
    p.push(xf(sph(0.7, 6, 4, '#ff4a3a', 2), 0, 43.5, 69));
    for (const lx of [-9, 9]) for (const lz of [-7, 7]) p.push(xf(box(2.4, 1.6, 3.2, '#5c6670'), lx, 0.8, lz));
    const g = mergeGeometries(p);
    return xf(g, x, y, z, yaw);
  }

  _buildBridge(parts, A, B) {
    const ax = A[0], az = A[1], bx = B[0], bz = B[1];
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L, uz = (bz - az) / L; // along
    const px = -uz, pz = ux;                         // lateral
    const yaw = Math.atan2(ux, uz);
    const deckY = 32, towerH = 100, col = '#e59c86', cable = '#d98c77';
    const at = (t, lat, y) => [ax + ux * L * t + px * lat, y, az + uz * L * t + pz * lat];
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    parts.push(xf(box(22, 3.2, L + 120, '#d8d3ca'), mx, deckY, mz, yaw));
    parts.push(xf(box(22.5, 1.2, L + 120, col), mx, deckY - 2.1, mz, yaw));
    const towers = [0.22, 0.78];
    for (const t of towers) {
      for (const lat of [-10.5, 10.5]) { const [x, y, z] = at(t, lat, 0); parts.push(xf(box(4.2, towerH + 6, 4.2, col), x, WATER_Y + (towerH + 6) / 2 - 4, z, yaw)); }
      for (const h of [deckY + 22, deckY + 48, towerH - 6]) { const [x, , z] = at(t, 0, 0); parts.push(xf(box(25, 3, 3.4, col), x, WATER_Y + h, z, yaw)); }
      const [fx, , fz] = at(t, 0, 0);
      parts.push(xf(box(30, 8, 10, '#cfc9bd'), fx, WATER_Y + 1, fz, yaw));
    }
    for (const lat of [-10.5, 10.5]) {
      const tA = towers[0], tB = towers[1];
      const topY = WATER_Y + towerH - 2;
      const main = [], left = [], right = [];
      for (let i = 0; i <= 24; i++) { const t = tA + (tB - tA) * (i / 24); const s = i / 24; main.push(at(t, lat, topY - (topY - deckY - 3) * (1 - Math.pow(2 * s - 1, 2)))); }
      for (let i = 0; i <= 8; i++) { const s = i / 8; left.push(at(-0.05 + (tA + 0.05) * s, lat, deckY + 1 + (topY - deckY - 1) * s * s)); right.push(at(tB + (1.05 - tB) * s, lat, topY - (topY - deckY - 1) * (1 - (1 - s) * (1 - s)))); }
      for (const c of [main, left, right]) parts.push(tube(c, 1.0, cable, 5));
      for (let i = 1; i < 24; i++) { const p = main[i]; parts.push(xf(box(0.7, p[1] - deckY, 0.7, cable), p[0], (p[1] + deckY) / 2, p[2])); }
      for (let i = 0; i <= 24; i += 2) { const p = main[i]; parts.push(xf(sph(1.2, 6, 4, '#fff1c9', 1), p[0], p[1] + 1.2, p[2])); }
      for (let t = -0.04; t <= 1.04; t += 0.035) { const p = at(t, lat * 1.02, deckY + 2.4); parts.push(xf(sph(0.9, 5, 3, '#ffcf8f', 1), p[0], p[1], p[2])); }
    }
    for (const t of towers) for (const lat of [-10.5, 10.5]) { const [x, , z] = at(t, lat, 0); parts.push(xf(sph(1.0, 6, 4, '#ff4a3a', 2), x, WATER_Y + towerH + 2, z)); }
  }

  _buildFerris(parts, x, y, z) {
    const R = 24, hubY = y + R + 5;
    const yaw = Math.atan2(-x, -z); // wheel faces the arena
    // static support A-frames + base
    const legs = [];
    for (const side of [-3.2, 3.2]) { legs.push(beam(-12, 0, side, 0, R + 5, side * 0.35, 1.1, '#f1ede6')); legs.push(beam(12, 0, side, 0, R + 5, side * 0.35, 1.1, '#f1ede6')); }
    legs.push(xf(box(30, 1.5, 12, '#d6cfc2'), 0, 0.3, 0));
    legs.push(xf(box(10, 5, 8, '#8fbfd9'), 0, 2.5, 0));
    parts.push(xf(mergeGeometries(legs), x, y, z, yaw));
    // rotating wheel
    const w = [];
    for (const off of [-1.8, 1.8]) w.push(xf(prep(new THREE.TorusGeometry(R, 0.45, 5, 64), '#f6f3ee'), 0, 0, off));
    const N = 18;
    const cabCols = ['#ff9f8a', '#8fd0e0', '#ffd27a', '#b6a6e8', '#9fdcae', '#ff9fc4'];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      for (const off of [-1.8, 1.8]) w.push(beam(0, 0, off, ca * R, sa * R, off, 0.28, '#e7e2da'));
      w.push(beam(ca * R, sa * R, -1.8, ca * R, sa * R, 1.8, 0.3, '#e7e2da'));
      w.push(xf(box(2.4, 2.6, 2.4, cabCols[i % cabCols.length]), ca * (R + 1.5), sa * (R + 1.5) - 1.2, 0));
      w.push(xf(sph(0.55, 5, 3, '#fff0c0', 1), ca * (R + 0.2), sa * (R + 0.2), 2.3));
      const a2 = a + Math.PI / N; w.push(xf(sph(0.45, 5, 3, '#ffc2e0', 1), Math.cos(a2) * (R * 0.55), Math.sin(a2) * (R * 0.55), 2.1));
    }
    w.push(xf(cyl(1.6, 1.6, 5, 10, '#d6cfc2'), 0, 0, 0, 0, Math.PI / 2));
    this._ferrisGeo = mergeGeometries(w);
    this._ferrisPose = { x, y: hubY, z, yaw };
  }

  // Procedural skyline: every building is unique geometry (tiers/setbacks, cornices, podiums, rooftop units, water
  // towers, crowns, spires, slanted tops) merged into one mesh. Attribute 'bld' = (facade style, seed, base y) drives the
  // HZ_CITY facade shader (window rows, mullions, glass reflectance, night lights).
  _buildCity(city, rnd) {
    const U = this.U;
    const F = this._cityFrame;
    const cr = Math.cos(F.rot), sr = Math.sin(F.rot);
    const TX = [cr, sr], TZ = [-sr, cr];            // along-shore / toward the arena
    const ryGrid = -F.rot;
    const all = [];
    const PAL = [
      ['#eee4d2', '#d8cab0'], ['#e8c4b0', '#d3a791'], ['#f4f2ed', '#d9d6cf'], ['#eadbb6', '#d3bf94'],
      ['#d4dbe1', '#bac4cc'], ['#dcd4ea', '#c4bad9'], ['#d2e6d8', '#b6d1be'], ['#f1d8d6', '#dcbcba'], ['#e3ddd3', '#c9c0b2'],
    ];
    const GLASS = [['#a9c0d2', '#e6ebef'], ['#a6cbc9', '#e3ecea'], ['#bcc1d8', '#e9eaf1'], ['#b8cfdc', '#eef2f4']];
    const tag = (g, style, seed, baseY) => {
      const n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = style; a[i * 3 + 1] = seed; a[i * 3 + 2] = baseY; }
      g.setAttribute('bld', new THREE.BufferAttribute(a, 3));
      return g;
    };
    const tint = (g, k) => { const c = g.attributes.color.array; for (let i = 0; i < c.length; i++) c[i] *= k; return g; };
    // building in local space (x along TX, z along TZ), then placed
    const place = (parts, x, z, ry) => { for (const g of parts) { xf(g, x, 0, z, ry); all.push(g); } };

    const makeBuilding = (x, z, ry, w, d, h, gy, core) => {
      const P = [];
      const seed = rnd();
      const tall = h > 88, mid = h > 38;
      const glassy = tall ? rnd() < 0.72 : mid && rnd() < 0.3;
      const pal = glassy ? GLASS[Math.floor(rnd() * GLASS.length)] : PAL[Math.floor(rnd() * PAL.length)];
      const style = glassy ? (rnd() < 0.8 ? 3 : 4) : tall ? 4 : mid ? [1, 2, 4, 1][Math.floor(rnd() * 4)] : (rnd() < 0.6 ? 1 : 2);
      const k = 0.95 + rnd() * 0.1;
      const B = (bw, bh, bd, by, hex, st, ox = 0, oz = 0, glow = 0) => { P.push(tag(tint(xf(box(bw, bh, bd, hex, glow), ox, by + bh / 2, oz), k), st, seed, gy)); };
      let y = gy - 0.6, tw = w, td = d, rem = h;
      if (h > 70 && rnd() < 0.5) { const ph = 9 + rnd() * 6; B(w * 1.32, ph, d * 1.3, y, pal[1] === '#e6ebef' ? '#dfe3e6' : pal[0], 2); B(w * 1.36, 0.8, d * 1.34, y + ph - 0.4, pal[1], 0); y += ph; rem -= ph; }
      const tiers = tall && rnd() < 0.8 ? (h > 140 ? 3 : 2) : (mid && rnd() < 0.3 ? 2 : 1);
      const fr = tiers === 1 ? [1] : tiers === 2 ? [0.7, 0.3] : [0.56, 0.27, 0.17];
      for (let i = 0; i < tiers; i++) {
        const th = rem * fr[i];
        B(tw, th, td, y, pal[0], style);
        B(tw + 0.9, 0.8, td + 0.9, y + th - 0.5, pal[1], 0);
        y += th;
        if (i < tiers - 1) { const sh = 0.7 + rnd() * 0.14; tw *= sh; td *= 0.7 + rnd() * 0.14; }
      }
      // roof
      const rr = rnd();
      const gray = '#b7bcc2';
      if (tall && rr < 0.28) {                       // stepped art-deco crown + spire
        let cw = tw, cd = td, cy = y;
        for (let j = 0; j < 3; j++) { cw *= 0.72; cd *= 0.72; const ch = 5 - j; B(cw, ch, cd, cy, pal[0], 0); cy += ch; }
        P.push(tag(xf(cyl(0.25, 0.7, 16, 6, '#d6dadf'), 0, cy + 8, 0), 0, seed, gy));
        P.push(tag(xf(sph(0.8, 6, 4, '#ff4a3a', 2), 0, cy + 16.4, 0), 0, seed, gy));
      } else if (tall && rr < 0.5) {                 // slanted glass top
        const sg = prep(new THREE.BoxGeometry(tw, 16, td), pal[0]);
        const pa = sg.attributes.position;
        for (let i = 0; i < pa.count; i++) if (pa.getY(i) > 0 && pa.getX(i) > 0) pa.setY(i, pa.getY(i) - 13);
        sg.computeVertexNormals();
        P.push(tag(tint(xf(sg, 0, y + 8, 0), k), 3, seed, gy));
      } else if (tall && rr < 0.72) {                // antenna mast pair
        B(tw * 0.5, 4, td * 0.5, y, gray, 0);
        for (const [ax, ah] of [[-tw * 0.12, 18 + rnd() * 16], [tw * 0.14, 10 + rnd() * 8]]) {
          P.push(tag(xf(cyl(0.3, 0.45, ah, 5, '#d0d4d9'), ax, y + 4 + ah / 2, 0), 0, seed, gy));
          P.push(tag(xf(sph(0.75, 6, 4, '#ff4a3a', 2), ax, y + 4 + ah + 0.4, 0), 0, seed, gy));
        }
      } else if (tall) {                             // pyramid cap
        P.push(tag(xf(cyl(0.01, Math.min(tw, td) * 0.7, 12, 4, rnd() < 0.5 ? '#9cc4b4' : '#d9a58e'), 0, y + 6, 0, Math.PI / 4), 0, seed, gy));
      } else if (mid && rr < 0.4) {                  // wooden water tower on stilts
        const wx = (rnd() - 0.5) * tw * 0.4, wz = (rnd() - 0.5) * td * 0.4;
        for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1]]) P.push(tag(xf(box(0.25, 3.2, 0.25, '#6b5a4c'), wx + lx, y + 1.6, wz + lz), 0, seed, gy));
        P.push(tag(xf(cyl(1.7, 1.7, 3.4, 10, '#b58d67'), wx, y + 4.9, wz), 0, seed, gy));
        P.push(tag(xf(cyl(0.12, 1.9, 1.5, 10, '#8b7361'), wx, y + 7.3, wz), 0, seed, gy));
      } else {                                       // rooftop units / plant room
        const n = 1 + Math.floor(rnd() * 3);
        for (let j = 0; j < n; j++) {
          const uw = 2.5 + rnd() * 4, ud = 2.5 + rnd() * 4, uh = 1.4 + rnd() * 2.2;
          B(uw, uh, ud, y, j === 0 && rnd() < 0.5 ? pal[1] : gray, 0, (rnd() - 0.5) * (tw - uw) * 0.8, (rnd() - 0.5) * (td - ud) * 0.8);
        }
        if (rnd() < 0.4) P.push(tag(xf(cyl(0.7, 0.7, 2.2, 8, '#c4c8cc'), (rnd() - 0.5) * tw * 0.6, y + 1.1, (rnd() - 0.5) * td * 0.6), 0, seed, gy));
      }
      place(P, x, z, ry);
    };

    const roundTower = (x, z, r, h, gy, hex, crownHex) => {
      const seed = rnd();
      const P = [];
      P.push(tag(xf(cyl(r, r, h, 24, hex), 0, gy - 0.6 + h / 2, 0), 5, seed, gy));
      P.push(tag(xf(cyl(r + 0.6, r + 0.6, 0.9, 24, crownHex), 0, gy + h - 0.9, 0), 0, seed, gy));
      P.push(tag(xf(cyl(r * 0.55, r * 0.8, 6, 16, crownHex), 0, gy + h + 2.4, 0), 0, seed, gy));
      place(P, x, z, 0);
    };

    // --- landmarks ---
    const lm = [];
    const at = (a, dd) => { const [x, z] = polar(a, dd); return [x, z, city.heightAt(x, z)]; };
    { // observation needle on the waterfront
      const [x, z, gy] = at(13, 600); const P = []; const sd = rnd();
      P.push(tag(xf(cyl(2.2, 4.2, 128, 12, '#eef0f2'), 0, gy + 64, 0), 0, sd, gy));
      for (let j = 0; j < 3; j++) { const a = j * 2.094; P.push(tag(beam(Math.cos(a) * 9, gy, Math.sin(a) * 9, Math.cos(a) * 2, gy + 40, Math.sin(a) * 2, 1.2, '#e3e6ea'), 0, sd, gy)); }
      P.push(tag(xf(cyl(12, 7, 6, 28, '#f5f6f8'), 0, gy + 125, 0), 0, sd, gy));
      P.push(tag(xf(cyl(12.6, 12.6, 3.4, 28, '#9fb7c9'), 0, gy + 129.7, 0), 5, sd, gy + 128));
      P.push(tag(xf(cyl(7, 12.6, 3, 28, '#f5f6f8'), 0, gy + 132.9, 0), 0, sd, gy));
      for (let j = 0; j < 14; j++) { const a = (j / 14) * Math.PI * 2; P.push(tag(xf(sph(0.6, 5, 3, '#fff0c8', 1), Math.cos(a) * 12.4, gy + 128.2, Math.sin(a) * 12.4), 0, sd, gy)); }
      P.push(tag(xf(cyl(0.45, 1.1, 36, 6, '#dfe2e6'), 0, gy + 152, 0), 0, sd, gy));
      P.push(tag(xf(sph(0.9, 6, 4, '#ff4a3a', 2), 0, gy + 170.5, 0), 0, sd, gy));
      place(P, x, z, 0); lm.push([x, z, 22]);
    }
    { // twisting tower
      const [x, z, gy] = at(27, 790); const P = []; const sd = rnd();
      for (let j = 0; j < 40; j++) { const g = tag(xf(box(25, 4.25, 25, '#aec6d6'), 0, gy + j * 4.2 + 2.1, 0, j * 0.042), 3, sd, gy); P.push(g); }
      P.push(tag(xf(box(18, 3, 18, '#e8edf0'), 0, gy + 169.5, 0, 40 * 0.042), 0, sd, gy));
      P.push(tag(xf(cyl(0.35, 0.8, 26, 6, '#dfe2e6'), 0, gy + 184, 0), 0, sd, gy));
      P.push(tag(xf(sph(0.9, 6, 4, '#ff4a3a', 2), 0, gy + 197.5, 0), 0, sd, gy));
      place(P, x, z, ryGrid); lm.push([x, z, 24]);
    }
    { // domed civic hall on the waterfront
      const [x, z, gy] = at(41, 590); const P = []; const sd = rnd();
      P.push(tag(xf(box(46, 12, 30, '#f2ece0'), 0, gy + 5.4, 0), 1, sd, gy));
      P.push(tag(xf(box(47, 1, 31, '#dccfb8'), 0, gy + 11.6, 0), 0, sd, gy));
      P.push(tag(xf(cyl(12, 12, 9, 28, '#efe8da'), 0, gy + 16.5, 0), 1, sd, gy));
      P.push(tag(xf(prep(new THREE.SphereGeometry(12.4, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#9fcabd'), 0, gy + 21, 0), 0, sd, gy));
      P.push(tag(xf(cyl(1.6, 1.6, 4, 10, '#f2ece0'), 0, gy + 35, 0), 0, sd, gy));
      P.push(tag(xf(sph(1.9, 10, 6, '#9fcabd'), 0, gy + 37.5, 0), 0, sd, gy));
      place(P, x, z, ryGrid); lm.push([x, z, 30]);
    }
    { // twin towers + sky bridge
      const [x, z, gy] = at(5, 770); const sd = rnd(); const P = [];
      for (const sx of [-15, 15]) {
        P.push(tag(xf(box(20, 124, 20, '#b7c9d8'), sx, gy + 61.4, 0), 3, sd, gy));
        P.push(tag(xf(box(21, 1, 21, '#eef1f3'), sx, gy + 123.5, 0), 0, sd, gy));
        P.push(tag(xf(box(12, 8, 12, '#b7c9d8'), sx, gy + 128, 0), 3, sd, gy));
        P.push(tag(xf(cyl(0.3, 0.6, 20, 5, '#dfe2e6'), sx, gy + 142, 0), 0, sd, gy));
        P.push(tag(xf(sph(0.8, 6, 4, '#ff4a3a', 2), sx, gy + 152.4, 0), 0, sd, gy));
      }
      P.push(tag(xf(box(10, 6, 7, '#e9edf0'), 0, gy + 84, 0), 2, sd, gy));
      place(P, x, z, ryGrid); lm.push([x, z, 32]);
    }
    { // stepped art-deco tower with spire
      const [x, z, gy] = at(34, 705); makeBuilding(x, z, ryGrid, 30, 30, 150, gy, 1); lm.push([x, z, 24]);
    }
    { // slant-topped glass tower
      const [x, z, gy] = at(19, 840); const sd = rnd(); const P = [];
      P.push(tag(xf(box(30, 160, 24, '#a9c0d2'), 0, gy + 79.4, 0), 3, sd, gy));
      const sg = prep(new THREE.BoxGeometry(30, 26, 24), '#a9c0d2'); const pa = sg.attributes.position;
      for (let i = 0; i < pa.count; i++) if (pa.getY(i) > 0 && pa.getX(i) > 0) pa.setY(i, pa.getY(i) - 22);
      sg.computeVertexNormals();
      P.push(tag(xf(sg, 0, gy + 172, 0), 3, sd, gy));
      place(P, x, z, ryGrid); lm.push([x, z, 24]);
    }
    const nearLandmark = (x, z, r) => lm.some((l) => Math.hypot(l[0] - x, l[1] - z) < l[2] + r);

    // --- street grid of blocks ---
    const [dcx, dcz] = polar(24, 760);
    const pitch = 46;
    for (let bx = -13; bx <= 13; bx++) {
      for (let bz = -8; bz <= 8; bz++) {
        const bxw = F.cx + TX[0] * bx * pitch + TZ[0] * bz * pitch, bzw = F.cz + TX[1] * bx * pitch + TZ[1] * bz * pitch;
        if (city.localF(bxw, bzw) > 0.78) continue;
        if (city.heightAt(bxw, bzw) < WATER_Y + 2.4) continue;
        const dist = Math.hypot(bxw - dcx, bzw - dcz);
        const core = Math.max(0, 1 - dist / 380);
        const lots = rnd() < 0.35 + core * 0.3 ? [[0, 0, 1]] : rnd() < 0.6 ? [[-0.25, 0, 0.5], [0.25, 0, 0.5]] : [[-0.25, -0.25, 0.5], [0.25, -0.25, 0.5], [-0.25, 0.25, 0.5], [0.25, 0.25, 0.5]];
        for (const [lx, lz, sz] of lots) {
          if (rnd() < 0.08) continue;
          const ox = lx * pitch + (rnd() - 0.5) * 3, oz = lz * pitch + (rnd() - 0.5) * 3;
          const x = bxw + TX[0] * ox + TZ[0] * oz, z = bzw + TX[1] * ox + TZ[1] * oz;
          const span = (pitch - 10) * sz;
          const w = span * (0.72 + rnd() * 0.28), d = span * (0.72 + rnd() * 0.28);
          if (nearLandmark(x, z, Math.max(w, d) * 0.6)) continue;
          const gy = city.heightAt(x, z);
          if (gy < WATER_Y + 2.4) continue;
          let h = 12 + rnd() * 22 + core * core * (50 + rnd() * 110) * (sz === 1 ? 1 : 0.7);
          if (bz >= 5) h = Math.min(h, 26 + rnd() * 16);   // lower waterfront edge
          if (h > 60 && rnd() < 0.1) { roundTower(x, z, Math.min(w, d) * 0.5, h, gy, '#d9e3ec', '#eef1f3'); continue; }
          makeBuilding(x, z, ryGrid + (rnd() - 0.5) * 0.04, w, d, h, gy, core);
        }
      }
    }
    const geo = mergeGeometries(all);
    const mat = patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 }), U, { city: true });
    this.city = new THREE.Mesh(geo, mat);
    this.city.name = 'CitySkyline';
    this.city.frustumCulled = false;
    this.root.add(this.city);
  }

  // ------------------------------------------------------------------ living things: sailboats, buoys, gulls, ferris wheel
  _buildLife() {
    const U = this.U;
    const rnd = mulberry(77);
    // ferris wheel (rotating)
    const fMat = this.staticScenery.material;
    this.ferris = new THREE.Mesh(this._ferrisGeo, fMat);
    this.ferris.name = 'FerrisWheel';
    this.ferris.position.set(this._ferrisPose.x, this._ferrisPose.y, this._ferrisPose.z);
    this.ferris.rotation.set(0, this._ferrisPose.yaw, 0, 'YXZ');
    this.ferris.frustumCulled = false;
    this.root.add(this.ferris);

    // sailboats (instanced)
    const sp = [hullGeo({ L: 7, B: 2.3, D: 0.7, F: 0.8, sheer: 0.3, hull: '#fbfaf6', stripe: '#6fa6cf', bottom: '#d0675c', deck: '#d8c7a4' })];
    sp.push(xf(cyl(0.07, 0.09, 10, 6, '#e6e2da'), 0, 5.8, 0.4));
    sp.push(beam(0, 1.8, 0.4, 0, 1.7, -3.2, 0.1, '#e6e2da'));
    sp.push(triGeo([0, 1.9, 0.3, 0, 10.4, 0.3, 0, 1.9, -3.1], '#fffdf7'));
    sp.push(triGeo([0, 1.3, 3.4, 0, 9.8, 0.55, 0, 1.3, 0.6], '#fff4e8'));
    sp.push(xf(box(0.5, 0.3, 0.05, '#ff8f7a'), 0.2, 10.7, 0.4));
    const sGeo = mergeGeometries(sp);
    const sMat = patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), U, {});
    const sails = [[192, 150, 1], [285, 240, -1], [74, 235, 1], [160, 335, -1], [334, 205, 1], [40, 310, -1], [120, 420, 1]];
    this.sailboats = sails.map(([a, d, dir]) => ({ a: a * DEG, d, w: dir * (0.9 + rnd() * 0.5) / d, phase: rnd() * 10, s: 0.9 + rnd() * 0.35 }));
    this.sailInst = new THREE.InstancedMesh(sGeo, sMat, this.sailboats.length);
    this.sailInst.name = 'Sailboats';
    this.sailInst.frustumCulled = false;
    this.sailInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.sailInst);

    // buoys (instanced, tinted)
    const bp = [
      xf(cyl(0.42, 0.5, 1.3, 12, '#ffffff'), 0, 0.2, 0),
      xf(cyl(0.05, 0.42, 0.7, 12, '#ffffff'), 0, 1.2, 0),
      xf(prep(new THREE.TorusGeometry(0.55, 0.12, 4, 10), '#3b3f47'), 0, -0.05, 0, 0, Math.PI / 2),
      xf(cyl(0.03, 0.03, 0.6, 4, '#4b525b'), 0.15, 1.6, 0), xf(cyl(0.03, 0.03, 0.6, 4, '#4b525b'), -0.15, 1.6, 0),
      xf(sph(0.12, 8, 6, '#fff6d8', 1), 0, 1.95, 0),
    ];
    const bGeo = mergeGeometries(bp);
    const bMat = patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), U, { waterline: true });
    const b = this.bounds;
    const buoySpec = [];
    const chx = 0.625, chz = -0.781; // channel toward the port
    for (let i = 0; i < 4; i++) {
      const cx = 62 + i * 40 * chx, cz = -70 + i * 40 * chz;
      buoySpec.push({ x: cx - chz * 14, z: cz + chx * 14, col: '#ef6b61', s: 1.1 });
      buoySpec.push({ x: cx + chz * 14, z: cz - chx * 14, col: '#4fb47e', s: 1.1 });
    }
    for (const [x, z, col] of [[b.maxX + 16, 12, '#ffd463'], [b.minX - 18, -6, '#ffd463'], [8, b.maxZ + 17, '#f7f5f0'], [-14, b.minZ - 16, '#f7f5f0'], [b.maxX + 26, -30, '#ef9d61'], [b.minX - 30, 40, '#ef9d61']]) buoySpec.push({ x, z, col, s: 0.85 });
    this.buoys = buoySpec.map((s) => ({ ...s, phase: rnd() * 10 }));
    this.buoyInst = new THREE.InstancedMesh(bGeo, bMat, this.buoys.length);
    this.buoys.forEach((s, i) => this.buoyInst.setColorAt(i, new THREE.Color(s.col)));
    this.buoyInst.name = 'Buoys';
    this.buoyInst.frustumCulled = false;
    this.buoyInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.buoyInst);
    for (const s of this.buoys) this._foamShapes.push({ ax: s.x, az: s.z, bx: s.x, bz: s.z, r: 0.55 * s.s });
    if (!this._marina) this._buildFoamField(this._foamShapes);

    // gulls (instanced, wing flap in the vertex shader)
    const gp = [];
    gp.push(xf(sph(0.5, 8, 6, '#fbfbf8'), 0, 0, 0, 0, 0, 0, 0.22, 0.2, 0.72));
    gp.push(xf(sph(0.14, 8, 6, '#fbfbf8'), 0, 0.08, 0.38));
    gp.push(xf(prep(new THREE.ConeGeometry(0.04, 0.16, 5), '#f2b340'), 0, 0.06, 0.55, 0, Math.PI / 2));
    gp.push(triGeo([0, 0, -0.35, 0, 0, -0.62, 0.14, 0, -0.55], '#e9ecef'));
    gp.push(triGeo([0, 0, -0.35, 0, 0, -0.62, -0.14, 0, -0.55], '#e9ecef'));
    for (const sx of [1, -1]) {
      gp.push(triGeo([0.05 * sx, 0.02, 0.2, 0.62 * sx, 0.02, 0.12, 0.05 * sx, 0.02, -0.2, 0.62 * sx, 0.02, 0.12, 0.62 * sx, 0.02, -0.18, 0.05 * sx, 0.02, -0.2], '#f4f5f6'));
      gp.push(triGeo([0.62 * sx, 0.02, 0.12, 1.15 * sx, 0.02, -0.16, 0.62 * sx, 0.02, -0.18], '#9aa3ad'));
    }
    const gGeo = mergeGeometries(gp);
    const N = 11;
    const ph = new Float32Array(N);
    this.gulls = [];
    for (let i = 0; i < N; i++) {
      const grp = i % 4;
      const centers = [[0, 0, 58, 26], [b.maxX + 35, -20, 28, 18], [b.minX - 40, 30, 34, 22], [70, 90, 45, 30]];
      const c = centers[grp];
      this.gulls.push({ cx: c[0], cz: c[1], r: c[2] * (0.8 + rnd() * 0.4), h: c[3] + (rnd() - 0.5) * 6, w: (0.18 + rnd() * 0.12) * (rnd() < 0.5 ? 1 : -1), a0: rnd() * 6.28, s: 1.4 + rnd() * 0.4 });
      ph[i] = rnd();
    }
    gGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
    const gMat = patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }), U, { gull: true });
    this.gullInst = new THREE.InstancedMesh(gGeo, gMat, N);
    this.gullInst.name = 'Gulls';
    this.gullInst.frustumCulled = false;
    this.gullInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.gullInst);
    this._animate(0);
  }

  // ------------------------------------------------------------------ public API
  // Water surface height at (x, z) (includes the gentle swell). Matches the sea vertex shader.
  waterHeightAt(x, z, t = this.time) {
    let d = 1e5;
    const M = this._marinaData;
    for (const set of M ? [M.decks, M.wet] : [this.footprint]) for (const r of set) {
      const ex = Math.max(r.minX - x, x - r.maxX, 0), ez = Math.max(r.minZ - z, z - r.maxZ, 0);
      if (ex * ex + ez * ez < d * d) d = Math.min(d, sdRectJS(r, x, z));   // (a rect is never nearer than its AABB)
    }
    let amp = 0.035 + (0.16 - 0.035) * smooth(3, 70, d);
    if (M) {   // sheltered basin (matches basinK in the sea vertex shader)
      const b = this.bounds, qx = Math.abs(x - (b.minX + b.maxX) / 2) - (b.maxX - b.minX) / 2, qz = Math.abs(z - (b.minZ + b.maxZ) / 2) - (b.maxZ - b.minZ) / 2;
      const da = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
      amp *= 0.45 + 0.55 * smooth(60, 210, da);
    }
    const h = 0.45 * Math.sin(x * 0.11 + z * 0.047 + t * 0.95) + 0.35 * Math.sin(-x * 0.052 + z * 0.097 + t * 1.13 + 1.7) + 0.2 * Math.sin(x * 0.173 - z * 0.141 + t * 1.61 + 4.1);
    return WATER_Y + h * amp;
  }

  // Points every ~step m along the exposed deck edges — the real (possibly turned) outline, not the rects' AABBs:
  // { x, z, nx, nz } 5 cm out from the face, with its outward normal (e.g. sea-spray FX candidates).
  deckEdges(step = 1.6) {
    const out = [];
    for (const r of this._runs || []) {
      const L = r.s1 - r.s0, n = Math.max(1, Math.floor(L / step)), dx = (r.bx - r.ax) / r.len, dz = (r.bz - r.az) / r.len;
      for (let i = 0; i < n; i++) { const s = r.s0 + (L * (i + 0.5)) / n; out.push({ x: r.ax + dx * s + r.nx * 0.05, z: r.az + dz * s + r.nz * 0.05, nx: r.nx, nz: r.nz }); }
    }
    return out;
  }

  // How lively the water at the stage edges is, 0..1 (FX: wave slaps / spray bursts against the decks). Marina basins
  // are sheltered and glassy: keep spray to a rare, small lap.
  get seaState() { return this._marina ? 0.15 : 1; }

  // Sky colours for other modules (e.g. UI tint, character rim light). Linear THREE.Colors — do not mutate.
  getSkyColors() {
    const U = this.U;
    return {
      zenith: U.uZenith.value, sky: U.uSkyMid.value, horizon: U.uHorizon.value, ground: this.hemi.groundColor,
      sun: this.sun.color, sunColor: this.sun.color, sunIntensity: this.sun.intensity, sunDir: U.uSunDir.value,
      fog: this.fogColor, cloud: U.uCloudLit.value, night: U.uNight.value,
    };
  }

  // New stage: rebuild everything that hugs the deck (pilings, fenders/ladders, moored boats, foam field) and refit the
  // sun's shadow camera to the new arena bounds.
  rebuildForArena(bounds, rects) {
    this._marina = this._stageMarina();
    this.bounds = { ...bounds };
    this.footprint = (rects && rects.length ? rects : [this.bounds]).map(orect);
    this._rebuildDock();
    this._buildStageLook();
    this._applyMarina();
    this._fitShadow();
    this._bakeFarReflection();
  }

  // pilings / dock kit / moored boats / foam field for the current footprint + mode
  _rebuildDock() {
    for (const o of [this.pilings, this.dockProps, ...(this.moored || []).map((m) => m.mesh)]) {
      if (!o) continue;
      this.root.remove(o);
      o.geometry?.dispose();
    }
    this._buildDock();
    for (const s of this.buoys || []) this._foamShapes.push({ ax: s.x, az: s.z, bx: s.x, bz: s.z, r: 0.55 * s.s });
    if (!this._marina) this._buildFoamField(this._foamShapes);   // marina: _applyMarina builds it with the contours
  }

  // Replace the deck outline (array of rects, see orect()) → foam/under-deck shading follow. Pilings are built once.
  setFootprint(rects) {
    this.footprint = rects.map(orect);
    this._syncDeckShading();
  }

  // ------------------------------------------------------------------ stage looks (layout.env — see the top of the file)
  _stageEnv() { return G.level?.layout?.env || null; }

  // the theme with the stage's overrides (env.theme.all, then env.theme[name]); nested grade / marina merge too
  _stageTheme(name) {
    const base = THEMES[name] || THEMES.day, E = this._stageEnv();
    const ovs = [E?.theme?.all, E?.theme?.[name]].filter(Boolean);
    if (!ovs.length) return base;
    const T = { ...base };
    for (const o of ovs) for (const [k, v] of Object.entries(o)) T[k] = v && typeof v === 'object' && !Array.isArray(v) && T[k] && typeof T[k] === 'object' && !Array.isArray(T[k]) ? { ...T[k], ...v } : v;
    return T;
  }

  // the stage's env differs from the one the current theme was applied with: main.js re-applies the theme
  get lookStale() { return (this._lookEnv || null) !== this._stageEnv(); }

  // the Inkopolis-bay far scenery in one group (a stage elsewhere hides it: env.bay === false)
  _groupBay() {
    this.bay = new THREE.Group();
    this.bay.name = 'BayScenery';
    for (const o of [this.terrain, this.staticScenery, this.city, this.trees, this.lhBeam, this.ferris, this.sailInst]) if (o) { this.root.remove(o); this.bay.add(o); }
    this.root.add(this.bay);
  }

  // Build the current stage's look: bay on / off, its own backdrop, terrain snow, weather, stars. Cheap when the stage
  // (its layout) is the one already built.
  _buildStageLook() {
    const L = G.level?.layout || null, E = L?.env || null;
    if (this._lookLayout === L && this._lookBuilt) return;
    this._lookLayout = L; this._lookBuilt = true;
    // dispose the previous stage's pieces
    for (const o of this._stageObjs || []) { this.root.remove(o); o.traverse?.((c) => { c.geometry?.dispose(); if (c.material && !c.material._shared) c.material.dispose(); }); }
    this._stageObjs = []; this._backdropAnim = null; this.snowFx = null; this.mistFx = null; this.stars = null;
    this.bay.visible = E?.bay !== false;
    if (this.gullInst) this.gullInst.visible = E?.gulls !== false;
    if (this.buoyInst) this.buoyInst.visible = E?.buoys !== false && this.bay.visible;
    this.U.uSnow.value.set(E?.snow?.line ?? 1e4, E?.snow?.cover ?? 0, 0, 0);
    if (!E) return;
    const add = (o) => {
      if (!o) return o;
      o.frustumCulled = false;
      // transparent looks (mist, water sheets …) sit out the GTAO normal / depth pass (scene.overrideMaterial), which
      // would draw them as solid occluders (dark cards on the water) — the zone marks' / ribbons' gate
      o.traverse?.((c) => { if (c.isMesh && c.onBeforeRender === THREE.Object3D.prototype.onBeforeRender && [].concat(c.material).some((m) => m && m.transparent)) c.onBeforeRender = aoGate; });
      this.root.add(o); this._stageObjs.push(o);
      return o;
    };
    if (typeof E.backdrop === 'function') {
      try {
        const kit = { ...SCENERY_KIT, THREE, bounds: { ...this.bounds }, runs: this._runs || [], rnd: mulberry, U: this.U,
          sceneryMaterial: (flags = {}, params = {}) => patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, ...params }), this.U, flags) };
        const out = E.backdrop(kit) || {};
        const U = this.U;
        const mesh = (geos, mat, name) => { if (!geos || !geos.length) return null; const m = new THREE.Mesh(mergeGeometries(geos.map((g) => prep(g))), mat); m.name = name; return m; };
        add(mesh(out.static, patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }), U, { shore: true }), 'StageBackdrop'));
        add(mesh(out.plain, patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }), U, {}), 'StageBackdropPlain'));
        add(mesh(out.terrain, patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), U, { terrain: true, shore: true }), 'StageTerrain'));
        for (const [i, inst] of (out.instances || []).entries()) {
          if (!inst?.geo || !inst.list?.length) continue;
          const im = new THREE.InstancedMesh(prep(inst.geo), patchScenery(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: inst.doubleSided ? THREE.DoubleSide : THREE.FrontSide }), U, {}), inst.list.length);
          const c = new THREE.Color();
          inst.list.forEach((t, k) => {
            _m4.compose(_v.set(t[0], t[1], t[2]), _q.setFromEuler(_e.set(0, t[4] || 0, 0)), _s.setScalar(t[3] || 1));
            im.setMatrixAt(k, _m4);
            im.setColorAt(k, c.set(t[5] || '#ffffff'));
          });
          im.name = 'StageBackdropInst' + i;
          add(im);
        }
        for (const o of out.objects || []) add(o);
        if (typeof out.animate === 'function') this._backdropAnim = out.animate;
      } catch (e) { console.error('[inkwave] stage backdrop failed', e); }
    }
    const W = E.weather || {};
    if (W.snow) this.snowFx = add(this._makeSnow(W.snow === true ? {} : W.snow));
    if (W.mist) this.mistFx = add(this._makeMist(W.mist === true ? {} : W.mist));
    if (E.stars) this.stars = add(this._makeStars(E.stars === true ? {} : E.stars));
  }

  // falling snow: points in a box that wraps round the camera (one draw call, no per-frame CPU work)
  _makeSnow({ count = 2600, fall = 1.1, size = 0.09, box = 44, color = '#ffffff' } = {}) {
    const rnd = mulberry(913), pos = new Float32Array(count * 3), ph = new Float32Array(count);
    for (let i = 0; i < count; i++) { pos[i * 3] = rnd() * box; pos[i * 3 + 1] = rnd() * box * 0.5; pos[i * 3 + 2] = rnd() * box; ph[i] = rnd(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: this.U.uTime, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(box, box * 0.5, box) }, uFall: { value: fall }, uSize: { value: size }, uCol: { value: new THREE.Color(color) }, uNight: this.U.uNight },
      vertexShader: /* glsl */`uniform float uTime, uFall, uSize; uniform vec3 uCam, uBox; attribute float aPh; varying float vA;
        void main(){
          vec3 p = position; float t = uTime;
          p.y -= t * uFall * (0.75 + 0.5 * aPh);
          p.x += sin(t * 0.7 + aPh * 40.0) * 0.6 + t * 0.35; p.z += cos(t * 0.53 + aPh * 23.0) * 0.6;
          vec3 o = uCam - uBox * vec3(0.5, 0.35, 0.5);
          p = o + mod(p - o, uBox);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z; vA = smoothstep(0.4, 1.4, d) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, d));
          gl_PointSize = uSize * (0.7 + 0.6 * aPh) * projectionMatrix[1][1] * 540.0 / max(d, 0.1);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`uniform vec3 uCol; uniform float uNight; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(c)) * vA * 0.85; if (a < 0.01) discard;
          gl_FragColor = vec4(uCol * mix(1.0, 0.55, uNight), a); }`,
      transparent: true, depthWrite: false, fog: false,
    });
    const pts = new THREE.Points(g, m);
    pts.name = 'Snowfall';
    pts.renderOrder = 8000;
    return pts;
  }

  // mist: soft fog banks lying on the water round the arena — a few flat layers (so it reads from above and from the
  // decks alike, never cutting into the sea) with drifting noise holes; denser at grazing angles like a real layer
  _makeMist({ layers = 3, height = 2.4, reach = 110, inner = 5, opacity = 0.5, scale = 0.03, color = null } = {}) {
    const b = this.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, hx = (b.maxX - b.minX) / 2, hz = (b.maxZ - b.minZ) / 2;
    const parts = [];
    for (let k = 0; k < layers; k++) {
      const g = new THREE.PlaneGeometry(2 * (hx + reach), 2 * (hz + reach), 1, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(cx, WATER_Y + 0.25 + (height * (k + 0.5)) / layers, cz);
      g.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(4).fill(k), 1));
      g.deleteAttribute('uv'); g.deleteAttribute('normal');
      parts.push(g);
    }
    const geo = mergeGeometries(parts);
    const U = this.U;
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uHorizon: U.uHorizon, uSkyMid: U.uSkyMid, uCol: { value: new THREE.Color(color || '#ffffff') }, uTint: { value: color ? 1 : 0 },
        uOp: { value: opacity }, uBox: { value: new THREE.Vector4(cx, cz, hx, hz) }, uReach: { value: new THREE.Vector3(inner, reach, scale) } },
      vertexShader: /* glsl */`attribute float aLayer; varying vec3 vW; varying float vL;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vL = aLayer; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`uniform float uTime, uTint, uOp; uniform vec3 uHorizon, uSkyMid, uCol, uReach; uniform vec4 uBox; varying vec3 vW; varying float vL;
        float h2(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), u.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), u.x), u.y); }
        void main(){
          vec2 q = abs(vW.xz - uBox.xy) - uBox.zw;
          float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);           // metres outside the arena's box
          float mask = smoothstep(uReach.x, uReach.x + 14.0, d) * (1.0 - smoothstep(uReach.y * 0.65, uReach.y, d));
          vec2 p = vW.xz * uReach.z + vec2(uTime * 0.012, uTime * 0.007) * (1.0 + vL * 0.4) + vL * 7.3;
          float n = vn(p) * 0.55 + vn(p * 2.3 + 4.1) * 0.3 + vn(p * 5.1 - 2.7) * 0.15;
          float a = smoothstep(0.34, 0.78, n) * mask * uOp;
          vec3 V = normalize(vW - cameraPosition);
          a *= clamp(0.2 / max(abs(V.y), 0.02), 0.55, 3.0);                   // a layer seen edge-on is thicker
          a = min(a, 0.8);
          if (a < 0.004) discard;
          vec3 col = mix(mix(uHorizon, uSkyMid, 0.25) * 1.05, uCol, uTint);
          gl_FragColor = vec4(col, a); }`,
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = 'Mist';
    mesh.renderOrder = 7990;
    return mesh;
  }

  // stars: points on the far plane (like the sky dome), fading in with the dusk themes' night amount
  _makeStars({ count = 1400, size = 1.6 } = {}) {
    const rnd = mulberry(4242), pos = new Float32Array(count * 3), ph = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const y = 0.06 + Math.pow(rnd(), 0.8) * 0.94, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r; ph[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: this.U.uTime, uK: { value: 0 }, uSize: { value: size } },
      vertexShader: /* glsl */`uniform float uTime, uSize; attribute float aPh; varying float vA;
        void main(){ vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = vec4(p.xy, p.w * 0.99998, p.w);
          vA = (0.35 + 0.65 * aPh * aPh) * (0.75 + 0.25 * sin(uTime * (1.5 + aPh * 3.0) + aPh * 60.0)) * smoothstep(0.05, 0.3, position.y);
          gl_PointSize = uSize * (0.6 + aPh * 1.2); }`,
      fragmentShader: /* glsl */`uniform float uK; varying float vA;
        void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA * uK; if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * a * 1.6, 1.0); }`,
      transparent: true, depthWrite: false, depthTest: true, depthFunc: THREE.LessEqualDepth, blending: THREE.AdditiveBlending, fog: false,
    });
    const pts = new THREE.Points(g, m);
    pts.name = 'Stars';
    pts.renderOrder = 9001;
    return pts;
  }

  setTheme(name) {
    const T = this._stageTheme(name);
    const r0 = this.renderer;
    this.theme = THEMES[name] ? name : 'day';
    this._lookEnv = this._stageEnv();
    const U = this.U;
    const el = T.sunEl * DEG, az = T.sunAz * DEG;
    U.uSunDir.value.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    U.uZenith.value.set(T.zenith); U.uSkyMid.value.set(T.skyMid); U.uHorizon.value.set(T.horizon); U.uGround.value.set(T.ground);
    U.uHorizonGlow.value.copy(lin(T.horizonGlow, T.horizonGlowK)); U.uGlowColor.value.set(T.glowColor);
    U.uGlowParams.value.set(...T.glow);
    U.uHaze.value.set(T.haze[0], T.haze[1], T.haze[2], 0);
    U.uNight.value = T.night;
    U.uSunDisk.value.copy(lin(T.sunDisk, T.sunDiskK));
    U.uSunCos.value = Math.cos(T.sunRadius * DEG);
    U.uCloudLit.value.copy(lin(T.cloudLit, T.cloudLitK)); U.uCloudShade.value.set(T.cloudShade);
    U.uCloudParams.value.set(...T.cloud);
    U.uSeaDeep.value.set(T.seaDeep); U.uSeaShallow.value.set(T.seaShallow); U.uSeaCrest.value.set(T.seaCrest); U.uFoamColor.value.set(T.foam);
    // sky / clouds / sea keep the sun strength they were tuned with (skySun) — the key light on the world is balanced on
    // its own (sunIntensity vs hemi + envK) without re-exposing the sky
    U.uSunLight.value.copy(lin(T.sunColor, (T.skySun ?? T.sunIntensity) / Math.PI));
    U.uSeaAmbient.value.copy(U.uSkyMid.value).lerp(U.uHorizon.value, 0.5).multiplyScalar(T.seaAmbientK);
    U.uSunSpec.value = T.sunSpec; U.uWaveStrength.value = T.waveStrength;
    this.grade = T.grade;    // colour grade the renderer applies for this theme
    // sky extras (compiled in only for themes that use them, so the other themes run the exact same shader)
    const shafts = !!T.shafts;
    if (('SKY_SHAFTS' in this.skyMat.defines) !== shafts) {
      if (shafts) this.skyMat.defines.SKY_SHAFTS = ''; else delete this.skyMat.defines.SKY_SHAFTS;
      this.skyMat.needsUpdate = true;
    }
    // marina water: mode switch rebuilds the dock kit (the level may also have changed since the last call)
    const stageMarina = this._stageMarina();
    if (stageMarina !== this._marina) { this._marina = stageMarina; this._rebuildDock(); }
    // marina look for this light (every theme resolves to a full set, so nothing lingers from the previous one)
    const MA = { channel: null, shade: null, calm: 0.55, lap: 1.0, caustic: 1.5, wet: 0.5, ...(T.marina || {}) };
    if (MA.channel) U.uChannelCol.value.set(MA.channel); else U.uChannelCol.value.set(T.seaDeep).multiplyScalar(0.65);
    if (MA.shade) U.uShadeCol.value.set(MA.shade); else U.uShadeCol.value.set(T.seaDeep).multiplyScalar(0.12);
    U.uMarinaK.value.x = MA.calm; U.uMarinaK.value.y = MA.lap; U.uMarinaK.value.z = 0.35;
    U.uStripK.value.set(MA.caustic, MA.wet, 0, 0);
    this._applyMarina();

    this.sun.color.set(T.sunColor);
    this.sun.intensity = T.sunIntensity;
    // sky fill = directional hemisphere (sky above, warm ground bounce below) + the omnidirectional sky IBL; both set
    // here on every theme change so a stage/time looks identical whether it was booted into or switched to
    // hemiGroundK: the ground term is the sunlit deck's bounce (fake GI) — brighter than the sky term, which the IBL
    // already carries — so walls and faces turned away from the sun keep their form instead of crushing to black
    this.hemi.color.set(T.hemiSky); this.hemi.groundColor.set(T.hemiGround).multiplyScalar(T.hemiGroundK ?? 1);
    this.hemi.intensity = T.hemiIntensity;
    this.scene.environmentIntensity = T.envK ?? 0.66;
    this.fogColor.copy(U.uHorizon.value).lerp(U.uSkyMid.value, 0.15);
    if (this.scene.fog && this.scene.fog.isFog) { this.scene.fog.color.copy(this.fogColor); this.scene.fog.near = T.fog[0]; this.scene.fog.far = T.fog[1]; }
    this.lhBeam.visible = T.night > 0.01 && this.bay.visible;
    if (this.stars) this.stars.material.uniforms.uK.value = T.night * (T.stars ?? 1);
    this._fitShadow();
    const cc = r0.getClearColor(new THREE.Color()), ca = r0.getClearAlpha();
    this._bakeClouds(T);
    r0.setClearColor(cc, ca);
    this._rebuildEnvMap();
    this._bakeFarReflection();
  }

  update(dt, camera) {
    dt = Math.min(dt || 0, 0.1);
    this.time += dt;
    this._frameId++;
    this.U.uTime.value = this.time;
    if (camera) this.sky.position.copy(camera.position);
    if (camera && this.snowFx) this.snowFx.material.uniforms.uCam.value.copy(camera.position);
    this._animate(dt);
    if (this._backdropAnim) this._backdropAnim(this.time);
  }

  _animate() {
    const t = this.time;
    // moored boats: gentle bob + roll
    for (const m of this.moored) {
      const s = m.spec;
      m.mesh.position.y = this.waterHeightAt(s.x, s.z, t) + 0.03 * Math.sin(t * 1.3 + m.phase);
      m.mesh.rotation.z = m.roll * Math.sin(t * 0.9 + m.phase);
      m.mesh.rotation.x = 0.012 * Math.sin(t * 0.7 + m.phase * 2);
    }
    // sailboats circle the bay slowly
    for (let i = 0; this.sailInst.visible && i < this.sailboats.length; i++) {
      const s = this.sailboats[i];
      const a = s.a + s.w * t;
      const x = Math.cos(a) * s.d, z = Math.sin(a) * s.d;
      const heading = Math.atan2(-Math.sin(a) * Math.sign(s.w), Math.cos(a) * Math.sign(s.w)); // tangent
      const y = this.waterHeightAt(x, z, t);
      _e.set(0.03 * Math.sin(t * 0.8 + s.phase), heading, (0.13 + 0.05 * Math.sin(t * 0.6 + s.phase)) * Math.sign(s.w), 'YXZ');
      _m4.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s.setScalar(s.s));
      this.sailInst.setMatrixAt(i, _m4);
    }
    this.sailInst.instanceMatrix.needsUpdate = true;
    // buoys bob and tilt
    for (let i = 0; i < this.buoys.length; i++) {
      const b = this.buoys[i];
      const y = this.waterHeightAt(b.x, b.z, t) + 0.06 * Math.sin(t * 1.7 + b.phase);
      _e.set(0.09 * Math.sin(t * 1.1 + b.phase), b.phase, 0.09 * Math.cos(t * 0.93 + b.phase * 1.3), 'YXZ');
      _m4.compose(_v.set(b.x, y, b.z), _q.setFromEuler(_e), _s.setScalar(b.s));
      this.buoyInst.setMatrixAt(i, _m4);
    }
    this.buoyInst.instanceMatrix.needsUpdate = true;
    // gulls circle + bank
    for (let i = 0; i < this.gulls.length; i++) {
      const g = this.gulls[i];
      const a = g.a0 + g.w * t;
      const x = g.cx + Math.cos(a) * g.r, z = g.cz + Math.sin(a) * g.r;
      const y = g.h + Math.sin(t * 0.4 + g.a0) * 1.5;
      const dir = Math.sign(g.w);
      const yaw = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
      _e.set(0, yaw, -0.35 * dir, 'YXZ');
      _m4.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s.setScalar(g.s));
      this.gullInst.setMatrixAt(i, _m4);
    }
    this.gullInst.instanceMatrix.needsUpdate = true;
    // ferris wheel + lighthouse beam
    this.ferris.rotation.z = t * 0.045;
    this.lhBeam.rotation.y = t * 0.55;
  }

  dispose() {
    this.scene.remove(this.root, this.sun, this.sun.target, this.hemi);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    if (this._envRT) this._envRT.dispose();
    this._cloudRT?.dispose(); this._cloudMat?.dispose();
    this._reflRT?.dispose(); this._farRT?.dispose(); this._stripMat?.dispose(); this._underMat?.dispose();
    this._pmrem.dispose();
    this.U.uWaveTex.value?.dispose(); this.U.uFoamTex.value?.dispose(); this._fieldRT?.dispose(); this._fieldMat?.dispose(); this._fieldQuad?.geometry.dispose();
  }
}
