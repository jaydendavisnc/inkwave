# INKWAVE — module contracts

INKWAVE is an original, Splatoon-inspired 4v4 turf-war shooter built on three.js r186 (plain ES modules, no bundler).
Everything is procedural: no external models, textures or audio files. Fonts are vendored.

- Serve: `python3 -m http.server 8490 --directory ~/inkwave` → http://localhost:8490/
- three is available through the import map in every page: `import * as THREE from 'three'` and
  `import { X } from 'three/addons/...'` (maps to `vendor/three/jsm/`).
- Screenshot/audit: `node tools/shot.mjs <url> <out.png> [--w 1600 --h 900 --wait 2500 --eval "js"]`
  (drives the real system Chrome with GPU WebGL; prints console errors). Save shots under `/private/tmp/...` or `shots/`.
- Shared tuning lives in `src/config.js` (import from there; do not duplicate numbers).
- Units: metres, seconds, radians. Y is up. Character root origin = feet on the ground, facing **+Z** at rotation.y = 0.

## Art direction (applies to every module)

Bright, saturated, sunny, toy-like. Clean stylized PBR: soft-ish shadows, glossy wet ink, chunky rounded shapes, strong
silhouettes, a little squash and stretch everywhere. Think "urban skate-park harbor plaza by the sea at noon".
The two team ink colours are the loudest things on screen — keep environment colours pastel/neutral so ink pops.
Original designs only — no Nintendo names, logos or exact character copies. Our players are "squidkids".

Renderer facts other modules can rely on: `renderer.outputColorSpace = SRGBColorSpace`, tone mapping = `NeutralToneMapping`,
exposure ≈ 1.0, `scene.environment` = PMREM of the sky (so MeshStandard/Physical materials get real reflections),
shadows = PCFSoftShadowMap from one directional sun. Post: bloom with threshold ~0.9 (only very bright things bloom).

## Fonts / UI tokens
`assets/fonts/TitanOne-latin.woff2` (display, chunky) and `assets/fonts/Rubik-latin.woff2` (variable 400–900, UI text).

---

## 1. `src/game/character.js` — squidkid model + procedural animation

```js
import { Character } from './character.js';
const c = new Character({ color: new THREE.Color('#ff8a14'), weapon: 'shooter', style: { hair: 0..3, skin: 0..3 }, name, isLocal });
scene.add(c.root);                // root.position = feet, root.rotation.y = facing yaw (set by engine every frame)
c.setColor(color)                 // team ink colour (hair, tank ink, squid body, weapon ink parts, hurt splotches use enemy colour)
c.setWeapon('shooter'|'roller'|'charger'|'blaster')
c.update(dt, s)                   // every frame, s = AnimState below
c.trigger(name, arg)              // one-shots: 'shoot' | 'flick' | 'throw' | 'land'(arg=impact speed m/s) | 'jump' | 'hit' | 'special_leap' | 'special_slam' | 'spawn' | 'charge_release'
                                  // 'hit' arg = { x, z, amp }: unit direction TOWARD the attacker in the character's root space
                                  //   (+z = facing, +x = the character's left); valueOf() → amp (0.4..1.2) for old numeric callers
c.onEvent = (name, data) => {}    // set by actor.js; character.js calls it ('footstep' {foot, pos, speed}) → bus 'actor:<name>'
c.setDance(name|null)             // looping non-gameplay anims: 'victory' | 'defeat' | 'menu_idle' | 'lobby_pose' ; null → gameplay
c.setHurt(amount0to1, enemyColor) // enemy-ink splotches on the body/clothes (fades as amount → 0)
c.setVisible(bool)
c.getMuzzle(outVec3)              // world-space muzzle position of the held weapon (after update)
c.dispose()
```
AnimState:
```js
{
  time,                  // seconds (global clock)
  speed,                 // horizontal speed m/s
  localMove: {x, z},     // move direction relative to facing, |v|<=1, +z forward, +x right
  grounded, vy,          // vertical velocity
  aimPitch,              // radians, + = looking up (upper body/arms/head follow aim)
  firing,                // trigger held (shooter/blaster pose)
  charge,                // 0..1 charger charge (pose + glowing charge cue on the weapon)
  rolling,               // roller planted on ground and pushing
  form,                  // 'kid' | 'squid' (dry hop) | 'swim' (submerged in own ink) | 'climb' (swimming up a wall)
  wallNormal,            // THREE.Vector3 when form==='climb'
  ink,                   // 0..1 → visible ink level inside the back tank
  lowInk,                // bool → tank blinks
  special,               // 0..1; at 1 the hair/tentacles glow & pulse (special ready)
  invuln,                // bool → gentle flashing (spawn protection)
  // optional (supplied by actor.js since v1.1; character.js must tolerate their absence):
  turnRate,              // rad/s, + = turning left / CCW seen from above
  hp,                    // 0..1
  inEnemyInk,            // bool
  surface,               // 0 dry · 1 own ink · 2 enemy ink
  subAim,                // bool — splat bomb held cocked while aiming the throw
}
```
Form transitions (kid ⇄ squid) are animated *inside* the character (≈0.12 s squash/pop). 'swim' = squid mostly under the
ink surface: for remote players only a faint dorsal ripple shape is visible; for `isLocal` render the squid slightly
translucent just under the surface so the player can see themselves. 'climb' = squid aligned to wall, belly on wall, head up.

