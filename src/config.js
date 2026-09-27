// Shared tuning + content definitions. Every module reads from here; nothing here imports anything.

export const GAME_TITLE = 'INKWAVE';
export const GAME_SUBTITLE = 'Turf Riot';
export const VERSION = '1.0.0';

// Team ink palettes. Team 0 ("Alpha") is always the local player's team; a palette is picked per match.
export const TEAM_PALETTES = [
  { id: 'tangerine-cobalt', a: '#ff8a14', b: '#2f5bff', names: ['Tangerine', 'Cobalt'] },
  { id: 'bubblegum-mint', a: '#ff3f9e', b: '#18d48c', names: ['Bubblegum', 'Mint'] },
  { id: 'lemon-grape', a: '#f2e312', b: '#8a3cff', names: ['Lemon', 'Grape'] },
  { id: 'aqua-cherry', a: '#10d2e6', b: '#ff4150', names: ['Aqua', 'Cherry'] },
  { id: 'lime-magenta', a: '#a6f01a', b: '#e02cd8', names: ['Lime', 'Magenta'] },
];
// Used instead when settings.colorblind is on (yellow vs blue is safe for all common CVD types).
export const COLORBLIND_PALETTE = { id: 'cb-yellow-blue', a: '#ffd21a', b: '#2a52ff', names: ['Sun', 'Sea'] };

export const TEAM_NAMES = ['Alpha', 'Bravo'];

// ---- Player physics / feel (meters, seconds) ----
export const PLAYER = {
  hp: 100,
  radius: 0.38,
  height: 1.45,          // kid form standing height (feet -> top of head)
  squidHeight: 0.55,
  runSpeed: 6.0,
  squidDrySpeed: 2.9,    // squid hopping on unpainted ground
  swimSpeed: 11.8,       // squid submerged in own ink
  enemyInkSpeed: 1.9,
  climbSpeed: 7.5,
  accelGround: 42,
  accelAir: 14,
  accelSwim: 60,
  jumpVel: 8.4,
  swimJumpVel: 9.4,
  gravity: 25,
  maxFall: 40,
  inkMax: 100,
  inkRefillSwim: 42,     // per second while submerged
  inkRefillKid: 9,       // per second in kid form after idle delay
  inkRefillDelay: 0.9,
  enemyInkDps: 20,       // damage/s while standing in enemy ink ...
  enemyInkDamageCap: 40, // ... never takes you below (hp - cap) from ink alone
  regenDelay: 1.3,
  regenRate: 22,
  regenRateSwim: 60,
  respawnTime: 5.5,
  spawnInvuln: 1.6,
  fallDeathY: -1.45,  // touching the sea (surface y = -1.6) splats you
  waterY: -1.6,

  // ---- handling (see actor.js _horizontal / _integrate). Measured with tools/measure-handling.mjs.
  // ground run: S-curve accel (ease-in over the first ~1.6 m/s, ease-out over the last 28 % of top speed)
  runAccel: 70, runAccelIn: 0.5, runInKnee: 1.6, runOutKnee: 0.28, runOutMin: 0.22,
  runDecel: 58, runDecelMin: 0.4, runDecelKnee: 2.2,   // brake: strong at speed, eases into the stop (no hard corner)
  reverseDecel: 78, reverseAngle: 2.2,                  // > ~126° input change = plant-and-reverse (vector brake-through)
  turnRate: 15, turnRateSlow: 1.5,                      // velocity heading slew (rad/s); faster when slow → carve, never dip
  airAccel: 20, airDecel: 4, airMinSpeed: 4.6,
  squidAccel: 34, squidDecel: 26, squidTurn: 13,        // squid hopping on dry ground (also the swim-exit glide)
  swimAccel: 64, swimAccelIn: 0.75, swimDecel: 42, swimTurn: 11, swimOutKnee: 0.22,   // 90 % speed in 0.18 s, 1.6 m glide to a stop
  squidAirAccel: 14, squidAirDecel: 3,
  enemyInkDecel: 30, enemyInkAccel: 30,                 // wading into enemy ink: a quick but readable bog-down
  // jumping
  jumpBuffer: 0.13,       // a jump pressed this long before touching down still fires on landing
  coyoteTime: 0.12,       // ... and this long after walking off an edge
  fallGravityMul: 1.2,    // snappier descent
  apexGravityMul: 0.82,   // a hair of hang at the top of the arc (|vy| < apexBand)
  apexBand: 1.6,
  hardLandSpeed: 11.5,    // landings faster than this (falls > ~2.3 m) cost a short recovery
  hardLandSlow: 0.72, hardLandTime: 0.16,
  // character controller
  footRadius: 0.24,       // flat footprint for the ground probe (ledge hold / lips)
  stepUp: 0.35,           // curbs/lips a kid walks straight onto (body capsule is lifted by this much)
  stepDown: 0.45,         // ground stick range while grounded (ramps, steps down)
  squidStepUp: 0.24, squidBodyLift: 0.16,
  ledgeAssist: 0.35,      // falling feet this far below a ledge top still land on it (pop-up, visually smoothed)
  // facing (angular spring with a rate cap: smooth ease-in/out turns, never a snap)
  faceOmega: 20, faceMaxRate: 12.5, faceMaxAcc: 170, squidFaceOmega: 26, squidFaceMaxRate: 17, swimFaceMaxRate: 14, squidFaceMaxAcc: 260,
  aimFaceOmega: 36, aimFaceMaxRate: 24, aimFaceMaxAcc: 380,
  // wall climb
  climbAccel: 46, climbSideSpeed: 5.2, climbAttachDot: 0.5, climbDetachDot: -0.45,
  ledgePopClear: 0.42,    // apex this far above the ledge top when popping over it
  ledgePopCarry: 2.5,     // forward speed onto the ledge
  emergeDelay: 0.07,      // squid → kid before the first shot can leave the barrel (the shot is buffered, not lost)
  fireBuffer: 0.16,
};

