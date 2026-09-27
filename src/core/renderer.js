// Renderer + post stack (MSAA HDR target → optional GTAO → bloom → final: bloom add + grade/vignette + tone map/sRGB).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { QUALITY } from '../config.js';
import { G } from './ctx.js';

// The shadow pass draws every caster with one shared depth material, whose program key flips between instanced, skinned
// and plain meshes (a full program lookup per switch). Those get their own unless they need three's per-material variant.
function ownDepthMaterial(proto, variants) {
  const mats = Array.from({ length: variants }, () => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  Object.defineProperty(proto, 'customDepthMaterial', {
    get() {
      if (this._cdm !== undefined) return this._cdm;
      const m = this.material;
      if (Array.isArray(m) || m.alphaTest > 0 || m.alphaToCoverage || m.displacementMap || m.clippingPlanes?.length) return undefined;
      return mats[this.instanceColor ? 1 : 0];
    },
    set(v) { this._cdm = v; },
  });
}
ownDepthMaterial(THREE.InstancedMesh.prototype, 2);
ownDepthMaterial(THREE.SkinnedMesh.prototype, 1);

// The last full-screen pass: bloom's additive composite (UnrealBloomPass's own blend step is switched off), the colour
// grade and, when it draws to the canvas, tone mapping + sRGB (what OutputPass did). One read + one write of the frame
// instead of three. With screen FX running it renders the HDR variant and screen FX → OutputPass finish the frame.
const FINAL_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tDiffuse; uniform sampler2D tBloom;
  uniform float uSat; uniform float uVignette; uniform float uHurt; uniform vec3 uHurtColor; uniform float uFlash; uniform float uAspect;
  uniform float uVib; uniform float uContrast; uniform vec3 uShadowTint; uniform vec3 uHighTint; uniform float uLift;
  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>
  varying vec2 vUv;
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    // bloom, added as UnrealBloomPass's blend did (premultiplied AdditiveBlending = ONE, ONE); 1×1 black when off
    c += texture2D(tBloom, vUv);
    float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    // vibrance: muted colours gain saturation, already-saturated ones (team ink) barely move
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    float chroma = (mx - mn) / max(mx, 1e-4);
    c.rgb = max(mix(vec3(l), c.rgb, uSat + uVib * (1.0 - smoothstep(0.1, 0.7, chroma))), 0.0);
    // contrast in log space around mid grey (keeps HDR highlights ordered), then a cool-shadow / warm-light split tone
    c.rgb = 0.18 * pow(max(c.rgb, vec3(1e-6)) / 0.18, vec3(uContrast)) + uLift;
    // split tone is for the world's neutrals: strongly saturated colours (team ink) keep their exact hue
    float lt = smoothstep(0.015, 0.55, l);
    c.rgb *= mix(vec3(1.0), mix(uShadowTint, uHighTint, lt), 1.0 - 0.85 * smoothstep(0.35, 0.8, chroma));
    vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(q);
    float v = smoothstep(0.55, 1.25, r);
    c.rgb *= 1.0 - uVignette * v;
    // low health: the HUD draws the coloured edge; here we only drain saturation + darken the rim slightly
    float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    c.rgb = mix(c.rgb, vec3(lum), uHurt * 0.45);
    c.rgb *= 1.0 - uHurt * 0.25 * smoothstep(0.4, 1.2, r);
    c.rgb += uFlash;
    #ifdef TO_SCREEN
      #if defined( NEUTRAL_TONE_MAPPING )
        c.rgb = NeutralToneMapping(c.rgb);
      #elif defined( ACES_FILMIC_TONE_MAPPING )
        c.rgb = ACESFilmicToneMapping(c.rgb);
      #elif defined( AGX_TONE_MAPPING )
        c.rgb = AgXToneMapping(c.rgb);
      #elif defined( LINEAR_TONE_MAPPING )
        c.rgb = LinearToneMapping(c.rgb);
      #endif
      #ifdef SRGB_TRANSFER
        c = sRGBTransferOETF(c);
      #endif
    #endif
    gl_FragColor = c;
  }`;
const FINAL_VERT = /* glsl */`
  precision highp float;
  uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
  attribute vec3 position; attribute vec2 uv;
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TONE_DEFINE = { [THREE.NeutralToneMapping]: 'NEUTRAL_TONE_MAPPING', [THREE.ACESFilmicToneMapping]: 'ACES_FILMIC_TONE_MAPPING', [THREE.AgXToneMapping]: 'AGX_TONE_MAPPING', [THREE.LinearToneMapping]: 'LINEAR_TONE_MAPPING' };

