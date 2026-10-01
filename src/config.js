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
  specialChargeRate: 0.4,   // special meter points per m² of turf inked (halved again 2026-09-28: 0.8 → 0.4); special ink never charges it
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
  // share of the special gauge you keep when splatted (a special running at the time ends and the gauge restarts
  // from this share of full); the rest is lost, and what's kept carries through the respawn
  specialKeepOnSplat: 0.5,
  spawnInvuln: 1.6,
  fallDeathY: -1.45,  // touching the sea (surface y = -1.6) splats you
  waterY: -1.6,

  // ---- handling (stream 4; see actor.js _horizontal / _integrate). Measured with tools/measure-handling.mjs.
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
    id: 'shooter', name: 'Spritzer', kind: 'shooter', class: 'Shooter',
    blurb: 'Rapid-fire all-rounder. Sprays a steady stream of ink blobs.',
    stats: { range: 0.5, damage: 0.45, rate: 0.85, mobility: 0.7, paint: 0.6 },
    fireInterval: 0.1, damage: 36, inkPerShot: 0.95,
    projSpeed: 34, straightTime: 0.13, range: 12.5,
    spreadGround: 5.5, spreadAir: 11,   // degrees
    impactRadius: 0.85, trailRadius: 0.44, trailEvery: 1.05,
    moveSpeedFiring: 4.6,
    special: 'zooka', specialCost: 190, sub: 'bomb',
  },
  roller: {
    id: 'roller', name: 'Swell Roller', kind: 'roller', class: 'Roller',
    blurb: 'Roll out wide stripes of turf. Flick for a crushing splash.',
    stats: { range: 0.35, damage: 0.95, rate: 0.3, mobility: 0.55, paint: 0.95 },
    rollSpeed: 4.4, rollWidth: 1.9, rollInkPerMeter: 1.1, rollDamage: 140,
    flickInterval: 0.62, flickWindup: 0.22, flickInk: 9, flickDrops: 9,
    flickDamageNear: 125, flickDamageFar: 30, flickSpeed: 17, flickSpreadDeg: 34,
    impactRadius: 1.0,
    moveSpeedFiring: 4.4,
    special: 'kraken', specialCost: 170, sub: 'sticky',
  },
  charger: {
    id: 'charger', name: 'Glint Charger', kind: 'charger', class: 'Charger',
    blurb: 'Hold to charge, release for a long piercing line. Full charge splats.',
    stats: { range: 1.0, damage: 1.0, rate: 0.25, mobility: 0.35, paint: 0.45 },
    chargeTime: 1.0, rangeMin: 11, rangeMax: 27, damageMin: 40, damageMax: 160,
    inkFull: 18, lineSplatEvery: 1.2, lineRadius: 0.55, impactRadius: 1.2,
    moveSpeedFiring: 1.8,
    special: 'sonar', specialCost: 180, sub: 'mine',
  },
  blaster: {
    id: 'blaster', name: 'Popper Blaster', kind: 'blaster', class: 'Blaster',
    blurb: 'Slow shots that burst mid-air. Direct hits splat instantly.',
    stats: { range: 0.55, damage: 0.9, rate: 0.3, mobility: 0.6, paint: 0.5 },
    fireInterval: 0.78, directDamage: 125, splashDamageMax: 70, splashDamageMin: 30,
    splashRadius: 2.6, inkPerShot: 9, projSpeed: 23, range: 10.5,
    impactRadius: 1.5, burstRadius: 1.9,
    moveSpeedFiring: 4.0,
    special: 'jetpack', specialCost: 180, sub: 'burst',
  },
  // `anim` = the pose family the character animates with (kind otherwise)
  bucket: {
    id: 'bucket', name: 'Bilge Bucket', kind: 'bucket', class: 'Bucket', anim: 'blaster',
    blurb: 'Hurl a wave of ink in an arc: aim higher to throw farther, lob it over cover. Full damage at any distance; two hits splat.',
    stats: { range: 0.5, damage: 0.8, rate: 0.35, mobility: 0.6, paint: 0.7 },
    fireInterval: 0.6, windup: 0.12, inkPerShot: 6,
    throwSpeed: 15.5, lob: 0.3, blobs: 5, gravity: 20, drag: 0.25, reach: 9.5,
    damage: 55, impactRadius: 1.05,       // no distance falloff; only targets below you take less (belowFalloff per m, capped)
    belowFalloff: 0.12, belowFalloffMax: 0.35,
    moveSpeedFiring: 4.2,
    special: 'blower', specialCost: 180, sub: 'sprinkler',
  },
  spinner: {
    id: 'spinner', name: 'Squall Spinner', kind: 'spinner', class: 'Spinner', anim: 'charger',
    blurb: 'Spin up, then unleash a stream of ink. A full spin reaches farthest and fires longest.',
    stats: { range: 0.88, damage: 0.55, rate: 1.0, mobility: 0.4, paint: 0.7 },
    chargeTime: 1.0, inkFull: 24, burstMin: 0.35, burstMax: 1.8, fireInterval: 0.05,
    damage: 26, speedMin: 25, speedMax: 40, straightMin: 0.09, straightMax: 0.24, rangeMin: 10, rangeMax: 21,
    spreadGround: 2.8, spreadAir: 6, impactRadius: 0.72, trailRadius: 0.38, trailEvery: 1.25,
    moveSpeedCharging: 3.3, moveSpeedFiring: 3.0,
    special: 'crab', specialCost: 200, sub: 'curtain',
  },
  twins: {
    id: 'twins', name: 'Twinfire Pistols', kind: 'twins', class: 'Pistols', anim: 'shooter',
    blurb: 'Paired pistols. Jump while firing to dodge-roll; stand still after a roll for rapid, longer-range fire. Walking returns to dual mode.',
    stats: { range: 0.4, damage: 0.4, rate: 0.95, mobility: 0.9, paint: 0.55 },
    fireInterval: 0.085, damage: 30, inkPerShot: 0.85, projSpeed: 31, straightTime: 0.11, range: 11,
    spreadGround: 6, spreadAir: 11, impactRadius: 0.78, trailRadius: 0.4, trailEvery: 1.1,
    moveSpeedFiring: 5.2,
    rollDist: 3.4, rollTime: 0.3, rollInk: 7, rollCharges: 2, rollLockout: 2.6, rollReset: 1.4,
    turretInterval: 0.058, turretSpread: 1.6, turretProjSpeed: 36, turretStraight: 0.16, turretRange: 13.5,
    special: 'bubbler', specialCost: 180, sub: 'seeker',
  },
  brush: {
    id: 'brush', name: 'Swish Brush', kind: 'brush', class: 'Brush', anim: 'roller',
    blurb: 'Dash along the ground leaving a thin trail, or swipe side to side to flick a spray of small globs.',
    stats: { range: 0.2, damage: 0.35, rate: 1.0, mobility: 1.0, paint: 0.5 },
    brushSpeed: 7.4, brushWidth: 0.95, brushInkPerMeter: 0.32, brushDamage: 30, brushHitCd: 0.35,
    swipeInterval: 0.16, swipeInk: 2.2, swipeDrops: 5, swipeSpeed: 12.5, swipeSpreadDeg: 40,
    swipeDamageNear: 26, swipeDamageFar: 12, impactRadius: 0.7,
    moveSpeedFiring: 5.8,
    special: 'stamp', specialCost: 170, sub: 'mist',
  },
  // ---- kit weapons: each kind lives in src/game/kits/<kind>.js (registered in kits/registry.js); the numbers here are its tuning
  brolly: {
    id: 'brolly', name: 'Canopy Brolly', kind: 'brolly', class: 'Brolly', anim: 'shooter',
    blurb: 'A shotgun spray of ink pellets. Hold to open the canopy: a shield for you and your team. Keep holding to launch it as a rolling wall.',
    stats: { range: 0.35, damage: 0.7, rate: 0.5, mobility: 0.6, paint: 0.55 },
    range: 7,
    // pellets: a narrow cone of `pellets` per shot; each does pelletDamage out to falloffStart (m), easing to
    // pelletDamageFar at falloffEnd — a near-full blast (10–11 pellets) is 80–88, so two shots splat up close
    fireInterval: 0.45, inkPerShot: 5.5, pellets: 11, pelletDamage: 8, pelletDamageFar: 2.5, falloffStart: 2.8, falloffEnd: 6.5,
    projSpeed: 25, straightTime: 0.1, pelletGrav: 30, pelletDrag: 2, pelletLife: 0.6, pelletSize: 0.1, pelletPaint: 0.5,
    spreadDeg: 8, spreadAir: 10,
    moveSpeedFiring: 4.6, moveSpeedShield: 3.1,
    // canopy (kits/brolly.js): hold after the shot to open it; kept open launchHold s it launches as a sliding wall.
    // It blocks enemy shots / beams / ink, soaks bomb blasts, breaks at 0 hp and regrows regrowTime s after a break
    // or a launch; a damaged canopy mends at canopyRegen hp/s once folded and untouched for canopyRegenDelay s
    canopyHp: 450, openDelay: 0.12, openTime: 0.14, closeTime: 0.1, launchHold: 0.9, regrowTime: 5,
    canopyRegen: 60, canopyRegenDelay: 2,
    launchSpeed: 2.6, launchLife: 6, launchPaint: 0.8,
    special: 'bubbler', specialCost: 180, sub: 'tracer',
  },
  bow: {
    id: 'bow', name: 'Tideline Bow', kind: 'bow', class: 'Bow', anim: 'charger',
    blurb: 'Draw to fill two rings, then loose three arrows at once: a flat fan on the ground, an upright one in the air. Past the first ring the arrows stick where they land and burst.',
    stats: { range: 0.85, damage: 0.6, rate: 0.45, mobility: 0.5, paint: 0.6 },
    // (kits/bow.js) draw time to full; ring 1 is this share of it. Charge < ring1 = a tap: short, weak, no lodge
    chargeTime: 1.0, ring1: 0.45,
    inkFull: 16, inkMin: 0.15,                              // ink per shot = inkFull × max(inkMin, charge)
    range: 25,                                              // full-draw reach where a level shot lands (aim assist, bots, reticle)
    flightTap: [5, 7.5], flightRing: [12.5, 16.5], flightFull: 21,   // straight flight per tier (m), then the arrow dives
    speedTap: 32, speedRing: [42, 48], speedFull: 58,       // arrow speed (m/s): fast, with a light arc
    straight: 0.05, grav: 6, diveGrav: 140, diveDrag: 6,    // past its flight an arrow noses down into the ground (~3-4 m)
    damageTap: [14, 20], damageRing: [30, 38], damageFull: 55,   // direct hit, centre arrow
    sideMul: 0.8, sideFull: 45,                             // side arrows (full draw: centre + side = a splat)
    fanTap: 8, fanRing: 6, fanFull: 4.5,                    // degrees between neighbouring arrows
    fuseRing: 0.7, fuseFull: 0.55,                          // lodged arrow → burst (s)
    burstRadius: [1.35, 1.8], burstInner: 0.6,              // [ring, full] (m); full damage inside burstInner
    burstDamage: [30, 45], burstEdge: [12, 15],
    paintTap: 0.55, paintStick: 0.42, burstPaint: [1.2, 1.55], trailEvery: 2.4, trailRadius: 0.32,
    cooldown: 0.22, moveSpeedDrawing: 2.6, moveSpeedFiring: 4.2,
    special: 'strike', specialCost: 190, sub: 'waddle',
  },
  blade: {
    id: 'blade', name: 'Brine Cutlass', kind: 'blade', class: 'Cutlass', anim: 'blade',
    blurb: 'Tap for quick slashes that fling a crescent of ink. Hold to charge an overhead cut that sends a long ink wave. The blade itself hits hard: a charged cut splats in one hit.',
    stats: { range: 0.35, damage: 0.85, rate: 0.75, mobility: 0.85, paint: 0.55 },
    // (kits/blade.js; pose family HOLD.blade in character.js) range = the quick cut's droplet reach (aim assist, bots)
    range: 6.5, projSpeed: 17,
    // quick cut: alternating horizontal slashes, a crescent of droplets (one hit per victim per cut) + the blade itself
    tapInterval: 0.27, tapInk: 3.2, tapDrops: 7, tapSpreadDeg: 66, tapSpeed: 17.5, tapStraight: 0.07,
    tapDamageNear: 40, tapDamageFar: 20, tapDropRadius: 0.64, tapMelee: 35,
    // charged cut: hold past the swing to charge; release at full → overhead cut + lunge + a straight ink wave
    chargeDelay: 0.14, chargeTime: 0.62, chargeStore: 1.0, heavyInk: 9, heavyInterval: 0.46,
    heavyMelee: 130, lungeDist: 1.05, lungeTime: 0.13, strokeRadius: 0.6,
    waveDamage: 70, waveDamageFar: 50, waveSpeed: 26, waveRange: 12, waveWidth: 0.7, waveHeight: 1.7,
    wavePaintEvery: 0.7, wavePaintRadius: 0.62, waveEndRadius: 1.05,
    // the blade's own hitbox: an arc in front of the kid, `reach` m (plus the victim's body radius)
    reach: 1.5, meleeArcDeg: 150, heavyArcDeg: 110,
    moveSpeedFiring: 5.6, moveSpeedCharging: 4.4,
    special: 'zipcaster', specialCost: 180, sub: 'shaker',
  },
  mitts: {
    id: 'mitts', name: 'Sponge Mitts', kind: 'mitts', class: 'Mitts', anim: 'shooter',
    blurb: 'Punch out ink fists that burst a few metres ahead — with your gloves up, the sponge soaks part of any hit from the front. Hold fire and press jump to charge a long leap that splashes where you land, and sticks you to walls (holding on drains ink).',
    stats: { range: 0.3, damage: 0.75, rate: 0.9, mobility: 0.9, paint: 0.5 },
    range: 5.3,              // reach for bots / aim assist: the fist's flight + its burst
    // punches: alternating gloves; each throws an ink fist that flies fistRange and bursts (or bursts on what it hits)
    punchInterval: 0.12, inkPerPunch: 1.6, punchSpread: 2.5,   // three fists splat: ≈ 0.24 s + the flight
    fistSpeed: 28, fistRange: 4.6, fistSize: 0.2,
    // sponge guard: while punching (and a beat after), a hit from within guardArc° of where you face takes × guardArmor
    guardArmor: 0.5, guardArc: 70, guardAfter: 0.25,
    botApproach: 1,          // bots: swim / weave / punch their way in (kits/mitts.js botTactics); 0 = the plain melee walk (A/B tests)
    punchDamage: 38,         // direct: three fists splat
    splashRadius: 1.4, splashMax: 22, splashMin: 10, fistPaint: 0.95,
    moveSpeedFiring: 5.4,
    // charged leap: hold fire, press jump (hold to charge, release to leap along the aim; aim higher = higher arc)
    leapChargeTime: 0.45, leapInkMin: 9, leapInkMax: 15, moveSpeedCharging: 1.1,
    leapArmor: 0.35, leapArmorGrace: 0.15,  // damage taken × leapArmor while in the air on a leap (and for leapArmorGrace s after landing)
    leapSpeedMin: 10.9, leapSpeedMax: 18.6,   // launch speed at 0 / full charge (≈ 4.5 m / 13 m on flat ground)
    leapAngle: 40, leapAngleMin: 18, leapAngleMax: 60, leapPitchK: 0.55, leapVyMax: 13,
    landRadius: 2.8, landDamageMax: 100, landDamageMin: 35, landPaint: 2.5,   // a dead-centre landing splats
    landInvuln: 0.5,         // s untouchable after a leap lands (ground or wall): the spawn-protection flicker shows it
    gloveRadius: 1.1, gloveDamage: 40,   // the gloves themselves: anyone the kid lands on (within gloveRadius + their body) takes this on top of the splash
    // wall cling (a leap into a wall sticks there): drains ink; jump or an empty tank lets go
    clingDrain: 8,
    special: 'slam', specialCost: 180, sub: 'boomerang',
  },
  // ---- upstream's arsenal (retired from the roster — see WEAPON_ORDER; dualies ≈ twins, slosher ≈ bucket, splatling ≈ spinner)
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
// the roster (upstream's dualies / splatling / slosher were A/B-tested against ours and retired: twins, spinner and
// bucket kept, wearing upstream's reticles + spin-up feedback — the defs above stay for old saves and the HUD kinds)
export const WEAPON_ORDER = ['shooter', 'twins', 'brolly', 'blaster', 'spinner', 'charger', 'bow', 'roller', 'brush', 'blade', 'mitts', 'bucket'];
// retired weapon → the one that replaced it (saved loadouts, links)
export const WEAPON_SUCCESSOR = { dualies: 'twins', splatling: 'spinner', slosher: 'bucket' };
// effective reach (m) for aim assist, the in-range reticle and bots
export function weaponRange(w) {
  switch (w.kind) {
    case 'charger': case 'spinner': return w.rangeMax;
    case 'roller': return 6;
    case 'brush': return 5;
    case 'bucket': return w.reach;
    default: return w.range || 12;
  }
}