// ---- Weapons ----
// stats.* are 0..1 display bars for the loadout screen.
export const WEAPONS = {
  shooter: {
    id: 'shooter', name: 'Spritzer', kind: 'shooter', class: 'Shooter', sub: 'bomb',
    blurb: 'Rapid-fire all-rounder. Sprays a steady stream of ink blobs.',
    stats: { range: 0.5, damage: 0.45, rate: 0.85, mobility: 0.7, paint: 0.6 },
    fireInterval: 0.1, damage: 36, inkPerShot: 0.95,
    projSpeed: 34, straightTime: 0.13, range: 12.5,
    spreadGround: 5.5, spreadAir: 11,   // degrees
    impactRadius: 0.85, trailRadius: 0.44, trailEvery: 1.05,
    moveSpeedFiring: 4.6,
    special: 'slam', specialCost: 190,
  },
  roller: {
    id: 'roller', name: 'Swell Roller', kind: 'roller', class: 'Roller', sub: 'bomb',
    blurb: 'Roll out wide stripes of turf. Flick for a crushing splash.',
    stats: { range: 0.35, damage: 0.95, rate: 0.3, mobility: 0.55, paint: 0.95 },
    rollSpeed: 4.4, rollWidth: 1.9, rollInkPerMeter: 1.1, rollDamage: 140,
    flickInterval: 0.62, flickWindup: 0.22, flickInk: 9, flickDrops: 9,
    flickDamageNear: 125, flickDamageFar: 30, flickSpeed: 17, flickSpreadDeg: 34,
    impactRadius: 1.0,
    moveSpeedFiring: 4.4,
    special: 'slam', specialCost: 170,
  },
  charger: {
    id: 'charger', name: 'Glint Charger', kind: 'charger', class: 'Charger', sub: 'bomb',
    blurb: 'Hold to charge, release for a long piercing line. Full charge splats.',
    stats: { range: 1.0, damage: 1.0, rate: 0.25, mobility: 0.35, paint: 0.45 },
    chargeTime: 1.0, rangeMin: 11, rangeMax: 27, damageMin: 40, damageMax: 160,
    inkFull: 18, lineSplatEvery: 1.2, lineRadius: 0.55, impactRadius: 1.2,
    moveSpeedFiring: 1.8,
    special: 'storm', specialCost: 180,
  },
  blaster: {
    id: 'blaster', name: 'Popper Blaster', kind: 'blaster', class: 'Blaster', sub: 'bomb',
    blurb: 'Slow shots that burst mid-air. Direct hits splat instantly.',
    stats: { range: 0.55, damage: 0.9, rate: 0.3, mobility: 0.6, paint: 0.5 },
    fireInterval: 0.78, directDamage: 125, splashDamageMax: 70, splashDamageMin: 30,
    splashRadius: 2.6, inkPerShot: 9, projSpeed: 23, range: 10.5,
    impactRadius: 1.5, burstRadius: 1.9,
    moveSpeedFiring: 4.0,
    special: 'storm', specialCost: 180,
  },
  dualies: {
    id: 'dualies', name: 'Twinfin Dualies', kind: 'dualies', class: 'Dualies', sub: 'bomb',
    blurb: 'Twin pistols, alternating fire. Jump while firing to dodge-roll, then plant and unload.',
    stats: { range: 0.42, damage: 0.4, rate: 0.95, mobility: 0.95, paint: 0.55 },
    fireInterval: 0.083, damage: 30, inkPerShot: 0.85,        // hands alternate: 12 shots/s, 4 hits to splat
    projSpeed: 32, straightTime: 0.11, range: 11,
    spreadGround: 6.5, spreadAir: 12, spreadFirst: 0.5, bloomPerShot: 0.25, spreadLock: 2.2,
    impactRadius: 0.75, trailRadius: 0.38, trailEvery: 1.15,
    moveSpeedFiring: 5.0,
    rollInk: 7, rollTime: 0.3, rollDist: 2.8, rolls: 2, lockTime: 0.5, lockInterval: 0.07,   // dodge roll → locked turret
    special: 'slam', specialCost: 180,
  },
  slosher: {
    id: 'slosher', name: 'Tidebucket Slosher', kind: 'slosher', class: 'Slosher', sub: 'bomb',
    blurb: 'Heaves a heavy wave of ink in an arc: over cover, up ledges, a thick stripe where it lands.',
    stats: { range: 0.58, damage: 0.8, rate: 0.4, mobility: 0.6, paint: 0.78 },
    fireInterval: 0.62, windup: 0.13, inkPerShot: 7.5,
    projSpeed: 15, grav: 22, range: 9.5, drops: 8,
    damageHead: 70, damageTail: 34, splashRadius: 1.1, splashDamage: 26,
    impactRadius: 1.05, trailRadius: 0.5, trailEvery: 1.4,
    moveSpeedFiring: 4.2,
    special: 'slam', specialCost: 175,
  },
  splatling: {
    id: 'splatling', name: 'Gyre Splatling', kind: 'splatling', class: 'Splatling', sub: 'bomb',
    blurb: 'Hold to spin up, release for a long high-speed stream. The more charge, the longer it lasts.',
    stats: { range: 0.78, damage: 0.55, rate: 1.0, mobility: 0.38, paint: 0.7 },
    chargeTime: 0.85, burstMin: 0.3, burstMax: 1.7, fireInterval: 0.066, damage: 28, inkPerShot: 0.6,
    projSpeed: 40, straightTime: 0.16, range: 15,
    spreadGround: 3.2, spreadAir: 7, spreadFirst: 0.6, bloomPerShot: 0.05,
    impactRadius: 0.8, trailRadius: 0.42, trailEvery: 1.2,
    moveSpeedCharging: 2.4, moveSpeedFiring: 3.4,
    special: 'storm', specialCost: 195,
  },
};
export const WEAPON_ORDER = ['shooter', 'dualies', 'splatling', 'roller', 'slosher', 'charger', 'blaster'];

