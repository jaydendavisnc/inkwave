// INKWAVE — boot, main loop and game-flow orchestration (menus ⇄ attract mode ⇄ matches ⇄ results).
import * as THREE from 'three';
import { G, on, clamp, damp } from './core/ctx.js';
import { Renderer } from './core/renderer.js';
import { Input } from './core/input.js';
import { mapTheme,
  DEFAULT_SETTINGS, QUALITY, TEAM_PALETTES, COLORBLIND_PALETTE, TEAM_NAMES, WEAPONS, WEAPON_ORDER, SUB, SPECIALS,
  MAPS, DIFFICULTY, PLAYER, PROGRESSION, VERSION, MATCH,
} from './config.js';
import { Level } from './world/level.js';
import { MAP_LAYOUTS } from './world/maps.js';
import { PaintSystem } from './world/paint.js';
import { createLevelMaterial } from './world/levelMaterial.js';
import { SwimWake } from './fx/swimWake.js';
import { Decor } from './world/decor.js';
import { createMuralTexture } from './world/murals.js';
import { layoutThumbSVG } from './world/mapThumb.js';
import { dressingFor } from './world/dressing.js';
import { Physics, Hit } from './game/physics.js';
import { NavGraph } from './game/nav.js';
import { Projectiles } from './game/weapons.js';
import { CameraRig } from './game/cameraRig.js';
import { Match, prerollBotLooks } from './game/match.js';
import { Minimap } from './game/minimap.js';
import { Showcase } from './game/showcase.js';

const params = new URLSearchParams(location.search);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ------------------------------------------------------------------------------------------ persistence
function loadJSON(key, def) { try { const v = JSON.parse(localStorage.getItem(key)); return v ? { ...def, ...v } : { ...def }; } catch { return { ...def }; } }
function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } }
const DEFAULT_PROFILE = { name: 'Player', level: 1, xp: 0, wins: 0, matches: 0, totalTurf: 0, weapon: 'shooter' };

async function loadModule(path, stubName) {
  try { return await import(path); }
  catch (e) {
    console.error(`[inkwave] failed to load ${path} — using stub`, e);
    const stubs = await import('./dev/stubs.js');
    return stubName ? stubs : {};
  }
}