Visual spec: ~1.45 m tall kid, big head (~0.36 m), 4–6 glossy tentacle "hair" strands in team colour (clearcoat, with
subtle suction-cup dots underneath), a dark visor/goggle band across the eyes with bright eyes, short-sleeve tee with a
team-colour stripe, shorts, chunky sneakers, a transparent ink tank backpack whose ink fill level = s.ink. Weapons:
shooter (chunky blaster-pistol with tank), roller (long handle + wide roller drum coated in ink), charger (long rifle with
scope + glowing charge coil), blaster (fat bulbous launcher). Squid form ≈0.6 m, glossy, triangular mantle fins, big eyes,
wiggling tentacles. Animations: idle breathe, run cycle (arm/leg swing, head bob, lean into accel), strafe while aiming,
jump/fall/land squash, shoot recoil, roller push & flick windup, charger aim, bomb throw, special leap/slam, hurt flinch,
dances (victory: jumpy fist-pump/spin; defeat: slumped sway; menu_idle: relaxed weight shifts + look-around).
Budget: ≤ ~45 draw calls per character; cache materials by colour; share geometries across instances.

## 2. `src/audio/audio.js` + `src/audio/music.js` — fully procedural WebAudio

```js
import { audio } from './audio.js';
audio.init()                          // idempotent; call from a user gesture. Creates ctx, master/music/sfx buses, compressor, reverb.
audio.setVolumes({ master, music, sfx })   // 0..1 each
audio.setListener(pos, forward, up)   // THREE.Vector3s, every frame
audio.play(name, { pos, volume=1, pitch=1 })  // one-shot; pos → 3D panned & distance-attenuated, else 2D
const h = audio.loop(name, { pos, volume, pitch }); h.set({ volume, pitch, pos }); h.stop(fade=0.15)
audio.duck(amount=0.5, seconds=1.2)   // temporarily lowers music
import { music } from './music.js';   // audio.init() also initialises music on the music bus
music.play(track, { fade=1.0 })       // 'title' | 'menu' | 'battle' | 'battle_final' | 'results_win' | 'results_lose' | null
music.setIntensity(0..1)
```
Must stay cheap: voice-limit per sound name (e.g. max 6 concurrent 'splat_small'), randomise pitch ±6% so repeats don't
sound robotic. SFX names (all must exist):
`ui_hover ui_click ui_back ui_confirm ui_toggle ui_slider ui_error`
`shoot_shooter shoot_blaster blaster_boom charger_charge(loop) charger_full shoot_charger roller_flick roll(loop; pitch/volume ≈ speed)`
`splat_small splat_big ink_hit_wall bomb_throw bomb_beep bomb_explode`
`squid_in squid_out swim(loop) swim_splash jump land climb(loop)`
`hit_marker hurt splat_enemy splatted_self ally_splatted enemy_ink_sizzle(loop)`
`low_ink empty_click refill_full special_ready special_activate special_slam storm_rain(loop) storm_thunder respawn super_jump`
`ready go_horn countdown_tick one_minute final_count times_up judge_drumroll judge_reveal victory_fanfare defeat_jingle xp_tick level_up`
Music: original, catchy, energetic punk/funk/electro-pop, 140–160 BPM for battle; a chill but groovy menu theme; the
title theme with an attitude hook; battle_final = same key, more urgent (double-time hats, extra lead layer); short
results stings. Real sequencer with lookahead scheduling, synthesized drums/bass/chords/lead, bus compression + reverb/delay.