export const SUB = {
  bomb: {
    id: 'bomb', name: 'Splat Bomb', inkCost: 70, throwSpeed: 13.5, fuse: 0.95,
    radius: 3.1, damageMax: 180, damageMin: 35, paintRadius: 2.7,
  },
};

export const SPECIALS = {
  slam: { id: 'slam', name: 'Tidal Slam', blurb: 'Leap up and slam down in a huge ink shockwave.', rise: 0.55, hang: 0.25, radius: 5.2, killRadius: 3.2, damageMax: 180, damageMin: 55 },
  storm: { id: 'storm', name: 'Ink Tempest', blurb: 'Hurl a rain cloud that soaks the turf below.', duration: 6.5, radius: 3.4, dps: 34, throwSpeed: 16, driftSpeed: 1.1 },
};

// ---- Match ----
export const MATCH = {
  durations: [90, 180],     // seconds
  defaultDuration: 180,
  finalCountdown: 10,
  teamSize: 4,
  pointsPerM2: 1.0,          // turf points per square metre newly inked
};

export const DIFFICULTY = {
  // aimOmega / aimTurn: bot aim spring stiffness (rad/s) and turn-rate cap (rad/s) — see bots.js
  easy:   { id: 'easy',   name: 'Chill',  reaction: 0.55, aimError: 0.11, fireDiscipline: 0.55, awareness: 16, aimOmega: 9,  aimTurn: 7 },
  normal: { id: 'normal', name: 'Fresh',  reaction: 0.32, aimError: 0.06, fireDiscipline: 0.8,  awareness: 21, aimOmega: 13, aimTurn: 10 },
  hard:   { id: 'hard',   name: 'Fierce', reaction: 0.17, aimError: 0.03, fireDiscipline: 0.95, awareness: 26, aimOmega: 18, aimTurn: 14 },
};