// Sub weapons. Each weapon has a default (`sub` on the weapon); the loadout can swap it for any of these.
export const SUBS = {
  bomb: {
    id: 'bomb', name: 'Splat Bomb', kind: 'bomb', blurb: 'Bounces, arms when it lands, then bursts. Splats anyone close.',
    inkCost: 70, throwSpeed: 13.5, fuse: 0.95, radius: 3.1, damageMax: 180, damageMin: 35, paintRadius: 2.7,
  },
  sticky: {
    id: 'sticky', name: 'Cling Charge', kind: 'sticky', blurb: 'Sticks to whatever it hits (floors, walls, ceilings) and blows after a moment with a wide blast.',
    inkCost: 70, throwSpeed: 13.5, fuse: 2.4, radius: 4.0, damageMax: 180, damageMin: 35, paintRadius: 3.3,
  },
  burst: {
    id: 'burst', name: 'Pop Pellet', kind: 'burst', blurb: 'Pops on impact. Cheap enough to throw twice: two direct hits or three near misses splat.',
    inkCost: 40, throwSpeed: 16, radius: 2.1, directDamage: 60, splashDamage: 35, paintRadius: 1.8,
  },
  seeker: {
    id: 'seeker', name: 'Skitter Bomb', kind: 'seeker', blurb: 'Scuttles after the nearest foe, laying a swimmable ink trail, and bursts a moment after it reaches them. It turns wide: sidestep it late.',
    // turnRate: rad/s (1.75 ≈ 100°/s: a ~3.6 m turning circle at full speed; was 5); commitDist: dashes straight (no
    // steering) once this close and lined up; creep: how much it slows turning onto a slow / standing target.
    // speed 6.3 (was 7): only just faster than a run (6), so a foe who sidesteps and keeps running gets away instead
    // of being run down from behind; one who stands, walks or shoots while strafing is still caught
    // delay: on reaching its foe (or running out) it stops and winds up for this long — swelling, blinking, its own
    // alarm — before it bursts, so a foe who reacts can still get out of the blast (2026-10-01: "a short delay explosion
    // for skitter / waddle / mine bombs"; the same windup on all three)
    inkCost: 65, throwSpeed: 9, speed: 6.3, seekRange: 15, life: 4.5, trailRadius: 0.6, triggerDist: 1.2, turnRate: 1.75, commitDist: 2.5, creep: 0.6,
    delay: 0.45, radius: 2.8, damageMax: 180, damageMin: 35, paintRadius: 2.4,
  },
  scan: {
    id: 'scan', name: 'Echo Orb', kind: 'scan', blurb: 'Bursts into a sensing cloud. Foes it touches are tracked for your whole team. No damage.',
    inkCost: 55, throwSpeed: 14, fuse: 1.1, radius: 4.2, cloudTime: 0.9, trackTime: 8,
  },
  curtain: {
    id: 'curtain', name: 'Drip Curtain', kind: 'curtain', blurb: 'Drops a wall of falling ink that stops enemy players and shots. It fades over time, faster when shot: the meter on top shows what\'s left.',
    // (its ink — hp — shows on a meter along its top, both sides, for everyone: src/game/subs.js _curtainMeter)
    inkCost: 55, throwSpeed: 9, width: 3.4, height: 2.7, hp: 170, decay: 19, shotMul: 0.5,
  },
  sprinkler: {
    id: 'sprinkler', name: 'Twirl Sprinkler', kind: 'sprinkler', blurb: 'Sticks to any surface and sprays ink around it in pulses, until it is shot or you get splatted.',
    // sprayRadius: the outer edge of its ink (m). 2026-10-01 ("make the sprinkler work further away"): 3.2 → 5.5 — each
    // drop's launch speed is solved for a landing distance picked evenly over the disc's AREA (0.5 m … sprayRadius − 0.75,
    // the drop's own splat reaching the rest), so the far ring gets as much ink per m² as the middle instead of
    // thinning out; drops 6 → 7 a pulse (+17 % ink a second for ~3× the area); dropDamage unchanged
    inkCost: 60, throwSpeed: 12, hp: 70, pulse: 0.3, drops: 7, sprayRadius: 5.5, sprayFade: 12, dropDamage: 8,
  },
  mine: {
    id: 'mine', name: 'Lurk Mine', kind: 'mine', blurb: 'Planted at your feet, invisible to the other team. Foes who come close set it off: it pops up and blows a moment later, hitting and tracking them. Two at a time.',
    // 2026-10-01: invisible to the enemy at all times (no mesh, shadow or map mark), a translucent ghost to its own team;
    // tripped, it pops up for everyone and blows `delay` s later (0.35 → 0.45: the same windup as the Skitter / Waddle)
    inkCost: 55, placed: true, max: 2, triggerRadius: 2.1, armTime: 0.9, delay: 0.45, radius: 2.6, damage: 45, trackTime: 8, paintRadius: 2.0,
  },
  beacon: {
    id: 'beacon', name: 'Hop Beacon', kind: 'beacon', blurb: 'A super-jump point for your team. Place up to three; each takes two jumps (its lights show what\'s left).',
    // sonar: a ring pulse every `sonar` s from it (ground + air; its team's to see — the other team's faint); the jumps
    // left show as lights over it (and on the jump map's pins)
    inkCost: 70, placed: true, max: 3, uses: 2, hp: 50, sonar: 1.75,
  },
  mist: {
    id: 'mist', name: 'Murk Bomb', kind: 'mist', blurb: 'Releases a poison mist that slows foes and drains their ink. A direct hit keeps them poisoned until the mist fades.',
    inkCost: 60, throwSpeed: 13.5, fuse: 1.0, radius: 3.3, mistTime: 4.5, slow: 0.55, inkDrain: 12,
  },
  // ---- kit subs: each kind lives in src/game/kits/<kind>.js
  shaker: {
    id: 'shaker', name: 'Shaker Bomb', kind: 'shaker', blurb: 'Hold to shake it up (mash jump, keep moving): up to three blasts that hop it forward.',
    inkCost: 60, throwSpeed: 13,
    // charge (0..1; 2 blasts at ½, 3 at full): plain holding fills it in chargeTime; running adds up to moveBoost × that
    // rate; each jump press adds jumpBoost, each stick / mouse waggle shakeBoost; never faster than maxRate per second
    chargeTime: 2.7, moveBoost: 0.9, jumpBoost: 0.075, shakeBoost: 0.05, maxRate: 1.6,
    fuse: 0.5, gap: 0.42, hopSpeed: 4.2, hopUp: 4.6,          // first landing → first blast, blast → blast, each blast's hop
    radius: 2.3, damageMax: 110, damageMin: 30, paintRadius: 2.0, // per blast: a smaller Splat Bomb
    trailEvery: 0.38, trailRadius: 0.3,                       // thin ink trail sprayed while it travels
  },
  waddle: {
    id: 'waddle', name: 'Waddle Bomb', kind: 'waddle', blurb: 'Waddles after foes it senses near where it lands, noisily, and bursts a moment after it reaches one. Blows up where it lands if nobody is near.',
    inkCost: 65, throwSpeed: 12,
    senseRadius: 7.5, senseUp: 4, fuse: 1.1,                  // sensing circle on landing; nobody inside → blows after fuse
    speed: 4.0, turnRate: 8, life: 9, maxTravel: 26, triggerDist: 1.2,   // tracks its foe (nav paths, hops up steps)
    delay: 0.45,                                              // reached its foe (or gave up): stops and winds up this long
    radius: 3.0, damageMax: 180, damageMin: 35, paintRadius: 2.6, hp: 30,  // Splat Bomb blast; shoot-able (30 hp)
  },
  torpedo: {
    id: 'torpedo', name: 'Tide Torpedo', kind: 'torpedo', blurb: 'Locks onto a foe in mid-air, then darts at them and bursts into droplets. One out at a time.',
    inkCost: 65, throwSpeed: 13.5, feetPaint: 1.25,
    // flight → lock (a foe within lockRange, in sight, after armTime) → unfold (hovers) → launch (swims at them, homing)
    armTime: 0.12, lockRange: 6.5, flyLife: 2.5, unfoldTime: 0.5, launchSpeed0: 2.2, launchSpeed: 9.5, launchAccel: 8, turnRate: 1.9, launchLife: 2.8,
    hp: 20,                                                        // shot down by 20 damage (any form)
    radius: 2.4, coreRadius: 1.2, damageMax: 60, damageMin: 35,     // the burst (both forms): 60 up close, 35 at the rim
    paintRadius: 3.6, fallbackPaint: 1.5,                           // locked burst paints a bit more than a Cling Charge (3.3)
    drops: 10, dropDamage: 12, dropHits: 3, dropPaint: 0.65,        // locked burst only: 60 + 3 × 12 = 96 max
  },
  tracer: {
    id: 'tracer', name: 'Tracer Bolt', kind: 'tracer', blurb: 'A fast bolt fired a little low that skims and ricochets, puddling ink on every bounce. Hits and its trail mark foes for your team.',
    inkCost: 40, speed: 40, range: 32, pitchDown: 9, floorExit: 0.3, maxBounces: 12, size: 0.16,
    puddleRadius: 1.35, directDamage: 35, directMark: 9, trailLife: 1.0, trailRadius: 0.42, trailDamage: 22, trailMark: 3,
  },
  boomerang: {
    id: 'boomerang', name: 'Whirl Boomerang', kind: 'boomerang', blurb: 'Spins out, hovers and shreds, whirls back round you, then bursts. Hit a foe and it bursts on them like a Splat Bomb. One out at a time.',
    inkCost: 60, throwSpeed: 16,           // throwSpeed: only the bots' lob maths read it (the throw itself is flat)
    range: 9, outTime: 0.6,                // flat along the aim, easing to a stop ~9 m out (stops early at a wall)
    hover: 1.75, hoverRadius: 1.35, tickRate: 8, tickDamage: 9, hoverPaint: 1.0,   // shreds ≈ 72 dmg/s around it
    returnSpeed: 17, orbit: 2.5, orbitRadius: 1.5, orbitSpin: 7, orbitDamage: 6, orbitHitCd: 0.3,
    radius: 2.4, damageMax: 100, damageMin: 30, paintRadius: 2.2,                 // the burst beside you at the end
    contact: 0.3, hitFuse: 0.6, hitRadius: 3.1, hitDamageMax: 180, hitDamageMin: 35, hitPaintRadius: 2.7,   // hit a foe in flight: Splat Bomb
  },
};
export const SUB_ORDER = ['bomb', 'sticky', 'burst', 'shaker', 'seeker', 'waddle', 'torpedo', 'tracer', 'boomerang', 'scan', 'curtain', 'sprinkler', 'mine', 'beacon', 'mist'];
export const SUB = SUBS; // older code reads SUB.bomb
// ---- [sub-view] Sub weapons' world models: how many times bigger than before each one is drawn in the world — what
// flies, lands, sticks, rolls, walks, hovers or stands there (the Bomb Barrage's Splat Bombs too). VISUAL ONLY: every
// blast / trigger / sense / spray radius, collider, physics radius, damage, speed and timing is in SUBS above and doesn't
// read this; where gameplay used to read a model's size (a sprinkler's / beacon's shot hitbox) it keeps the old number
// (src/game/subs.js hitH). The prop held in the hand while aiming and the HUD icons stay the built size. Read when an
// object is made, so a change here shows on the next throw. Tuned by eye (visibility pass 2026-09-30), then capped at
// 2x after play (the user: "make the subs 2x not 3x, theyre too big"). The check: tools/botlab/tests/sub-scale.js.
export const SUB_VIEW_SCALE = {
  bomb: 2, sticky: 2, burst: 2, seeker: 2, scan: 2, curtain: 1.5, sprinkler: 2, mine: 2, beacon: 2, mist: 2,
  shaker: 2, waddle: 2, torpedo: 2, tracer: 2, boomerang: 1.5,
};
export const subViewScale = (kind) => SUB_VIEW_SCALE[kind] ?? 1;