class Game {
  async boot() {
    const t0 = performance.now();
    // real top-down thumbnails for the stage cards, generated from each layout's geometry
    for (const m of MAPS) { try { m.thumb = layoutThumbSVG(MAP_LAYOUTS[m.layout || m.id], m.theme); } catch (e) { console.warn('thumb', m.id, e); } }
    this.settings = G.settings = loadJSON('inkwave.settings', DEFAULT_SETTINGS);
    // v1.1: fov became horizontal — migrate old vertical values once
    if (this.settings.fovMode !== 'h') { this.settings.fov = DEFAULT_SETTINGS.fov; this.settings.fovMode = 'h'; saveJSON('inkwave.settings', this.settings); }
    this.profile = loadJSON('inkwave.profile', DEFAULT_PROFILE);
    const app = document.getElementById('app');
    this.uiRoot = document.getElementById('ui-root');
    this.fadeEl = document.getElementById('fade');

    // UI first so the loading screen shows immediately
    const [menusMod, hudMod] = await Promise.all([loadModule('./ui/menus.js'), loadModule('./ui/hud.js')]);
    this.menus = G.menus = menusMod.Menus ? new menusMod.Menus(this.uiRoot, this._menuApi()) : null;
    this.hud = G.hud = hudMod.HUD ? new hudMod.HUD(this.uiRoot, { playSound: (n, o) => G.audio?.play(n, o) }) : null;
    // map diorama pins/finish live inside the HUD layer (under every other HUD element)
    try { const { DioramaOverlay } = await import('./ui/diorama.js'); this.diorama = new DioramaOverlay(this.hud ? this.hud.el : this.uiRoot); } catch (e) { console.error('[inkwave] diorama', e); this.diorama = null; }
    this.hud?.setVisible(false);
    this.menus?.show('loading');
    this.bootMarks = [];
    const progress = async (p, label) => { this.bootMarks.push([label, Math.round(performance.now() - t0)]); this.menus?.setLoading(p, label); await nextFrame(); };
    await progress(0.05, 'Mixing ink…');

    // renderer / scene
    this.R = new Renderer(app, this.settings);
    G.renderer = this.R.renderer;
    const scene = (G.scene = new THREE.Scene());
    scene.matrixWorldAutoUpdate = false;   // updated once per frame in _frame, not again by every render of it
    const camera = (G.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.15, 6500));
    camera.position.set(0, 40, -60);
    this.R.setScene(scene, camera);
    this.input = G.input = new Input(this.R.renderer.domElement);
    this.input.onKey = (e, repeat) => this._onKey(e, repeat);
    this.input.onUnlock = () => this._onPointerUnlock();
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) navigator.keyboard?.unlock?.(); });
    // after a focus steal while the map was held, the next click on the game takes the mouse back (no pause detour)
    this.R.renderer.domElement.addEventListener('mousedown', () => {
      if (this._relock && G.mode === 'match' && this.match && !this.match.paused && !this.menus?.current) { this._relock = false; this.input.requestLock(); }
    });

    // modules built by other authors
    const [charMod, fxMod, envMod, audioMod, musicMod] = await Promise.all([
      loadModule('./game/character.js', true), loadModule('./fx/fx.js', true), loadModule('./world/environment.js', true),
      loadModule('./audio/audio.js', true), loadModule('./audio/music.js', true),
    ]);
    this.CharacterClass = charMod.Character;
    try { this.PropKit = (await import('./world/props.js')).PropKit; } catch (e) { console.error('[inkwave] prop kit failed to load', e); this.PropKit = null; }
    G.audio = audioMod.audio; G.music = musicMod.music;
    // open the audio device now, behind the loading screen (~150 ms: device + reverb impulses). Without a gesture the
    // context starts suspended; the first key / click resumes it (audio.js _installUnlock) instead of freezing that frame
    G.audio?.init?.();
    await progress(0.15, 'Building the plaza…');

    // world
    // (old ?map=sunset links = Tidewater at dusk)
    const pm = params.get('map') === 'sunset' ? 'tidewater' : params.get('map');
    const map = MAPS.find((m) => m.id === pm) || MAPS[0];
    this.time = params.get('time') === 'dusk' || params.get('map') === 'sunset' ? 'dusk' : (this.settings.timeOfDay === 'dusk' ? 'dusk' : 'day');
    this.theme = mapTheme(map, this.time);
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    this.murals = await createMuralTexture();
    try {
      const { createTextureLibrary } = await import('./world/texlib.js');
      this.texlib = await createTextureLibrary(G.renderer, { size: q.paintAtlas >= 4096 ? 512 : 256 });
    } catch (e) { console.error('[inkwave] texture library failed — procedural fallback', e); this.texlib = null; }
    await this._buildWorld(map);
    await progress(0.4, 'Filling the harbor…');
    const B = G.level.bounds;
    G.env = new envMod.Environment(G.renderer, scene, { bounds: B, theme: this.theme, shadowSize: q.shadowSize, footprint: this._footprint(G.level) });
    if (G.env.envMap) scene.environment = G.env.envMap;
    // lighting balance: less omnidirectional sky flood, more directional sky/ground fill → surfaces keep their form
    scene.environmentIntensity = 0.66;
    G.renderer.toneMappingExposure = 0.94;
    if (G.env.hemi) G.env.hemi.intensity = Math.max(G.env.hemi.intensity, 0.38);
    await progress(0.55, 'Teaching squids to swim…');
    G.projectiles = new Projectiles(scene);
    G.fx = new fxMod.FX(scene, { quality: q });
    G.fx.setLighting?.(G.env.getSkyColors?.());
    this._applyNight();
    G.fx.setCollider?.((from, to) => { const h = G.physics.segment(from, to, this._fxHit || (this._fxHit = new Hit()), true); return h.hit ? { point: h.point, normal: h.normal } : null; });
    G.fx.onDropletLand = (point, normal, color, size) => {
      const team = this._teamOfColor(color);
      if (team < 0) return;
      G.paint.splat(this._tmpV.copy(point).addScaledVector(normal, 0.05), clamp(size * 2.4, 0.12, 0.45), team, { seed: Math.random() });
    };
    this._tmpV = new THREE.Vector3(); this._tmpC = new THREE.Color();
    this.rig = new CameraRig(camera);
    G.post = this.R; G.game = this; G.rig = this.rig;
    // optional modules the VFX / screen-FX modules (absent = skipped)
    try { const m = await import('./fx/fxHooks.js'); this.fxHooks = m.initFxHooks?.(G) || null; } catch (e) { if (!/Failed to fetch|Cannot find module|404/i.test(String(e))) console.error('[inkwave] fxHooks', e); }
    try { const m = await import('./fx/screenfx.js'); this.screenfx = m.ScreenFX ? new m.ScreenFX(this.R, G) : null; } catch (e) { if (!/Failed to fetch|Cannot find module|404/i.test(String(e))) console.error('[inkwave] screenfx', e); }
    this.showcase = new Showcase(G.renderer, this.CharacterClass);
    await progress(0.7, 'Tuning the tentacles…');

    this._setPalette(this._pickPalette());
    this._bindEvents();
    this._startAttract();
    // warm up: compile every shader now so the first shot/splat never hitches
    await progress(0.85, 'Warming up…');
    this._warmup();
    // compile in parallel (KHR_parallel_shader_compile) so the loading screen keeps animating instead of freezing.
    // Programs are keyed on the bound render target (tone mapping / output colour space): compile against the
    // composer's HDR buffer the scene is really drawn into, or every program here is a throwaway variant and the first
    // frames compile the real ones one blocking link at a time. The menu showcase (pedestal kid, portraits) joins the
    // same batch instead of freezing the first menu.
    // Materials first drawn mid-match (bombs, storm clouds) join as hidden stand-ins: compile() gathers materials from
    // invisible objects too. Screen-FX draws off the scene (the composite as a lone full-screen quad, the lens field in
    // its own scene), and programs also key on the scene's lights and fog, so those compile as they are drawn.
    const warm = new THREE.Group();
    warm.visible = false;
    warm.add(...G.projectiles.warmMeshes());
    scene.add(warm);
    const prevRT = G.renderer.getRenderTarget();
    G.renderer.setRenderTarget(this.R.composer.renderTarget1);
    const batch = [G.renderer.compileAsync(scene, camera)];
    const sfx = this.screenfx;
    if (sfx) batch.push(G.renderer.compileAsync(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sfx.mat), sfx.lens.cam), G.renderer.compileAsync(sfx.lens.scene, sfx.lens.cam));
    G.renderer.setRenderTarget(prevRT);
    scene.remove(warm);
    batch.push(this.showcase._warmup(), G.env.ready);   // + env Worker jobs (sea textures, terrain)
    try { await Promise.all(batch); } catch { /* a failed program surfaces on first draw */ }
    await progress(0.93, 'Warming up…');
    // the main menu's 3D avatar: its first draw is the showcase kid's first real draw (D3D finishes those shaders on the
    // GPU thread, ~0.6 s) — queue the same request now so the warm frames pay for it and the menu gets it from cache
    this.menus?._portraitInto?.(document.createElement('span'), { kind: 'head', size: 160 });
    // first warm frame takes the screen-FX route (final pass HDR → OutputPass) so both are compiled before play
    for (let i = 0; i < 3; i++) { this.R.forceOutput = i === 0; this._frame(1 / 60); await nextFrame(); }
    this.R.forceOutput = false;
    await progress(1, 'Ready!');
    await new Promise((r) => setTimeout(r, 250));

    this.timer = new THREE.Timer(); this.timer.connect?.(document);
    this.fpsAcc = 0; this.fpsN = 0; this.fps = 60;
    G.mode = 'menu';
    this.menus?.show(params.has('skipTitle') ? 'main' : 'title');
    this._applyAudioVolumes();
    this._loopFn = (t) => this._loop(t);
    requestAnimationFrame(this._loopFn);
    if (params.has('autostart')) this.api.startMatch({ mapId: map.id, difficulty: this.settings.difficulty, duration: +params.get('autostart') || this.settings.matchLength });
    this.bootMs = Math.round(performance.now() - t0);
    prerollBotLooks();   // next match's bot hair, built while the menus idle
    window.__inkwave = this; // debug/audit hook
    window.__G = G;
    this.debug = {
      endMatch: (t = 0.5) => { if (this.match && !this.match.attract) this.match.time = t; },
      paintRandom: (n = 400) => { const v = new THREE.Vector3(); for (let i = 0; i < n; i++) { v.set((Math.random() - 0.5) * 48, 0.4, (Math.random() - 0.5) * 86); G.paint.splat(v, 0.8 + Math.random() * 1.4, Math.random() < 0.5 ? 0 : 1); } },
      // deterministic stepping for audits: freeze(), then step(ms) advances the sim at a fixed 60 Hz and renders once
      freeze: () => { this.frozen = true; },
      unfreeze: () => { this.frozen = false; this.timer.update(); },
      step: (ms = 16.7) => {
        const n = Math.max(1, Math.round(ms / (1000 / 60)));
        this._skipRender = true;
        for (let i = 0; i < n - 1; i++) this._frame(1 / 60);
        this._skipRender = false;
        this._frame(1 / 60);
      },
      key: (code, down) => { if (down) { this.input.keys.add(code); this.input.pressed.add(code); } else this.input.keys.delete(code); },
      fire: (on) => { this.input.mouse.left = on; },
      freezeBots: () => { for (const a of G.actors) if (a.bot && !a.isLocal) a.bot.update = () => { a.intent.move.set(0, 0, 0); a.intent.fire = false; }; },
    };
  }

  // Build (or rebuild) everything that depends on the stage layout: level, collision, paint atlas, surface material,
  // decor, navigation graph and minimap. Environment/FX/projectiles persist across stages.
  async _buildWorld(map) {
    const scene = G.scene;
    const layoutId = map.layout || map.id;
    if (this.layoutId === layoutId) { this.mapDef = map; return; }
    if (this.levelMesh) { scene.remove(this.levelMesh, this.grateMesh); this.levelMesh.geometry.dispose(); this.grateMesh?.geometry.dispose(); this.levelMat.dispose(); this.grateMat?.dispose(); }
    if (this.decor) { scene.remove(this.decor.group); }
    if (this.props) { this.props.dispose?.(); this.props = null; }
    G.paint?.dispose();
    this.layoutId = layoutId;
    this.mapDef = map;
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    // set dressing first: solid props hand back collision boxes that become part of the level (physics, nav, paint)
    const colliders = [];
    if (this.PropKit) {
      try {
        this.props = new this.PropKit(scene, { castShadow: true, quality: this.settings.quality });
        for (const it of dressingFor(layoutId)) {
          const r = this.props.add(it.type, it);
          if (r && r.colliders) colliders.push(...r.colliders);
        }
        this.props.build();
      } catch (e) { console.error('[inkwave] props failed', e); this.props = null; }
    }
    const level = (G.level = new Level(MAP_LAYOUTS[layoutId], colliders));
    G.physics = new Physics(level);
    const lightmap = await this._loadLightmap(level, layoutId);
    G.paint = new PaintSystem(G.renderer, level, { atlasSize: q.paintAtlas, maxDensity: q.paintAtlas >= 4096 ? 30 : 18 });
    this.levelMat = createLevelMaterial(G.paint.texture, G.paint.size, this.murals, { lightmap, texlib: this.texlib });
    (this.swimWake || (this.swimWake = new SwimWake())).reset();
    this.levelMesh = new THREE.Mesh(level.buildGeometry(G.paint.size), this.levelMat);
    this.levelMesh.castShadow = true; this.levelMesh.receiveShadow = true;
    this.levelMesh.name = 'level';
    scene.add(this.levelMesh);
    // grates: same surface shader, cut-out holes, no ink (they cast no shadow; the mesh is too fine for the shadow map)
    this.grateMat = createLevelMaterial(G.paint.texture, G.paint.size, this.murals, { grate: true, lightmap, texlib: this.texlib });
    const gg = level.buildGeometry(G.paint.size, (b) => b.grate);
    this.grateMesh = new THREE.Mesh(gg, this.grateMat);
    this.grateMesh.receiveShadow = true; this.grateMesh.visible = gg.index.count > 0;
    scene.add(this.grateMesh);
    this.decor = new Decor(scene, level);
    G.nav = new NavGraph(level, G.physics);
    this.minimap = new Minimap(level, G.paint);
    if (G.env?.rebuildForArena) G.env.rebuildForArena(level.bounds, this._footprint(level));
    else if (G.env?.setFootprint) G.env.setFootprint(this._footprint(level));
    if (G.teamColors[0]) this._setPalette(this.palette || this._pickPalette());
  }

  // Baked AO (tools/bake-ao.mjs). Applied only when the bake matches this exact layout.
  async _loadLightmap(level, layoutId) {
    try {
      const meta = await (await fetch(`assets/lightmaps/${layoutId}.json`, { cache: 'no-cache' })).json();
      level.layoutLightmap(meta.ppm, meta.size);
      if (level.layoutHash !== meta.hash) { console.warn(`[inkwave] lightmap for ${layoutId} is stale — re-run tools/bake-ao.mjs`); level.lightSize = 0; for (const f of level.faces) f.light = null; return null; }
      const tex = await new THREE.TextureLoader().loadAsync(`assets/lightmaps/${layoutId}.png?h=${meta.hash}`);
      tex.colorSpace = THREE.NoColorSpace;
      tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 4;
      return tex;
    } catch (e) {
      console.warn('[inkwave] no lightmap for', layoutId, e.message);
      for (const f of level.faces) f.light = null;
      return null;
    }
  }

  _footprint(level) {
    return level.blocks.filter((b) => b.aligned && b.aabbMax.y < 0.01 && b.aabbMax.y > -2.5 && b.aabbMin.y < -1)
      .map((b) => ({ minX: b.aabbMin.x, maxX: b.aabbMax.x, minZ: b.aabbMin.z, maxZ: b.aabbMax.z }));
  }

  _warmup() {
    // trigger one of each effect off-screen so shaders + pools exist
    const p = new THREE.Vector3(0, -30, 0), n = new THREE.Vector3(0, 1, 0);
    const c = G.teamColors[0];
    try {
      G.fx.burst(p, n, c, { count: 4 }); G.fx.ring(p, n, c, {}); G.fx.explosion(p, c, 2); G.fx.splatted(p, c);
      G.fx.wake(p, n, c, 5); G.fx.muzzle(p, n, c); G.fx.spawnFlash(p, c);
    } catch (e) { console.warn('fx warmup', e); }
  }

  // ---------------------------------------------------------------------------------------- palette
  _pickPalette() {
    if (this.settings.colorblind) return COLORBLIND_PALETTE;
    const p = TEAM_PALETTES[(Math.random() * TEAM_PALETTES.length) | 0];
    return p;
  }
  _setPalette(p) {
    this.palette = p;
    G.teamHex = [p.a, p.b];
    G.teamColors = [new THREE.Color(p.a), new THREE.Color(p.b)];
    this.levelMat.userData.uniforms.uTeamA.value.copy(G.teamColors[0]);
    this.levelMat.userData.uniforms.uTeamB.value.copy(G.teamColors[1]);
    if (this.grateMat) { this.grateMat.userData.uniforms.uTeamA.value.copy(G.teamColors[0]); this.grateMat.userData.uniforms.uTeamB.value.copy(G.teamColors[1]); }
    // warm/low light mutes saturated ink: give it more self-glow at dusk so team colours stay the loudest thing on screen
    // ink self-light: more at dusk, a touch more in golden hour's long shadows
    this.levelMat.userData.uniforms.uInkGlow.value = { sunset: 0.2, golden: 0.1 }[this.theme] ?? 0.07;
    this.decor.setTeamColors(G.teamColors);
    this.props?.setTeamColors?.(G.teamColors[0], G.teamColors[1]);
    G.projectiles.refreshColors();
    for (const a of G.actors) a.character.setColor(G.teamColors[a.team]);
    this.minimap.version = -1;
    this.menus?.setAccent?.(p.a, p.b);
  }
  _teamOfColor(color) {
    const c = color.isColor ? color : this._tmpC.set(color);
    for (let t = 0; t < 2; t++) { const k = G.teamColors[t]; if (Math.abs(k.r - c.r) + Math.abs(k.g - c.g) + Math.abs(k.b - c.b) < 0.05) return t; }
    return -1;
  }

  // ---------------------------------------------------------------------------------------- menus api
  _menuApi() {
    const self = this;
    const api = (this.api = {
      version: VERSION,
      weapons: WEAPONS, weaponOrder: WEAPON_ORDER, specials: SPECIALS, sub: SUB.bomb, maps: MAPS, difficulties: DIFFICULTY,
      getSettings: () => ({ ...self.settings }),
      setSettings: (partial) => self._setSettings(partial),
      getProfile: () => {
        const p = self.profile;
        return { ...p, played: p.matches, xpToNext: PROGRESSION.xpForLevel(p.level) };
      },
      setProfileName: (n) => { self.profile.name = String(n || 'Player').slice(0, 16); saveJSON('inkwave.profile', self.profile); },
      // locker look ({ hair, skin, outfit, eyes, hat, brows, … } — indices into character-style.js tables)
      setProfileStyle: (st) => { self.profile.style = { ...(st || {}) }; saveJSON('inkwave.profile', self.profile); },
      getLoadout: () => ({ weapon: self.profile.weapon || 'shooter' }),
      setLoadout: ({ weapon }) => {
        if (!WEAPONS[weapon]) return;
        self.profile.weapon = weapon; saveJSON('inkwave.profile', self.profile);
        if (self.menus?.current === 'loadout') self.showcase.showLoadout(weapon, G.teamColors[0], self.profile.style);
      },
      startMatch: (o) => self.startMatch(o),
      resumeMatch: () => self.resume(),
      quitMatch: () => self.quitToMenu(),
      rematch: () => self.startMatch(self.lastMatchOpts || {}),
      toMainMenu: () => self.quitToMenu(),
      onScreenChange: (s) => self._onScreen(s),
      playSound: (n) => { G.audio?.init?.(); G.audio?.play(n); },
    });
    return api;
  }

  _setSettings(partial) {
    Object.assign(this.settings, partial);
    saveJSON('inkwave.settings', this.settings);
    if ('quality' in partial || 'shadows' in partial || 'bloom' in partial) this.R?.applySettings(this.settings);
    if ('master' in partial || 'music' in partial || 'sfx' in partial) this._applyAudioVolumes();
    if (partial.fullscreen === false) this._exitFullscreen();
    if ('colorblind' in partial && G.mode !== 'match') this._setPalette(this._pickPalette());
  }
  _applyAudioVolumes() { G.audio?.setVolumes?.({ master: this.settings.master, music: this.settings.music, sfx: this.settings.sfx }); }

  _onScreen(s) {
    if (!this.showcase) return;
    if (s === 'loadout') this.showcase.showLoadout(this.profile.weapon || 'shooter', G.teamColors[0], this.profile.style);
    else if (s !== 'results') { if (this.showcase.mode === 'loadout') this.showcase.hide(); }
    if (G.mode === 'menu') {
      if (s === 'title' || s === 'main' || s === 'setup' || s === 'settings' || s === 'howto' || s === 'credits' || s === 'loadout' || s === 'locker') {
        if (this._musicTrack !== (s === 'title' ? 'title' : 'menu')) this._playMusic(s === 'title' ? 'title' : 'menu');
      }
    }
  }
  _playMusic(t) { this._musicTrack = t; try { G.music?.play(t, { fade: 1.2 }); } catch (e) { /* not initialised yet */ } }

  // ---------------------------------------------------------------------------------------- input routing
  _onKey(e, repeat) {
    // first gesture unlocks audio
    if (!this._audioOn) { this._audioOn = true; G.audio?.init?.(); this._applyAudioVolumes(); this._playMusic(this.menus?.current === 'title' || !this.menus ? 'title' : 'menu'); }
    if (G.mode === 'match' && this.match && !this.match.paused && !this.menus?.current) {
      if (e.code === 'Escape' || e.code === 'KeyP') { this.pause(); return true; }
      return false;
    }
    if (this.menus && this.menus.current) return this.menus.handleKey(e) || false;
    return false;
  }
  _onPointerUnlock() {
    // only a live round pauses on focus loss; intro / time's up / judge / results release the mouse on purpose.
    // Holding the map is never a reason to pause (some browsers/embeds steal focus on TAB): relock on the next click.
    if (this.match?.controller?.mapHeld || this.rig.mapK > 0) { this._relock = true; return; }
    // (windowed) a lock lost right after resume() is the browser undoing that request, not the player leaving
    if (performance.now() - (this._resumedAt ?? -1e9) < 500) { this._relock = true; return; }
    if (G.mode === 'match' && this.match && !this.match.paused && this.match.state === 'playing' && !this.menus?.current) this.pause();
  }

  // pull the fog back while the view is overhead (the stage is ~150 m away up there), restore it exactly after
  _dioFog() {
    const f = G.scene?.fog, k = this.rig.mapK;
    if (!f || !f.isFog) return;
    if (k > 0) {
      if (!this._fog0) this._fog0 = { near: f.near, far: f.far };
      const e = k * k * (3 - 2 * k);
      f.near = this._fog0.near + 190 * e; f.far = this._fog0.far + 600 * e;
    } else if (this._fog0) { f.near = this._fog0.near; f.far = this._fog0.far; this._fog0 = null; }
  }

  // ---------------------------------------------------------------------------------------- events → HUD/audio
  _bindEvents() {
    const self = this;
    let lastHitSnd = 0, lastHurtSnd = 0;
    on('hit', ({ attacker, victim, damage, killed }) => {
      if (!this.match || this.match.attract) return;
      if (attacker?.isLocal) {
        this.hud?.hitMarker(killed ? 'kill' : 'hit');
        if (G.time - lastHitSnd > 0.06) { lastHitSnd = G.time; G.audio?.play('hit_marker', { volume: 0.6 }); }
      }
    });
    on('damage', ({ victim, amount, attacker, source }) => {
      if (!this.match || this.match.attract || !victim.isLocal) return;
      let ang = null;
      if (attacker && attacker !== victim) {
        const v = this._dmgV || (this._dmgV = new THREE.Vector3());
        v.copy(attacker.pos); v.y += 1; v.project(G.camera);
        let dx = v.x, dy = -v.y;
        const behind = v.z > 1;
        if (behind) { dx = -dx; dy = -dy; }
        if (!behind && Math.abs(dx) < 1 && Math.abs(dy) < 1) ang = dx >= 0 ? 0 : Math.PI;   // attacker on screen: ink the nearer side edge, never over them
        else ang = Math.atan2(dy * innerHeight, dx * innerWidth);
      }
      this.hud?.damage(clamp(amount / 80, 0.15, 1), G.teamHex[victim.enemyTeam], ang);
      if (G.time - lastHurtSnd > 0.25) { lastHurtSnd = G.time; G.audio?.play('hurt', { volume: 0.7 }); }
      if (amount >= 40) this.rig.addShake(clamp((amount - 30) / 220, 0, 0.4));   // only heavy hits move the camera; chip damage reads through the HUD
    });
    // a squid dropping back into its own ink (dolphin-jump re-entry, hopping in from dry ground) gets a wet plunge;
    // transform dives already play squid_in
    const formT = new WeakMap();
    on('actor:form', ({ actor }) => formT.set(actor, G.time));
    on('actor:dive', ({ actor, speed }) => {
      if (!actor || !this.match || this.match.attract || G.time - (formT.get(actor) ?? -9) < 0.2) return;
      if (actor.isLocal || actor._nearCamera?.()) G.audio?.play('swim_splash', { pos: actor.isLocal ? undefined : actor.pos, volume: (actor.isLocal ? 0.5 : 0.32) * Math.min(1, 0.55 + (speed || 0) / 16) });
    });
    on('splatted', ({ victim, attacker, cause }) => {
      if (!this.match || this.match.attract) return;
      const local = this.match.local;
      if (attacker?.isLocal) {
        G.audio?.play('splat_enemy', { volume: 0.9 });
        this.hud?.feed({ text: `You splatted ${victim.name}!`, color: G.teamHex[local.team], kind: 'kill' });
      } else if (victim.isLocal) {
        G.audio?.play('splatted_self');
        G.audio?.duck?.(0.45, 2.2);
        const by = attacker ? attacker.name : cause === 'water' ? 'the sea' : 'enemy ink';
        this.hud?.showSplatted({ by, byColor: attacker ? G.teamHex[attacker.team] : '#6fd0ff', respawn: PLAYER.respawnTime });
        this.rig.mode = 'spectate';
        this.rig.spectate = { actor: attacker && attacker.alive ? attacker : null, pos: victim.pos.clone(), from: victim.pos.clone() };
        this.rig.lookAt.copy(victim.pos);
      } else if (victim.team === local?.team) {
        G.audio?.play('ally_splatted', { volume: 0.5 });
        this.hud?.feed({ text: `${victim.name} was splatted${attacker ? ' by ' + attacker.name : ''}`, color: G.teamHex[victim.enemyTeam], kind: 'death' });
      } else if (attacker && attacker.team === local?.team) {
        this.hud?.feed({ text: `${attacker.name} splatted ${victim.name}`, color: G.teamHex[attacker.team], kind: 'ally' });
      }
    });
    on('respawn', ({ actor }) => {
      if (!this.match || this.match.attract) return;
      if (actor.isLocal) { this.hud?.hideSplatted(); this.rig.follow(actor, true); this.rig.yaw = actor.yaw; this.rig.pitch = -0.12; }
    });
    on('special:ready', ({ actor }) => {
      if (actor.isLocal && !this.match?.attract) { G.audio?.play('special_ready'); }
    });
    on('special:use', ({ actor, id }) => {
      if (actor.isLocal && !this.match?.attract) this.hud?.banner('special', SPECIALS[id].name.toUpperCase() + '!');
    });
    on('shake', ({ amount, pos }) => { if (!this.match?.attract) this.rig.addShake(amount, pos); });
    on('recoil', ({ amount }) => { if (!this.match?.attract) this.rig.recoil(amount); });
    on('lowink', ({ actor }) => { if (actor.isLocal) this._lowInkFlash = 1.2; });
    // footsteps (character animation → 'actor:footstep'): surface-aware, only for actors near the camera
    on('actor:footstep', ({ actor, surface, pos, speed }) => {
      if (!actor || !actor.alive || actor.form === 'squid') return;
      const p = pos || actor.pos;
      if (!actor.isLocal && G.camera.position.distanceToSquared(p) > 18 * 18) return;
      const name = surface === 1 ? 'step_ink' : surface === 2 ? 'step_enemy' : 'step_dry';
      const vol = (actor.isLocal ? 0.7 : 0.45) * Math.min(1, 0.45 + (speed || actor.anim.speed || 0) / 8);
      G.audio?.play(name, { pos: actor.isLocal ? undefined : p, volume: vol });
    });
    on('match:oneminute', () => { this.hud?.banner('one_minute'); G.audio?.play('one_minute'); this._playMusic('battle_final'); });
    on('match:count', ({ n }) => { this.hud?.countdown(n); G.audio?.play('final_count'); });
    on('match:state', ({ state, match }) => {
      if (match.attract || match !== this.match) return;
      if (state === 'intro') this._intro();
      if (state === 'playing') {
        this.hud?.banner('go'); G.audio?.play('go_horn');
        this._playMusic('battle');
        if (this.match.local) { this.rig.follow(this.match.local, true); }
      }
      if (state === 'finish') {
        this.hud?.banner('timesup'); G.audio?.play('times_up'); G.music?.stop?.(0.4); this._musicTrack = null;
        this.input.exitLock();
      }
      if (state === 'judge') this._judge();
    });
  }

  // ---------------------------------------------------------------------------------------- attract mode
  _startAttract() {
    if (this.match) this.match.dispose();
    G.projectiles.clear(); G.fx.clear?.(); G.paint.clear();
    const m = (this.match = G.match = new Match({ attract: true, duration: 99999, difficulty: 'normal', CharacterClass: this.CharacterClass, rig: this.rig, input: this.input }));
    m.setup(); m.start();
    for (const a of m.actors) { a.respawnTimer = 0; }
    this.attractT = 0; this.shotT = 0; this.shotIdx = 0;
    this._attractShot();
    this.hud?.setVisible(false);
  }
  _attractShot() {
    const shots = ['orbit', 'follow', 'orbit2', 'follow'];
    const s = shots[this.shotIdx++ % shots.length];
    this.shotT = s.startsWith('follow') ? 7 : 10;
    if (s === 'orbit') this.rig.orbit(new THREE.Vector3(0, 1, 0), 34, 17, 0.05, Math.random() * 6);
    else if (s === 'orbit2') this.rig.orbit(new THREE.Vector3(0, 2, -8), 18, 7, -0.07, Math.random() * 6);
    else {
      const alive = this.match.actors.filter((a) => a.alive);
      const a = alive[(Math.random() * alive.length) | 0];
      if (a) { this.rig.follow(a, true); this.rig.yaw = a.yaw; this.rig.pitch = -0.28; this._attractFollow = a; }
    }
  }
  _updateAttract(dt) {
    this.attractT += dt; this.shotT -= dt;
    if (this.menus?.current === 'title') { if (this.rig.mode !== 'orbit') this.rig.orbit(new THREE.Vector3(0, 1, 0), 34, 17, 0.05, 0); }
    else if (this.shotT <= 0) this._attractShot();
    if (this.rig.mode === 'follow' && this._attractFollow) {
      const a = this._attractFollow;
      if (!a.alive) this.shotT = Math.min(this.shotT, 0.5);
      this.rig.yaw = G.time > 0 ? this.rig.yaw + (((a.yaw - this.rig.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * (1 - Math.exp(-2 * dt)) : a.yaw;
    }
    const cov = G.paint.coverage();
    if (this.attractT > 110 || cov[0] + cov[1] > 0.72) {
      this._fade(1, 400).then(() => { this._setPalette(this._pickPalette()); this._startAttract(); this._fade(0, 600); });
      this.attractT = -999;
    }
  }

  // ---------------------------------------------------------------------------------------- match flow
  // lamps, signs, lit windows: follow the environment's night factor (0 day / golden … 1 dusk)
  _applyNight() {
    const k = G.env?.getSkyColors?.()?.night ?? 0;
    this.props?.setNight?.(k); this.decor?.setNight?.(k);
  }

  async startMatch(o = {}) {
    const opts = {
      mapId: o.mapId === 'sunset' ? 'tidewater' : (o.mapId || this.mapDef.id),
      time: o.mapId === 'sunset' ? 'dusk' : (o.time || this.time || 'day'),
      difficulty: o.difficulty || this.settings.difficulty,
      duration: o.duration || this.settings.matchLength || MATCH.defaultDuration,
    };
    this.lastMatchOpts = opts;
    G.audio?.init?.();
    this.input.requestLock();
    this._enterFullscreen();   // after the lock request: both need this click, and fullscreen uses it up
    this.menus?.show(null);
    await this._fade(1, 350);
    G.music?.stop?.(0.3); this._musicTrack = null;
    this.showcase.hide();
    if (this.match) { this.match.dispose(); this.match = G.match = null; }   // frames keep running through the awaits below
    G.projectiles.clear(); G.fx.clear?.(); G.paint.clear();
    const map = MAPS.find((m) => m.id === opts.mapId) || MAPS[0];
    if ((map.layout || map.id) !== this.layoutId) await this._buildWorld(map);
    const theme = mapTheme(map, opts.time);
    this.time = opts.time === 'dusk' ? 'dusk' : 'day';
    if (theme !== this.theme) {
      this.theme = theme;
      G.env.setTheme?.(theme);
      if (G.env.envMap) G.scene.environment = G.env.envMap;
      G.fx.setLighting?.(G.env.getSkyColors?.());
    }
    this._applyNight();   // after any stage rebuild too (new prop kit / decor)
    await G.env.ready;    // a new stage's foam field comes from the env Worker
    this.mapDef = map;
    this._setPalette(this._pickPalette());
    const m = (this.match = G.match = new Match({
      attract: false, duration: opts.duration, difficulty: opts.difficulty, weapon: this.profile.weapon || 'shooter',
      playerName: this.profile.name || 'Player', CharacterClass: this.CharacterClass, rig: this.rig, input: this.input,
      autopilot: params.has('autopilot'), style: this.profile.style || null,
    }));
    m.setup();
    this.minimap.setViewerTeam(0);
    G.mode = 'match';
    this.hud?.setVisible(false);
    this.hudPrompt = null; this._hintT = 0; this._hints = {};
    m.start();
    this._fade(0, 500);
  }

  _intro() {
    const L = G.level, pad = L.spawnPads[0];
    const local = this.match.local;
    // sweep from high over the enemy base down behind the player (a stage can open on its own hero shot instead)
    const I = L.layout?.intro;
    const from = I ? new THREE.Vector3(...I.from) : new THREE.Vector3(18, 26, 30), to = new THREE.Vector3(pad.x, pad.y + 2.6, pad.z - (I?.toBack ?? 5.2));
    const lookFrom = I ? new THREE.Vector3(...I.lookFrom) : new THREE.Vector3(0, 0, 10), lookTo = new THREE.Vector3(pad.x, pad.y + 1.6, pad.z + 6);
    this.rig.cinematic(from, to, lookFrom, lookTo, 3.6, () => {});
    this.rig.yaw = 0; this.rig.pitch = -0.12;
    G.audio?.play('ready');
    setTimeout(() => { if (this.match?.state === 'intro') this.hud?.banner('ready'); }, 1700);
    setTimeout(() => { if (this.match?.state === 'intro') this.hud?.setVisible(true); }, 3000);
    this._playMusic(null);
  }

  // In a window Esc belongs to the browser: it drops the pointer lock and a relock then needs a click. Fullscreen with Esc
  // captured (Keyboard Lock, Chromium) hands Esc to the game instead: pause() releases the lock itself, so resume() can
  // take it back without a click. Needs the start / rematch click; otherwise play stays windowed with click-to-relock.
  _enterFullscreen() {
    if (!this.settings.fullscreen || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    if (navigator.userActivation && !navigator.userActivation.isActive) return;   // no click / key (autostart, gamepad)
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => navigator.keyboard?.lock?.(['Escape'])).catch(() => {});
  }
  _exitFullscreen() { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }

  pause() {
    if (!this.match || this.match.attract || this.match.paused) return;
    // only a live round (or its intro) can pause — never on top of time's up / judge / results
    if (this.match.state !== 'playing' && this.match.state !== 'intro') return;
    this.match.paused = true;
    this.input.exitLock();
    this.menus?.show('pause');
    G.audio?.duck?.(0.5, 99);
  }
  resume() {
    if (!this.match) return;
    this.menus?.show(null);
    this.match.paused = false;
    // if the browser refuses the lock (windowed Esc, gamepad) the next click takes the mouse
    this._relock = true;
    this._resumedAt = performance.now();
    this.input.requestLock();
    G.audio?.duck?.(1, 0.01);
  }
  async quitToMenu() {
    this.input.exitLock();
    this._exitFullscreen();
    this.menus?.show(null);
    await this._fade(1, 350);
    this.hud?.setVisible(false);
    this.hud?.hideSplatted?.();
    this.showcase.hide();
    G.mode = 'menu';
    this._setPalette(this._pickPalette());
    this._startAttract();
    this.menus?.show('main');
    prerollBotLooks();
    this._playMusic('menu');
    G.audio?.duck?.(1, 0.01);
    this._fade(0, 500);
  }

  async _judge() {
    const m = this.match;
    this.hud?.hideSplatted?.();
    this.rig.overview();
    this.hud?.setVisible(true);
    const cov = m.result.coverage;
    const judgeP = this.hud?.judge({ colors: [G.teamHex[0], G.teamHex[1]], percents: [cov[0] * 100, cov[1] * 100], names: this.palette.names || TEAM_NAMES });
    await (judgeP || new Promise((r) => setTimeout(r, 4000)));
    const won = m.result.winner === 0;
    m.setState('results');
    this.hud?.setVisible(false);
    // profile / XP
    const local = m.local;
    const p = this.profile;
    const turf = Math.round(local.stats.turf);
    const gained = Math.round((won ? PROGRESSION.xpWin : PROGRESSION.xpLose) + turf * PROGRESSION.xpPerTurfPoint + local.stats.splats * PROGRESSION.xpPerSplat);
    const before = { level: p.level, xp: p.xp, toNext: PROGRESSION.xpForLevel(p.level) };
    p.xp += gained; p.matches++; if (won) p.wins++; p.totalTurf += turf;
    while (p.xp >= PROGRESSION.xpForLevel(p.level)) { p.xp -= PROGRESSION.xpForLevel(p.level); p.level++; }
    saveJSON('inkwave.profile', p);
    const data = {
      win: won, percents: [cov[0] * 100, cov[1] * 100], colors: [G.teamHex[0], G.teamHex[1]], teamNames: this.palette.names || TEAM_NAMES,
      players: m.actors.map((a) => ({ name: a.name, team: a.team, weapon: a.weaponId, turf: Math.round(a.stats.turf), splats: a.stats.splats, deaths: a.stats.deaths, isSelf: a.isLocal })),
      xp: { gained, levelBefore: before.level, levelAfter: p.level, xpBefore: before.xp, xpAfter: p.xp, xpToNextBefore: before.toNext, xpToNextAfter: PROGRESSION.xpForLevel(p.level) },
      mapName: this.mapDef.name,
    };
    // your team on the podium
    const team = m.actors.filter((a) => a.team === 0);
    this.showcase.showResults(0, won, G.teamColors[0], team.map((a) => ({ weapon: a.weaponId, style: a.character.style || { hair: a.slot % 4, skin: (a.slot * 3) % 4 }, name: a.name })));
    this.menus?.showResults(data);
    this.menus?.show('results');
    prerollBotLooks();   // for a rematch
    G.audio?.play(won ? 'victory_fanfare' : 'defeat_jingle');
    setTimeout(() => this._playMusic(won ? 'results_win' : 'results_lose'), 2600);
  }

  _fade(to, ms) {
    return new Promise((r) => {
      const el = this.fadeEl;
      if (!el) return r();
      el.style.transition = `opacity ${ms}ms ease`;
      el.style.opacity = String(to);
      el.style.pointerEvents = to > 0.5 ? 'all' : 'none';
      setTimeout(r, ms + 20);
    });
  }

  // ---------------------------------------------------------------------------------------- loop
  _loop(now) {
    requestAnimationFrame(this._loopFn);
    // step by the frame's own (vsync-aligned) timestamp, not performance.now() at whatever moment this callback got to
    // run: callback start times jitter by a few ms, which made dt alternate (e.g. 6 / 10 ms) at a steady 120 Hz and the
    // motion judder even with no dropped frame
    this.timer.update(now); let dt = this.timer.getDelta();
    if (this.frozen) return;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    this._dynRes(dt);
    dt = Math.min(dt, 1 / 24);
    this._frame(dt);
  }

  // keep weaker GPUs playable: when a 4 s window of a live round averages under ~40 fps, drop render density one notch.
  // Stepping back up needs 12 s of real headroom and happens at most twice, so the image never pumps between sizes
  // (re-sizing every couple of seconds read as flicker).
  _dynRes(dt) {
    if (dt <= 0 || dt > 0.25) return;
    const d = this._dyn || (this._dyn = { acc: 0, n: 0, t: 0, fast: 0, ups: 0 });
    d.acc += dt; d.n++; d.t += dt;
    if (d.t < 4) return;
    const avg = d.acc / d.n;
    d.acc = 0; d.n = 0; d.t = 0;
    const m = this.match;
    if (this.settings.quality === 'ultra' || document.hidden || !m || m.attract || m.state !== 'playing') { d.fast = 0; return; }
    const s = this.R.dynScale || 1;
    if (avg > 1 / 40 && s > 0.76) { this.R.setDynamicScale(s - 0.125); d.fast = 0; }
    else if (avg < 1 / 75 && s < 1 && d.ups < 2) { if (++d.fast >= 3) { this.R.setDynamicScale(s + 0.125); d.fast = 0; d.ups++; } }
    else d.fast = 0;
  }

  _frame(dt) {
    const tA = performance.now();
    G.renderer.info.reset();
    G.time += dt;
    this.input.pollPad();
    this._padMenus();
    const m = this.match;
    if (m) {
      m.updateController(dt);
      const sub = dt > 1 / 45 ? 2 : 1; // substep physics on slow frames
      for (let i = 0; i < sub; i++) m.update(dt / sub);
      if (!m.paused) G.projectiles.update(dt);
      if (m.attract) this._updateAttract(dt);
      else if (m.state === 'playing' && m.local?.alive && this.rig.mode !== 'follow' && this.rig.mode !== 'path') this.rig.follow(m.local, true);
    }
    if (!m || !m.paused) G.fx.update(dt, G.camera);
    if (!m || !m.paused) this.fxHooks?.update?.(dt);
    this.screenfx?.update?.(dt, this);
    G.env.update?.(dt, G.camera);
    this.decor.update(dt);
    this.props?.update?.(dt, G.time);
    // map diorama: held map key during live play (or while waiting to respawn) swoops the view overhead
    this.rig.setMap?.(!!(m && !m.attract && !m.paused && m.state === 'playing' && m.controller?.mapHeld && !this.menus?.current));
    this.rig.update(dt);
    this._dioFog();
    this.diorama?.update(dt, this.rig.mapK);
    // local player camera-dependent aim must use this frame's camera
    if (m && m.controller && m.state === 'playing') m.controller.computeAim?.();
    // bomb arc preview
    const loc = m?.local;
    G.projectiles.updateArc(loc, !!(loc && loc.alive && loc.weaponRunner.aimingSub && m.state === 'playing' && !m.paused));
    const tB = performance.now();
    // paint → atlas, shader uniforms
    G.paint.flush(dt);
    this.levelMat.userData.uniforms.uTime.value = G.time;
    // see-through window toward the local player
    {
      const lu = this.levelMat.userData.uniforms;
      const on = !!(m && !m.attract && loc && loc.alive && this.rig.mode === 'follow' && this.rig.target === loc && this.rig.mapK < 0.3);
      lu.uSeeOn.value = damp(lu.uSeeOn.value, on ? 1 : 0, 10, dt);
      lu.uSeeA.value.copy(G.camera.position);
      if (loc) lu.uSeeB.value.set(loc.pos.x, loc.pos.y + (loc.form === 'squid' ? 0.4 : 1.0), loc.pos.z);
      if (this.grateMat) { const gu = this.grateMat.userData.uniforms; gu.uSeeOn.value = lu.uSeeOn.value; gu.uSeeA.value.copy(lu.uSeeA.value); gu.uSeeB.value.copy(lu.uSeeB.value); }
    }
    if (this.grateMat) this.grateMat.userData.uniforms.uTime.value = G.time;
    // swimmers' wakes in the ink surface
    if (this.swimWake && (!m || !m.paused)) this.swimWake.update(dt, this.levelMat.userData.uniforms, G.camera.position);
    this.showcase.update(dt);
    this._updateLocalLoops(dt);
    this._updateAmbience(dt);
    // audio listener
    if (G.audio?.setListener) {
      const cam = this.rig.gameCam || G.camera;   // the player's ears stay with the player while the map is up
      G.audio.setListener(cam.position, cam.getWorldDirection(this._lf || (this._lf = new THREE.Vector3())), cam.up);
    }
    // post uniforms (low-hp vignette)
    const g = this.R.grade.uniforms;
    const hpK = loc && m && !m.attract && loc.alive ? clamp(1 - loc.hp / 55, 0, 1) : 0;
    g.uHurt.value = damp(g.uHurt.value, hpK * 0.8, 6, dt);
    if (loc) g.uHurtColor.value.copy(G.teamColors[loc.enemyTeam]);
    // shadows: every frame (half-rate updates made moving shadows — your own, right under the crosshair — judder);
    // only the low preset halves it
    const sm = G.renderer.shadowMap;
    sm.autoUpdate = false;
    this._frameN = (this._frameN || 0) + 1;
    if (this.settings.quality !== 'low' || (this._frameN & 1)) sm.needsUpdate = true;
    if (!this._skipRender) {
      G.scene.updateMatrixWorld();
      G.env.renderReflection?.(G.renderer, G.scene, G.camera);   // before, not nested in, the frame's render (see env)
      this.R.render();
      if (this.showcase.mode) sm.needsUpdate = true;
      this.showcase.render();
    }
    const tC = performance.now();
    const ps = this.perf || (this.perf = { sim: 0, render: 0, calls: 0, tris: 0 });
    ps.sim += (tB - tA - ps.sim) * 0.05; ps.render += (tC - tB - ps.render) * 0.05;
    ps.calls = G.renderer.info.render.calls; ps.tris = G.renderer.info.render.triangles;
    // HUD
    if (m && !m.attract && this.hud && (m.state === 'playing' || m.state === 'intro' || m.state === 'finish')) this._updateHud(dt);
    this.menus?.update?.(dt);
    this.input.endFrame();
  }

  // continuous sounds tied to the local player's state (swim gurgle, wall climb, enemy-ink sizzle)
  // harbour soundscape: continuous sea wash + occasional gull cries out over the water
  _updateAmbience(dt) {
    if (!this._audioOn || !G.audio?.loop) return;
    if (!this._amb) this._amb = G.audio.loop('harbor_ambience', { volume: 0.55 });
    this._gullT = (this._gullT ?? 4) - dt;
    if (this._gullT <= 0) {
      this._gullT = 7 + Math.random() * 12;
      const B = G.level.bounds, a = Math.random() * Math.PI * 2;
      const p = this._gullP || (this._gullP = new THREE.Vector3());
      p.set(Math.cos(a) * (B.maxX + 25), 12 + Math.random() * 8, Math.sin(a) * (B.maxZ + 20));
      G.audio.play('gull', { pos: p, volume: 0.6 + Math.random() * 0.4, pitch: 0.9 + Math.random() * 0.25 });
    }
    // marina: rigging ringing against the masts in the gusts, and now and then a ship's horn out in the channel
    if (G.level?.layout?.id === 'halyard') {
      const p = this._ambP || (this._ambP = new THREE.Vector3());
      this._gustT = (this._gustT ?? 2) - dt;
      if (this._gustT <= 0) { this._gustT = 2.5 + Math.random() * 4; this._clinks = 2 + ((Math.random() * 4) | 0); this._clinkT = 0; }
      if (this._clinks > 0 && (this._clinkT -= dt) <= 0) {
        this._clinks--; this._clinkT = 0.12 + Math.random() * 0.45;
        const s = Math.random() < 0.5 ? -1 : 1;
        p.set(s * (27 + Math.random() * 14), 8 + Math.random() * 4, (Math.random() * 2 - 1) * 40);
        G.audio.play('halyard_clink', { pos: p, volume: 0.5 + Math.random() * 0.5, pitch: 0.85 + Math.random() * 0.35 });
      }
      this._hornT = (this._hornT ?? 28 + Math.random() * 10) - dt;
      if (this._hornT <= 0) {
        this._hornT = 55 + Math.random() * 30;
        p.set((Math.random() < 0.5 ? -1 : 1) * 95, 8, (Math.random() * 2 - 1) * 70);
        G.audio.play('ferry_horn', { pos: p, volume: 0.8 });
      }
    }
  }

  _updateLocalLoops(dt) {
    const m = this.match, a = m && !m.attract && !m.paused ? m.local : null;
    const L = this._loops || (this._loops = {});
    const want = (name, on, vol, pitch = 1) => {
      if (on && !L[name]) L[name] = G.audio?.loop?.(name, { volume: 0 });
      const h = L[name];
      if (!h) return;
      h._v = damp(h._v || 0, on ? vol : 0, on ? 10 : 7, dt);
      h.set({ volume: h._v, pitch });
      if (!on && h._v < 0.01) { h.stop(0.05); L[name] = null; }
    };
    const alive = !!(a && a.alive);
    const hs = alive ? Math.hypot(a.vel.x, a.vel.z) : 0;
    want('swim', alive && a.anim.form === 'swim' && hs > 0.5, Math.min(0.6, hs / 11.8 * 0.6 + 0.08), 0.6 + Math.min(1, hs / 11.8));
    want('climb', alive && a.anim.form === 'climb', 0.5, alive ? 0.6 + Math.min(1, Math.abs(a.vel.y) / 7.5) : 1);
    want('enemy_ink_sizzle', alive && a.grounded && a.groundTeam === 2, 0.45, 1.0);
  }

  _padMenus() {
    const inp = this.input;
    if (!inp.pad) return;
    const pp = inp.padPressed;
    if (this.menus?.current) {
      const nav = (d) => this.menus.nav?.(d);
      if (pp.has(12)) nav('up'); if (pp.has(13)) nav('down'); if (pp.has(14)) nav('left'); if (pp.has(15)) nav('right');
      if (pp.has(0)) nav('accept'); if (pp.has(1)) nav('back'); if (pp.has(2)) nav('alt');   // X: locker shuffle etc.
      if (pp.has(4)) nav('tab_prev'); if (pp.has(5)) nav('tab_next');
      // left stick as d-pad with repeat
      const ly = inp.padAxis(1), lx = inp.padAxis(0);
      this._stickT = (this._stickT || 0) - 1 / 60;
      if (this._stickT <= 0) {
        if (ly < -0.6) { nav('up'); this._stickT = 0.22; } else if (ly > 0.6) { nav('down'); this._stickT = 0.22; }
        else if (lx < -0.6) { nav('left'); this._stickT = 0.22; } else if (lx > 0.6) { nav('right'); this._stickT = 0.22; }
      }
      if (pp.has(9) && this.menus.current === 'pause') this.resume();
    } else if (G.mode === 'match' && pp.has(9)) this.pause();
  }

  _updateHud(dt) {
    const m = this.match, a = m.local, cam = G.camera;
    this.minimap.update(dt);
    const w = a.weapon;
    // crosshair spread = the weapon's live cone (first-shot accurate, blooms with sustained fire / in the air)
    const vHalf = (G.camera.fov * Math.PI) / 360;
    const coneDeg = a.weaponRunner.spread ?? (w.kind === 'shooter' ? 5.5 : w.kind === 'blaster' ? 1.2 : 0);
    const spread = w.kind === 'roller' ? 28 : Math.min(90, (Math.tan((coneDeg * Math.PI) / 180) / Math.tan(vHalf)) * (innerHeight / 2));
    const players = [];
    const t = { x: 0, y: 0 };
    for (const o of m.actors) {
      if (!o.alive) continue;
      if (o.team !== a.team && !o.isLocal) {
        // enemies only show on the map when visible to your team (not submerged far away)
        if (o.anim.form === 'swim') continue;
      }
      this.minimap.toCanvas(o.pos.x, o.pos.z, t);
      players.push({ x: t.x / this.minimap.w, y: t.y / this.minimap.h, team: o.team, isSelf: o.isLocal, yaw: -o.yaw + (this.minimap.flip ? Math.PI : 0), alive: o.alive, color: G.teamHex[o.team] });
    }
    // ally markers
    const markers = [];
    const v = this._mv || (this._mv = new THREE.Vector3());
    const W = innerWidth, H = innerHeight;
    for (const o of m.actors) {
      if (o.isLocal || o.team !== a.team || !o.alive) continue;
      if (o.character.getHeadPosition && o.form !== 'squid') { o.character.getHeadPosition(v); v.y += 0.45; }
      else { if (o.visualPos) o.visualPos(v); else v.copy(o.pos); v.y += o.form === 'squid' ? 1.0 : 1.9; }
      v.project(cam);
      const behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      const onScreen = !behind && x > 20 && x < W - 20 && y > 20 && y < H - 20;
      let angle = 0;
      if (!onScreen) {
        let dx = x - W / 2, dy = y - H / 2;
        if (behind) { dx = -dx; dy = -dy; }
        angle = Math.atan2(dy, dx);
        const k = Math.min((W / 2 - 40) / Math.max(1e-3, Math.abs(Math.cos(angle))), (H / 2 - 40) / Math.max(1e-3, Math.abs(Math.sin(angle))));
        x = W / 2 + Math.cos(angle) * k; y = H / 2 + Math.sin(angle) * k;
      }
      markers.push({ x, y, name: o.name, color: G.teamHex[o.team], onScreen, angle, dist: o.pos.distanceTo(a.pos) });
    }
    // contextual prompts (light tutorial)
    this._hintT += dt;
    let prompt = null;
    const inkF = a.ink / PLAYER.inkMax;
    if (m.state === 'playing' && a.alive) {
      if (m.controller?.mapHeld) prompt = null;   // the map diorama carries its own super-jump hints
      else if (a.superJumpState) prompt = null;
      else if (this._relock && !m.paused && !this.input.locked && this.input.lastDevice === 'kbm') prompt = 'Click to take back the mouse';
      else if (this._lowInkFlash > 0) { this._lowInkFlash -= dt; prompt = 'Low ink! Hold SHIFT in your ink to refill'; }
      else if (a.specialReady() && (this._hints.specialT = (this._hints.specialT || 0) + dt) > 2) prompt = `Special ready! Press F`;
      else if (inkF < 0.25 && a.form !== 'squid') prompt = 'Hold SHIFT to swim in your ink and refill';
      else if (m.duration - m.time < 8 && !this._hints.shot) prompt = 'Paint the ground — most turf wins!';
      if (!a.specialReady()) this._hints.specialT = 0;
      if (a.intent.fire) this._hints.shot = true;
    }
    const frame = {
      time: m.time,
      teams: m.teamSummary(),
      ink: a.ink / PLAYER.inkMax, inkLow: a.ink < 18 || (this._lowInkFlash > 0), subCost: SUB.bomb.inkCost / PLAYER.inkMax,
      special: a.specialFrac(), specialReady: a.specialReady(), specialActive: !!a.specialActive,
      hp: a.hp / PLAYER.hp,
      weapon: a.weaponId, charge: a.weaponRunner.charge,
      crosshair: { spread, onTarget: m.controller?.onTarget ? 'enemy' : null, inRange: m.controller ? m.controller.inRange !== false : true },
      // corner minimap follows the setting; the TAB map (needed for super jumps) is always available
      map: (this.settings.minimap !== false) ? { canvas: this.minimap.canvas, expanded: false, players } : null,
      markers,
      prompt,
      fps: this.settings.showFps ? this.fps : undefined,
    };
    this.hud.update(dt, frame);
  }
}

const game = new Game();
game.boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('boot-error');
  if (el) { el.textContent = 'Something went wrong while loading: ' + e.message; el.style.display = 'block'; }
});