// Every stage can be played by day or at dusk: `times` maps the time of day to an environment theme (`theme` is the
// stage's day look, kept for older callers). Pick with mapTheme(map, time).
export const TIMES = ['day', 'dusk'];
export const mapTheme = (map, time = 'day') => (map && map.times && map.times[time]) || (map && map.theme) || 'day';
export const MAPS = [
  { id: 'tidewater', name: 'Tidewater Plaza', blurb: 'A sun-bleached harbor plaza on the edge of the sea.', theme: 'day', times: { day: 'day', dusk: 'sunset' } },
  { id: 'kelpline', name: 'Kelpline Terminal', blurb: 'Container yard with grate catwalks, a sunken trench and a steel gantry deck.', theme: 'day', times: { day: 'day', dusk: 'sunset' } },
  { id: 'halyard', name: 'Halyard Marina', blurb: 'Floating docks, a tug on blocks and a car ferry moored across the middle. Mind the water.', theme: 'golden', times: { day: 'golden', dusk: 'sunset' } },
];

export const BOT_NAMES = [
  'Squiddo', 'Blotch', 'Marlo', 'Inky Vee', 'Pip', 'Coral', 'Riptide', 'Nori', 'Suki', 'Zest',
  'Kelp', 'Drip', 'Tako', 'Sprinkle', 'Bubbles', 'Moxie', 'Juno', 'Wasabi', 'Fizz', 'Loop',
];

// ---- Progression ----
export const PROGRESSION = {
  xpForLevel: (lvl) => 800 + lvl * 350,
  xpWin: 1200, xpLose: 500, xpPerTurfPoint: 1.0, xpPerSplat: 40,
};

// ---- Settings defaults (persisted in localStorage 'inkwave.settings') ----
export const DEFAULT_SETTINGS = {
  sensitivity: 1.0,         // mouse multiplier 0.2..3
  padSensitivity: 1.0,
  invertY: false,
  fov: 82,                  // horizontal FOV at 16:9, 65..100
  quality: 'high',          // 'low' | 'medium' | 'high' | 'ultra'
  shadows: true,
  bloom: true,
  cameraShake: 1.0,         // 0..1
  showFps: false,
  fullscreen: true,         // matches go fullscreen with Esc captured (main.js _enterFullscreen)
  master: 0.8, music: 0.6, sfx: 0.85,
  colorblind: false,
  minimap: true,
  matchLength: 180,
  difficulty: 'normal',
  rumble: 1.0,              // gamepad vibration 0..1 (only while the pad is the last-used device)
  aimAssist: 1.0,           // gamepad aim assist 0..1
  aimAssistMouse: false,    // optional aim assist for mouse
};

// Quality presets consumed by the renderer + fx.
export const QUALITY = {
  // pixelRatio = cap on devicePixelRatio (Retina screens render at up to this density)
  low:    { pixelRatio: 0.75, shadowSize: 1024, msaa: 0, bloom: false, ao: false, paintAtlas: 2048, particles: 0.4 },
  medium: { pixelRatio: 1.0,  shadowSize: 2048, msaa: 2, bloom: true,  ao: false, paintAtlas: 2048, particles: 0.7 },
  high:   { pixelRatio: 1.5,  shadowSize: 4096, msaa: 4, bloom: true,  ao: true,  paintAtlas: 4096, particles: 1.0 },
  ultra:  { pixelRatio: 2.0,  shadowSize: 4096, msaa: 4, bloom: true,  ao: true,  paintAtlas: 4096, particles: 1.0 },
};