// Specials. Every special refills your ink tank when it starts. `duration` = how long a timed special lasts (s).
export const SPECIALS = {
  slam: { id: 'slam', name: 'Tidal Slam', blurb: 'Leap up and slam down in a huge ink shockwave.', rise: 0.55, hang: 0.25, radius: 5.2, killRadius: 3.2, damageMax: 180, damageMin: 55 },
  storm: { id: 'storm', name: 'Ink Tempest', blurb: 'Hurl a rain cloud that soaks the turf below.', duration: 6.5, radius: 3.4, dps: 34, throwSpeed: 16, driftSpeed: 1.1 },
  // Bomb Barrages: throw one kind of bomb as fast as you like (no ink) while the main weapon still works. Each variant
  // is its own special (kind 'barrage'); `gap` = the shortest time between throws.
  barrage: { id: 'barrage', kind: 'barrage', bomb: 'bomb', name: 'Splat Bomb Barrage', blurb: 'Throw Splat Bombs as fast as you like for a few seconds — no ink needed. Your main weapon still works.', duration: 6.5, gap: 0.3 },
  barrage_sticky: { id: 'barrage_sticky', kind: 'barrage', bomb: 'sticky', name: 'Cling Charge Barrage', blurb: 'Stick Cling Charges to every wall in sight — no ink needed. Your main weapon still works.', duration: 6.5, gap: 0.4 },
  barrage_burst: { id: 'barrage_burst', kind: 'barrage', bomb: 'burst', name: 'Pop Pellet Barrage', blurb: 'Pelt foes with rapid-fire Pop Pellets — no ink needed. Your main weapon still works.', duration: 6.5, gap: 0.2 },
  barrage_seeker: { id: 'barrage_seeker', kind: 'barrage', bomb: 'seeker', name: 'Skitter Bomb Barrage', blurb: 'Send a pack of Skitter Bombs chasing foes, each inking a trail — no ink needed. Your main weapon still works.', duration: 6.5, gap: 0.5 },
  barrage_mist: { id: 'barrage_mist', kind: 'barrage', bomb: 'mist', name: 'Murk Bomb Barrage', blurb: 'Smother an area in Murk Bomb mist — no ink needed. Your main weapon still works.', duration: 6.5, gap: 0.45 },
  // force field: hits become knockback (reduced); touching teammates shares it
  bubbler: { id: 'bubbler', name: 'Bubble Guard', blurb: 'A force field that turns every hit into a shove instead of damage. Touch teammates to share it.',
    duration: 6.5, radius: 1.3, knockPerDamage: 0.045, knockMax: 6.5, shareRange: 1.5 },
  // reveals every enemy to your team (screen + map); they are slowed and burn ink faster
  sonar: { id: 'sonar', name: 'Deep Sonar', blurb: 'Reveals every enemy to your team on screen and on the map. Revealed foes move slower and burn through ink faster.',
    duration: 8, slow: 0.8, inkMul: 1.4, cast: 0.6 },
  // pick a spot on the map; a missile lands there as a swirling ink vortex
  strike: { id: 'strike', name: 'Vortex Strike', blurb: 'Pick a spot on the map and launch a missile. It lands as a huge swirling vortex of ink.',
    aimTime: 7, flight: 2.2, radius: 5.5, duration: 4.5, dps: 62, pull: 1.6 },
  // bazooka: tall narrow twisters in quick succession, long range, one-shot splats
  zooka: { id: 'zooka', name: 'Twister Zooka', blurb: 'A bazooka that fires tall twisters of ink in quick succession — splats foes at long range.',
    duration: 6, interval: 1.0, speed: 34, range: 44, damage: 180, height: 2.8, radius: 0.55, paintEvery: 0.7, paintRadius: 0.95 },
  // speaker: after a short charge, a sound wave in the aimed direction through walls; splats anything in it
  wail: { id: 'wail', name: 'Howl Box', blurb: 'Hold up a huge speaker, aim it and click: it blasts a sound wave that goes through walls and splats anything in its path.',
    charge: 1.3, blast: 3.2, radius: 1.5, range: 72, dps: 260, holdTime: 6, holdSpeed: 3.2 },
  // invincible kraken: fast through any ink, splats with a jump attack
  kraken: { id: 'kraken', name: 'Kraken', blurb: 'Turn into an invincible kraken. Race through any ink (even the enemy\'s) and splat foes with a jump attack.',
    duration: 7, speed: 7.2, hopVel: 10.5, attackVel: 8.5, attackFwd: 6.5, radius: 2.3, damage: 200, knockPerDamage: 0.02, cooldown: 0.65, paintRadius: 1.15 },
  // up to three giant bubbles: they wall off an area and burst into a deadly blast when your team shoots them
  blower: { id: 'blower', name: 'Bubble Blower', blurb: 'Blow up to three giant bubbles that wall off an area. Shoot them (you or your team) to set off a huge ink blast.',
    duration: 9, max: 3, inflate: 1.0, rMin: 0.9, rMax: 2.1, drift: 1.4, life: 9, popDamage: 55, blastMul: 1.9, damageMax: 180, damageMin: 45 },
  // jetpack: hover and fire blaster-like shots; super jump back to the take-off point when it runs out
  jetpack: { id: 'jetpack', name: 'Ink Jet', blurb: 'Hover over the stage firing powerful blasts — jump for a boost. When it runs out you super jump back to where you took off (marked for everyone to see).',
    duration: 7, height: 3.8, speed: 5.5, accel: 11, boost: 9, boostGap: 0.9, interval: 0.55, projSpeed: 30, range: 34, directDamage: 125, splashMax: 70, splashMin: 30, splashRadius: 2.4, paintRadius: 1.5 },
  // giant stamp: slam repeatedly while advancing, jump attack, or throw it (ends the special)
  stamp: { id: 'stamp', name: 'Mega Stamp', blurb: 'Charge forward smashing with a giant stamp: each swing deflects attacks from the front and smashes bombs before they go off, but it turns slowly and is open from the sides and back. Swing mid-air for a flip that reaches further and hits behind you too. Throw it (sub) as a long-range blast — that ends the special.',
    duration: 7.5, interval: 0.42, reach: 1.6, radius: 1.55, damage: 200, lunge: 2.6, moveSpeed: 7.2, throwSpeed: 25, throwRadius: 3.2, throwDamageMax: 200, throwDamageMin: 60,
    // the body turns slowly while charging (quicker once stopped); sideways steps are short — charge, stop, turn, charge
    turnRate: 1.7, turnRateStill: 6.0, strafe: 0.35,
    // each swing guards the front: attacks from within deflectArc° of the facing do nothing, shots are knocked away and
    // bombs (thrown or planted) within bombClearR in front are smashed before they go off
    guardTime: 0.45, deflectArc: 70, deflectR: 2.6, bombClearR: 3.2,
    // swing in the air: one flip — hits behind you as the stamp goes over, then a longer-reaching smash in front
    flipTime: 0.5, flipReach: 2.7, flipRadius: 1.9, flipBackReach: 1.2, flipBackRadius: 1.6 },
  // a ball of ink held overhead charges over time (faster with "Yeah!" cheers); throw it once full for a huge blast
  booyah: { id: 'booyah', name: 'Cheer Orb', blurb: 'Hold up a ball of ink that charges over time, then throw it for a huge blast. Teammates\' "Yeah!" cheers (C) charge it faster and top up their own special.',
    charge: 4.5, cheer: 0.12, cheerSpecial: 12, autoThrow: 2.5, moveSpeed: 1.8, throwSpeed: 19.6, fuse: 1.5, radius: 8.4, killRadius: 4.6, damageMax: 220, damageMin: 60 },
  // grapple: the sub button fires a tether to latch onto surfaces and zip over; super jump back when it ends
  zipcaster: { id: 'zipcaster', name: 'Zipline', blurb: 'Cloaked in a mysterious aura, your sub becomes a grapple: latch onto walls from afar and zip over, main weapon in hand. You super jump back when it ends (marked for everyone to see).',
    duration: 8.5, range: 21, speed: 22, hang: 1.4, cooldown: 0.35,
    // body impact at the end of every zip (or on an enemy met mid-zip): a mini explosion
    impactDirect: 100, impactSplash: 30, impactDirectR: 1.0, impactRadius: 2.4 },
  // ride a crab tank: gatling (main), mortar (sub), roll into an armoured ball (swim); the tank has HP, the rider is
  // exposed from above and behind
  crab: { id: 'crab', name: 'Crab Rig', blurb: 'Ride a crab tank: gatling on fire, mortar on sub, roll into an armoured ball with swim. The tank can be shot down, and you\'re exposed from above and behind.',
    duration: 9, hp: 460, speed: 3.0, rollSpeed: 9.5, turnRate: 1.5, gunInterval: 0.075, gunDamage: 18, gunSpeed: 36, gunRange: 22, gunSpread: 3.5,
    cannonGap: 1.15, cannonSpeed: 17, cannonRadius: 3.0, cannonDamageMax: 150, cannonDamageMin: 40, rollArmor: 0.35 },
};
export const SPECIAL_ORDER = ['slam', 'storm', 'barrage', 'barrage_sticky', 'barrage_burst', 'barrage_seeker', 'barrage_mist', 'bubbler', 'sonar', 'strike', 'zooka', 'wail', 'kraken', 'blower', 'jetpack', 'stamp', 'booyah', 'zipcaster', 'crab'];