class FinalPass extends Pass {
  constructor(renderer) {
    super();
    this.uniforms = {
      tDiffuse: { value: null }, tBloom: { value: null }, toneMappingExposure: { value: 1 },
      uSat: { value: 1.08 },
      uVib: { value: 0.12 },                               // extra saturation for muted colours only (ink never clips)
      uContrast: { value: 1.07 },                          // log-space contrast around mid grey
      uShadowTint: { value: new THREE.Vector3(0.975, 0.99, 1.035) },
      uHighTint: { value: new THREE.Vector3(1.025, 1.0, 0.972) },
      uLift: { value: 0.0 },
      uVignette: { value: 0.22 },
      uHurt: { value: 0 },
      uHurtColor: { value: new THREE.Color(1, 0.2, 0.3) },
      uFlash: { value: 0 },
      uAspect: { value: 1.7 },
    };
    const screen = { TO_SCREEN: '' };
    if (TONE_DEFINE[renderer.toneMapping]) screen[TONE_DEFINE[renderer.toneMapping]] = '';
    if (THREE.ColorManagement.getTransfer(renderer.outputColorSpace) === THREE.SRGBTransfer) screen.SRGB_TRANSFER = '';
    const mat = (defines) => new THREE.RawShaderMaterial({ name: 'InkwaveFinal', uniforms: this.uniforms, defines, vertexShader: FINAL_VERT, fragmentShader: FINAL_FRAG, depthTest: false, depthWrite: false });
    this.hdrMaterial = mat({});
    this.screenMaterial = mat(screen);
    this._quad = new FullScreenQuad(this.screenMaterial);
    this._black = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    this._black.needsUpdate = true;
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.toneMappingExposure.value = renderer.toneMappingExposure;
    u.tBloom.value = this.bloom && this.bloom.enabled ? this.bloom.renderTargetsHorizontal[0].texture : this._black;
    this._quad.material = this.renderToScreen ? this.screenMaterial : this.hdrMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this._quad.render(renderer);
  }
}

// r186's PCF filter uses a 5-tap rotated Vogel disk with per-pixel noise, which reads as grainy stipple on every soft
// shadow edge. Swap it for a noise-free 3×3 grid of hardware-compared (bilinear) taps: smooth and temporally stable.
(function patchShadowFilter() {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const re = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \)[\s\S]*?\) \* 0\.2;/;
  if (!re.test(chunk)) { console.warn('[inkwave] shadow chunk layout changed; keeping stock PCF'); return; }
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(re, `vec2 ts = texelSize * max( shadowRadius * 0.55, 0.6 );
				float s9 = 0.0;
				for ( int sx = -1; sx <= 1; sx ++ ) for ( int sy = -1; sy <= 1; sy ++ ) s9 += texture( shadowMap, vec3( shadowCoord.xy + vec2( float( sx ), float( sy ) ) * ts, shadowCoord.z ) );
				shadow = s9 * ( 1.0 / 9.0 );`);
})();

export class Renderer {
  constructor(container, settings) {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.info.autoReset = false;
    // Pin every program: three destroys a GL program once no material uses it, and characters / showcase / podium are
    // disposed and rebuilt on every menu <-> match switch, so each switch re-linked the same shaders (a blocking
    // 0.5-1 s). Never freed: the variant set is bounded (~200 programs).
    const progs = r.info.programs;
    progs.push = (...p) => { for (const x of p) x.usedTimes++; return Array.prototype.push.apply(progs, p); };
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(0x9fd8f0, 1);
    container.appendChild(r.domElement);
    r.domElement.id = 'game-canvas';
    this.container = container;
    this.scene = null; this.camera = null;
    this.settings = settings;
    this.q = QUALITY[settings.quality] || QUALITY.high;
    this._w = 0; this._h = 0;
  }