## 3. UI — `src/ui/menus.js`, `src/ui/hud.js`, `styles/ui.css`

Everything mounts into `<div id="ui-root">` (full-screen, above the WebGL canvas, `pointer-events` only where needed).
The WebGL scene keeps rendering behind menus (the lobby/attract mode), so menu screens must leave the 3D visible
(glass/ink panels, not full-screen opaque sheets; loadout keeps the right ~45% clear for the 3D character preview).

```js
import { Menus } from './menus.js';
const menus = new Menus(rootEl, api);
menus.show(screen)        // 'loading' | 'title' | 'main' | 'loadout' | 'setup' | 'settings' | 'howto' | 'credits' | 'pause' | 'results' | null
menus.current             // current screen name or null
menus.setLoading(p, label)
menus.showResults(ResultsData)   // then show('results')
menus.update(dt)
menus.handleKey(e) / gamepad nav: menus.nav('up'|'down'|'left'|'right'|'accept'|'back')
```
`api` (provided by core): `getSettings() setSettings(partial) getProfile() setProfileName(n) getLoadout() setLoadout({weapon})
weapons (WEAPONS) weaponOrder specials (SPECIALS) sub (SUB.bomb) maps (MAPS) difficulties (DIFFICULTY)
startMatch({ mapId, difficulty, duration }) resumeMatch() quitMatch() rematch() toMainMenu() onScreenChange(screen) playSound(name) version`.

```js
import { HUD } from './hud.js';
const hud = new HUD(rootEl);
hud.setVisible(bool)
hud.update(dt, frame)        // every frame while in a match, frame = HudFrame
hud.banner(kind, text)       // 'ready' 'go' 'one_minute' 'timesup' 'special' 'custom'
hud.countdown(n)             // big final-10s numbers
hud.hitMarker('hit'|'kill')
hud.feed({ text, color, kind: 'kill'|'death'|'ally'|'info' })
hud.damage(amount0to1, colorHex)     // enemy-ink smear on screen edges, fades over ~1.5s
hud.showSplatted({ by, byColor, respawn })  // death overlay + countdown ring
hud.hideSplatted()
hud.judge({ colors:[a,b], percents:[pa,pb], names:[...] }) → Promise   // end-of-match coverage reveal (bar fills, numbers roll, winner punch)
```
HudFrame:
```js
{ time,                                   // seconds left
  teams: [ { color, players: [ { name, alive, respawn, specialReady, isSelf } ] }, {...} ],   // top bar squid icons
  ink, inkLow, subCost,                   // 0..1 tank + preview of bomb cost
  special, specialReady, specialActive,   // 0..1 gauge
  hp,                                     // 0..1 (screen-edge warning under ~40%)
  weapon, charge,                         // crosshair style per weapon; charger shows charge ring
  crosshair: { spread, onTarget },        // spread px; onTarget: 'enemy' | null
  map: { canvas, expanded, players:[{ x, y, team, isSelf, yaw, alive }] }, // canvas drawn by core; x,y in 0..1 canvas space
  markers: [ { x, y, name, color, onScreen, angle } ],   // ally name tags (screen px) / edge arrows
  prompt: string|null,                    // contextual hint, e.g. 'Hold SHIFT to swim'
  fps }
```
ResultsData:
```js
{ win, percents:[a,b], colors:[a,b], teamNames:[...],
  players: [ { name, team, weapon, turf, splats, deaths, isSelf } ],   // 8 entries
  xp: { gained, levelBefore, levelAfter, xpBefore, xpAfter, xpToNextBefore, xpToNextAfter },
  mapName }
```
Style: playful and loud but clean and legible — chunky display type (Titan One), heavy Rubik UI text, ink-blob and
squiggle shapes (inline SVG), slight tilts, black/white + team colours, bouncy spring animations (overshoot) on every
state change, hover/press states with sound. Must feel like a shipped console game, not a web page.