// ---- Match ----
export const MATCH = {
  durations: [90, 180],     // seconds
  defaultDuration: 180,
  maxDuration: 180,          // hard cap (3 min): the final-minute song expects rounds of at most this length
  finalCountdown: 10,
  teamSize: 4,
  pointsPerM2: 1.0,          // turf points per square metre newly inked
  // death markers: a squid-skull in the victim's ink where anyone was splatted (world view, minimap, TAB map)
  deathMarkLife: 5,          // seconds on screen
  deathMarkFade: 1.3,        // … the last of which fade out
};

// ---- Zone Control (src/game/zones.js): the rules' numbers
export const ZONES = {
  duration: 300,              // 5 minutes (+ overtime)
  count: 100,                 // each team's countdown
  rotateMin: 30, rotateMax: 60,   // the operational objective swaps between the centre and a side zone this often (s)
  finalCentre: 30,            // from this many seconds left (and all through overtime) only the centre is live
  warn: 0.30,                 // the other team's share of a held zone that sounds the "about to flip" warning
  control: 0.80, contest: 0.40,   // ink share to take a zone / to neutralise the other team's
  rateCenter: 1,              // points / s holding the centre
  rateHome: 0.5,              // … holding the side zone on your own half (closer to your spawn)
  rateAway: 2,                // … holding the side zone on the other team's half
  penaltyK: 0.75,             // penalty = ROUND(0.75 × (start − end)) (+1 if start was 100)
  gaugeHeld: 4.5,             // special points / s for the team NOT holding the objective
  gaugeNeutral: 1.5,          // … for the team behind while nobody holds it
  overtimeGrace: 10,          // s off the objective before overtime ends against the team behind
  overtimeMax: 300,           // overtime cap (s)
  sampleHz: 5,                // coverage checks per second
};