  setScene(scene, camera) {
    this.scene = scene; this.camera = camera;
    this._buildComposer();
  }

  _buildComposer() {
    const r = this.renderer, q = this.q;
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
    this.dynScale = this.dynScale || 1;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio) * this.dynScale;
    r.setPixelRatio(pr);
    const w = window.innerWidth, h = window.innerHeight;
    r.setSize(w, h);
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: q.msaa || 0 });
    const comp = (this.composer = new EffectComposer(r, rt));
    comp.setPixelRatio(pr);
    comp.setSize(w, h);
    this.renderPass = new RenderPass(this.scene, this.camera);
    comp.addPass(this.renderPass);
    this.gtao = null;
    if (q.ao) {
      const ao = (this.gtao = new GTAOPass(this.scene, this.camera, w, h));
      // half-res AO: a soft term (the level also has baked AO), and full res cost ~3 ms/frame at 2560x1600
      const aoSize = ao.setSize.bind(ao);
      ao.setSize = (aw, ah) => aoSize(Math.max(1, aw >> 1), Math.max(1, ah >> 1));
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 1.0;
      ao.updateGtaoMaterial({ radius: 0.75, distanceExponent: 1.6, thickness: 1.0, scale: 1.15, samples: 12, distanceFallOff: 1.0 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      comp.addPass(ao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.45, 2.4);
    this.bloom.enabled = !!(q.bloom && this.settings.bloom);
    comp.addPass(this.bloom);
    this._gradeSrc = null;
    // bloom stops at its composite texture; the final pass adds it (one full-screen blend fewer)
    this.bloom.blendMaterial.visible = false;
    this.grade = new FinalPass(r);
    this.grade.bloom = this.bloom;
    comp.addPass(this.grade);
    // optional screen-FX pass (src/fx/screenfx.js) — HDR linear, so while it runs the final pass stays HDR and
    // OutputPass tone maps after it; otherwise the final pass draws straight to the canvas
    if (this.extraPass) comp.addPass(this.extraPass);
    comp.addPass((this.output = new OutputPass()));
    r.shadowMap.enabled = this.settings.shadows !== false;
    this._w = w; this._h = h;
    this.grade.uniforms.uAspect.value = w / h;
  }

  // Install (or replace) the screen-FX post pass; kept across quality/setting rebuilds.
  setExtraPass(pass) {
    this.extraPass = pass;
    if (this.scene) this._buildComposer();
  }

  applySettings(settings) {
    const prevQ = this.q;
    this.settings = settings;
    this.q = QUALITY[settings.quality] || QUALITY.high;
    const shadowChanged = this.renderer.shadowMap.enabled !== (settings.shadows !== false);
    if (prevQ !== this.q || shadowChanged) {
      if (prevQ !== this.q) this.dynScale = 1;
      this._buildComposer();
      this.scene?.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((mm) => (mm.needsUpdate = true)); } });
    }
    if (this.bloom) this.bloom.enabled = !!(this.q.bloom && settings.bloom);
  }

  // Dynamic resolution (never on ultra): scale the render density between 0.75 and 1 of the quality preset.
  setDynamicScale(s) {
    s = Math.max(0.75, Math.min(1, s));
    if (Math.abs(s - this.dynScale) < 0.01) return;
    this.dynScale = s;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio) * s;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this._w, this._h);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (w === this._w && h === this._h) return;
    this._w = w; this._h = h;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / h;
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }

  render() {
    this.resize();
    // colour grade recommended by the environment theme (day / dusk)
    const gr = G.env && G.env.grade;
    if (gr && gr !== this._gradeSrc && this.grade) {
      this._gradeSrc = gr;
      const u = this.grade.uniforms;
      for (const k of ['uSat', 'uVib', 'uContrast', 'uLift', 'uVignette']) if (gr[k] !== undefined) u[k].value = gr[k];
      if (gr.uShadowTint) u.uShadowTint.value.set(...gr.uShadowTint);
      if (gr.uHighTint) u.uHighTint.value.set(...gr.uHighTint);
    }
    if (this.output) this.output.enabled = this.forceOutput || !!(this.extraPass && this.extraPass.enabled);
    this.composer.render();
  }
}