## 4. `src/fx/fx.js` + `src/world/environment.js`

```js
import { FX } from './fx.js';
const fx = new FX(scene, { quality });
fx.setCollider((from, to) => hit|null)   // hit = { point, normal } ; droplets stop/splat on geometry
fx.onDropletLand = (point, normal, color, size) => {}   // engine paints tiny splats for droplets with paint:true
fx.burst(pos, normal, color, { count=12, speed=4, size=0.1, spread=0.9, gravity=1, paint=false })
fx.drop(pos, vel, color, { size=0.1, life=1.2, paint=false })
fx.ring(pos, normal, color, { radius=1.5, life=0.35 })
fx.explosion(pos, color, radius)          // bomb / slam
fx.splatted(pos, color)                   // a character bursts into ink
fx.wake(pos, dir, color, speed)           // swimming ripple/wake, call ~every frame while swimming
fx.muzzle(pos, dir, color)
fx.spawnFlash(pos, color)
fx.rain(pos, radius, color, dt)           // ink tempest rain streaks under a cloud (call per frame)
fx.update(dt, camera)
fx.clear()
```
Must be allocation-free per frame (pooled InstancedMesh/points), cap live particles, and look wet and glossy
(team-coloured, stretched along velocity, little satellite droplets).

```js
import { Environment } from './environment.js';
const env = new Environment(renderer, scene, { bounds: { minX, maxX, minZ, maxZ }, theme: 'day'|'sunset' });
env.sun                 // THREE.DirectionalLight (castShadow configured; engine may tighten shadow camera)
env.hemi                // THREE.HemisphereLight
env.envMap              // PMREM texture → set as scene.environment
env.fogColor
env.update(dt, camera)  // animate water/clouds/gulls
env.setTheme(theme)
```
Contents: gradient sky dome with stylized clouds + sun, an animated stylized ocean surrounding the arena (the arena sits
on a harbor deck; arena floor y = 0, water surface at y = -1.6; touching the water = splatted), distant skyline/cranes/lighthouse/
hills silhouettes, a few gulls, buoys. Must not contain anything inside the playable bounds.


## v1.1 additions (see the file headers for full signatures)
- **FX (src/fx/fx.js)** grew to ~45 recipes — footstep, land, jumpOff, formPop, dive, emerge, climbDrip, hitSplash, shotTrail,
  muzzle(pos, dir, color, kind), chargeGlow, beamImpact, rollerSpray, flickCurtain, dangerRing, beepPulse, slamWave,
  rainSheet, superJump*, jumpMarker, ghost, seaSpray, glint…, plus immediate-mode `mark()` / `pillar()` and
  `fx.stats()` / `fx.triangles()`. They are driven by **src/fx/fxHooks.js** (`initFxHooks(G)` → `.update(dt)`), which
  subscribes to the event bus (docs/EVENTS.md) and falls back to polling actor state.
- **Decor**: `decor.pulse(team, strength)` flares a spawn pad (respawns, super jumps home).
- **Screen FX (src/fx/screenfx.js)**: `new ScreenFX(R, G)` installs one post pass via `R.setExtraPass(pass)` (after the
  grade, before OutputPass; OutputPass only runs while the pass is enabled, otherwise the renderer's final pass tone maps
  straight to the canvas) and is updated with `update(dt, game)`; it listens to the bus. Intense effects scale
  with settings.cameraShake / reduced motion.
- **Renderer**: `R.setExtraPass(pass)`, `R.setDynamicScale(s)`; environment exposes `env.grade` (per-theme colour grade)
  which the renderer applies automatically.
- **HUD styles** live in styles/hud.css (imported by styles/ui.css).