// Tower Command (src/game/tower.js): a tower on a mirrored path through the stage — ride it into enemy territory
export const TOWER = {
  duration: 300,              // 5 minutes (+ overtime)
  count: 100,                 // the score a team counts down from (100 at the centre, 0 at the enemy goal)
  // the 100 points: riding it the whole track to the enemy goal is trackPoints, clearing the checkpoints on the way the
  // rest (split evenly between them). pointRate = points / s with one rider — it sets the tower's speed on each stage
  // (track length ÷ (trackPoints / pointRate) m/s) and each checkpoint's time ((checkpointPoints / n) / pointRate s)
  pointRate: 1,
  trackPoints: 60,
  checkpointPoints: 40,
  // a stage with two checkpoints (the user, 2026-09-30): 10 s each, the track (twice as long as it was, detour loops)
  // worth the other 80 — the tower runs 1.5× as fast and still takes 100 s from the centre to the goal with one rider
  twoCheckpoints: { trackPoints: 80, checkpointPoints: 20 },
  mult: [0, 1, 1.2, 1.33, 1.43],   // speed (and checkpoint clearing) × by riders of the pushing team: 1 / 2 / 3 / 4
  returnK: 0.6,               // a neutral tower rolls back toward the centre at this × the one-rider speed
  idleNeutral: 5,             // s with nobody on it before the team in control loses it (it goes neutral, then back)
  checkpoints: [0.42, 0.72],  // where a stage without its own sits them: fractions of each side's path to the goal
  checkpointGrace: 5,         // s a half-cleared checkpoint waits for its team to bring the tower back before it refills
  gaugeHeld: 4.5,             // special points / s for every player on the team in control (riding or not)
  gaugeNeutral: 2.25,         // … for the team behind while the tower is neutral
  overtimeMax: 300,           // overtime cap (s) — the team ahead wins
  platformR: 1.25,            // m: the platform's half-width (a square collider; the mesh is round)
  platformH: 1.6,             // m: its top above the path — higher than a jump (1.41 m): ink its walls and swim up
  riderUp: 1.3,               // m above the top that still counts as riding (a hop on it)
  pillarW: 0.44, pillarH: 1.8, // m: the thin pillar in the platform's middle — cover for its riders (never inked; slide off its top)
  pillarCap: 0.24,            // m: the pyramid cap on it
  snapHz: 10,                 // online: host snapshots a second
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
  { id: 'tidewater', name: 'Tidewater Plaza', blurb: 'A Victorian seaside square: fight round the Jubilee clock tower, under the colonnade and along the promenade.', theme: 'day', times: { day: 'day', dusk: 'sunset' } },
  { id: 'kelpline', name: 'Kelpline Terminal', blurb: 'A container terminal at shift change: a gantry crane straddles the pier between two moored ships. Mind the water.', theme: 'day', times: { day: 'day', dusk: 'sunset' } },
  { id: 'halyard', name: 'Halyard Marina', blurb: 'Floating docks, a tug on blocks and a car ferry moored across the middle. Mind the water.', theme: 'golden', times: { day: 'golden', dusk: 'sunset' } },
  { id: 'saltpan', name: 'Saltpan Basin', blurb: 'An open salt works: sunken pans and boardwalks round a wind pump, with the shed roof and salt heap as high ground.', theme: 'day', times: { day: 'day', dusk: 'sunset' } },
  { id: 'crossmarket', name: 'Crossroads Market', blurb: 'Narrow shop streets and an iron gallery close in on the glass Market Hall, where the No. 3 tram waits under the clock.', theme: 'golden', times: { day: 'golden', dusk: 'sunset' } },
  { id: 'lockgate', name: 'Lockgate Canals', blurb: 'Drained locks through a brick warehouse district: the canal splits the map, so hold the bridge and the gates.', theme: 'day', times: { day: 'day', dusk: 'sunset' } },
  { id: 'terraces', name: 'Terrace Heights', blurb: 'A whitewashed hill village: hold the terraces, fight for the stairs and drop in on the Piazzetta.', theme: 'golden', times: { day: 'golden', dusk: 'sunset' } },
  // new regions (2026-09-28): places in the Splatoon world no game has visited — built for Turf War, Zone Control and Tower Command
  { id: 'nantai', name: 'Mount Nantai', blurb: 'The observatory grounds on Mount Nantai: cross the brook by bridge, weir or log and take the lawn from Grizzco\'s star party.', theme: 'day', times: { day: 'day', dusk: 'sunset' } },
  { id: 'craters', name: 'Turf War Craters', blurb: 'Chalk downs above The Cape, scarred by the Great Turf War: fight down into the Great Crater and along the old trench lines.', theme: 'day', times: { day: 'day', dusk: 'sunset' } },
  { id: 'calamari', name: 'Calamari County', blurb: 'Callie and Marie\'s snowy home village: fight over the little station, up its footbridges and down the lanes to the harbour.', theme: 'day', times: { day: 'day', dusk: 'sunset' } },
  { id: 'spirhalite', name: 'Spirhalite Islands', blurb: 'An S-shaped chain of islets risen from the sea: hold the sandbar under the Great Arch, cross the lagoons or loop round by the causeway.', theme: 'golden', times: { day: 'golden', dusk: 'sunset' } },
  { id: 'treehills', name: 'Eco-Forest Treehills', blurb: 'Alterna\'s tiered forest biome under a simulated sky: grow your team\'s hedges from the sprout pods and hold the meadow plaza.', theme: 'day', times: { day: 'day', dusk: 'sunset' } },
  // (src/world/stages/cargo, ported from PR #8's rebuilt Kelpline) — online only, humans only, never a Boss Battle
  { id: 'cargo', name: 'Cargo Terminal', blurb: 'A container terminal at shift change: a gantry crane straddles the pier between two moored box ships.', theme: 'day', times: { day: 'day', dusk: 'sunset' }, onlineOnly: true, noBots: true, noBoss: true },
];
// Stage rules (a MAPS entry's flags), enforced by the lobby host (net/session.js, net/mock.js), the menus and main.js:
//   onlineOnly  only in the online lobby's stage picker — never the offline Play flow (Turf War or Boss Battle)
//   noBots      humans only: "fill with bots" is forced off, a match needs 2+ players with one on each side, and a player
//               who leaves mid-match is removed instead of handed to a bot; the menu backdrop runs without bots too
//   noBoss      never a Boss Battle stage (a boss room switches away from it)
export const mapById = (id) => MAPS.find((m) => m.id === id) || null;
export const mapNoBots = (id) => !!mapById(id)?.noBots;
export const mapBossOk = (id) => !!mapById(id) && !mapById(id).noBoss;
export const mapOfflineOk = (id) => !!mapById(id) && !mapById(id).onlineOnly;
export const OFFLINE_MAPS = MAPS.filter((m) => !m.onlineOnly);
// a boss-eligible stage to fall back to (the preferred one if it qualifies)
export const bossFallbackMap = (prefer) => (mapBossOk(prefer) ? prefer : (MAPS.find((m) => !m.noBoss && !m.onlineOnly) || MAPS[0]).id);
// Why a humans-only room can't start yet (null when it can, or when the stage allows bots): lobby = { map, players }
export function noBotsStartBlock(lobby) {
  if (!lobby || !mapNoBots(lobby.map)) return null;
  const ps = lobby.players || [];
  if (ps.length < 2) return 'Needs 2+ players — no bots on this stage';
  if (!ps.some((p) => p.team === 0) || !ps.some((p) => p.team === 1)) return 'Needs a player on each team';
  return null;
}

export const BOT_NAMES = [
  'Squiddo', 'Blotch', 'Marlo', 'Inky Vee', 'Pip', 'Coral', 'Riptide', 'Nori', 'Suki', 'Zest',
  'Kelp', 'Drip', 'Tako', 'Sprinkle', 'Bubbles', 'Moxie', 'Juno', 'Wasabi', 'Fizz', 'Loop',
];

// ---- Progression ----
export const PROGRESSION = {
  xpForLevel: (lvl) => 800 + lvl * 350,
  xpWin: 1200, xpLose: 500, xpPerTurfPoint: 1.0, xpPerSplat: 40,
  // Zone Control (5 min, so more turf gets inked than in a 3 min Turf War): turf counts for less, ink laid on the live
  // zone counts extra, and a knockout win pays a flat bonus — a typical match lands close to a Turf War's XP
  zones: { turfScale: 0.6, xpPerZoneTurfPoint: 1.0, xpKnockout: 300 },
  tower: { turfScale: 0.6, xpPerRideSecond: 6, xpKnockout: 300 },   // Tower Command: per second riding the tower
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
  fpsCap: 0,                // frame rate limit: 0 = match the display (120 on ProMotion Macs), else 60 / 30
  master: 0.8, music: 0.6, sfx: 0.85,
  cues: 1,                  // sfx-loud: the sub / special cue volume 0..1.5 (1 = the default cue mix; under Sound effects)
  colorblind: false,
  minimap: true,
  matchLength: 180,
  lastMode: 'turf',         // battle mode last picked on the stage select: 'turf' | 'zones' | 'tower' | 'boss'
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
