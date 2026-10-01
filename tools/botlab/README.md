# Botlab — headless bot matches and page tests

Runs the real game (Electron, `electron/main.cjs`) offscreen and muted, in isolated profiles, to measure and tune the
bots without touching a normal install. Needs `npm install` (Electron) and macOS / Linux with a GPU.

```bash
# a stepped all-bot match (sim time: machine load doesn't change the numbers)
MAP=halyard MODE=turf SECS=180 tools/botlab/run.sh tools/botlab/match.cjs
MAP=lockgate MODE=zones tools/botlab/run.sh tools/botlab/match.cjs          # full 5:00 Zone Control
WEAPONS='team0=blade;team1=shooter' SUBS='all=waddle' MAP=crossmarket MODE=turf tools/botlab/run.sh tools/botlab/match.cjs

# an in-page test (your script returns [{ name, ok, info }])
MAP=testbox PAGE=path/to/test-page.js tools/botlab/run.sh tools/botlab/page.cjs
```

- **Parallel runs:** start several at once (`… & … & wait`). `run.sh` keeps at most `SLOTS` (default 8) Electron
  instances alive and queues the rest.
- **match.cjs env:**
  - `MAP` (stage id), `MODE` (`turf` / `zones`), `SECS` (turf length)
  - `WEAPONS` / `SUBS`: `all=<id>`, `team0=<id>;team1=<id>`, or a comma list per slot (team 0 first)
  - `OUT` (write the result JSON), `WATCHDOG` (ms)
  - `TRACK=<weapon>` (+ `TRACK_TEAM=0|1`): a closer look at the players on that weapon — damage dealt / taken and from
    how far, what they were doing when splatted, deaths without touching the killer, nearest-enemy distance; the Sponge
    Mitts add fist / splash / leap damage and leap outcomes (`RESULT_JSON.track`)
  - `TUNE='mitts.punchInterval=0.12,mitts.fistRange=4.6'`: what-if tuning for this run only (patched into the live
    `WEAPONS` / `SUBS` config; nothing in the repo changes)
  - keep `SLOTS` at 4 or less for full Zone Control matches: 8 at once crashed the GPU process on a 16 GB Mac
  - `SPECIAL_AI=0` turns the bots' awareness of enemy specials off (src/game/botSpecials.js: the old behaviour on the
    same code, for an A/B); `team0` / `team1`: on for that team only (head to head). `SPCHARGE=3`: special gauges fill
    3× as fast (more specials per match; a what-if)
  - `DIAG=1`: every stuck episode also records the bot's nav plan at its start and every 5 s after (mode, route length,
    pi, the next two route nodes, the edge into the next one — `none` when there's no such edge, e.g. after the stuck
    recovery skipped a waypoint — the goal node, noProg, the nearest nav node, climbs off, the wall climb it's at);
    every episode of 2 s or more is printed with them and listed in `RESULT_JSON.diagEps`
- **match.cjs output:**
  - stuck % and the longest stuck episodes; wall climbs at a wall (`CLIMB_STATS`: tries, done, stalled, dry, long)
  - splats by cause; splats caused by each special per team (Bomb Barrage: its thrower's bombs during it or within 3.5 s
    after), K/D per team, and the bots' `SPECIAL_STATS` (noticed / escapes / evaded / caught / avoided routes / backed
    off / retargeted / held fire …)
  - per weapon: players, splats dealt, deaths, average turf
  - specials and super jumps
  - Zone Control: objective stats
  - sight honesty (ground truth, sampled every 0.25 s while a bot fights): how much of the fight its foe is out of sight
    (a wall between the bot's eyes and the foe's chest and head), how much of that its aim is still on the foe
    (tracking through walls), how much trigger time goes at a foe out of sight (shooting at nothing); the bots' own
    cost (BotBrain.update ms per simulated second) and their perception counters (`SIGHT_STATS`, src/game/botSight.js)
  - console warnings/errors
  - a final `RESULT_JSON {…}` line for scripts
- **Scratch files** (profiles, locks) go to `.botlab/` (git-ignored); set `BOTLAB_OUT` to move them.
- **Online-only stages** (config `onlineOnly`, Cargo Terminal): `DEVSTAGE=1` boots every harness page with `?devstage`
  (src/main.js `DEV_STAGE`), so page tests, shots, tower checks, bakes and stage art run there offline (a solo walk: the
  stage is `noBots`, so no bot matches).
- **Useful page-script globals:**
  - `window.__inkwave` (the game): `.match`, `.match.local`, `.debug.freeze()` / `.step(ms)` / `.freezeBots()`
  - `window.__G` (shared systems)
  - Equip players with `actor.setWeapon(id)` / `setSub(id)` / `setSpecial(id)`

Stages:
- `MAP=<id> TIME=day MODE=turf SHOTS='top,art,spawnA,mid' tools/botlab/run.sh tools/botlab/shoot.cjs`: screenshots of a
  stage (presets or custom JSON cameras; MODE zones / tower shows their marks) and a load / perf report. `PRE=script.js`
  stages a scene first (`PRE_ARGS` reaches it as `window.__preArgs`; `PLAY=1` keeps the paint).
- `tools/botlab/run.sh tools/botlab/bake.cjs <id> [<id>.zones …]`: the AO lightmap bake (build/bake-ao.cjs) offscreen.
- `STAGES=<id>,<id> tools/botlab/run.sh tools/botlab/stageart.cjs`: stage-select pictures from each layout's `art` camera.

Bot perception (what a bot can know about a foe: sight lines, view cone, ink, located foes, memory):
`MAP=testbox MODE=turf PAGE=tools/botlab/tests/bot-sight.js tools/botlab/run.sh tools/botlab/page.cjs`.

Bots vs enemy specials (src/game/botSpecials.js: danger areas, escapes, routes round them, the untouchable, counter-play,
the sight rule), each scene with the awareness on and off:
`MAP=testbox MODE=turf PAGE=tools/botlab/tests/bot-specials.js tools/botlab/run.sh tools/botlab/page.cjs`, and the same
with `MODE=tower` for the tower rider (add `PAGE_ARGS='only=tower'` for just that; `PAGE_ARGS` reaches any page test
as `window.__pageArgs`). The scenes are small duels whose outcome varies run to run (the sim isn't bit-for-bit
repeatable): each check runs enough rounds that its bar holds on the behaviour, not on luck (the Twister Zooka's most —
~3 min a run in all). The A/B in matches: `tools/botlab/specials-ab/ab.sh` (see its README).

Bot wall climbs (src/game/bots.js `_climb`, nav climb edges) on Lockgate's drained lock chambers — the chamber stair's nav
(a node row up each flight), the climb costs, every main off the chamber floor with ink (a climb or the stair) and dry
(the stair), a climb that makes no headway given up, forced climbs up three walls weapon by weapon (seconds and ink):
`MAP=lockgate MODE=turf PAGE=tools/botlab/tests/bot-climb.js tools/botlab/run.sh tools/botlab/page.cjs`
(`PAGE_ARGS='only=ink,forced'`: just those parts).

Tower Command:
- `MAP=halyard tools/botlab/run.sh tools/botlab/tower-check.cjs` checks a track: its pieces, holes, clearance, rides at
  real speed, and pictures.
- `MAP=<id> tools/botlab/run.sh tools/botlab/tower-match.cjs` runs an all-bot tower match and reports the tower's numbers
  and the escort trace (riders and escorts' places by the real threat round the tower, full steam, route ink, riders
  hiding in the deck's ink, rolling home, a role timeline). `HUMAN=still|ride|escort` plays Alpha's first kid as a
  human would (outside the bots' team plan): AFK at spawn, or its own brain always riding / always escorting.
- The rules and ink tests: `MAP=testbox MODE=tower PAGE=tools/botlab/tests/tower-rules.js tools/botlab/run.sh
  tools/botlab/page.cjs`, and the same with `tower-ink.js`.

Stage set pieces:
- Movers (Calamari County's railcars): `MAP=calamari MODE=turf PAGE=tools/botlab/tests/movers.js tools/botlab/run.sh
  tools/botlab/page.cjs`, and the same with `MODE=zones`.
- Sprout pods (src/game/pods.js): `MAP=podbox MODE=turf PAGE=tools/botlab/tests/pods.js tools/botlab/run.sh
  tools/botlab/page.cjs` (meters, the calibration per weapon kind, growth and timing, blocking, tint, owner-only ink,
  climbing, carrying down, shoving, nav, the follower replay, bots), and the same with `MODE=tower` and `MODE=boss`.
  `MAP=podbox` is the test arena with pods (testmaps.cjs: page.cjs and match.cjs both take it).

HUD:
- `MAP=halyard MODE=turf SCENES=tools/botlab/tests/hud-lead-scenes.js OUT=/dir tools/botlab/run.sh tools/botlab/hud-shots.cjs`:
  pictures of a match with the HUD up (shoot.cjs hides it): the SCENES script drives each state, and each is saved as the
  full frame + a crop of the top bar.
- The who's-ahead HUD (roster sizes, LEAD / DANGER banners, the take-the-lead sting): `MAP=testbox MODE=turf PAGE=tools/botlab/tests/hud-lead.js
  tools/botlab/run.sh tools/botlab/page.cjs`, and the same with `MODE=zones` and `MODE=tower`.

Sub tweaks (2026-10-01: the Twirl Sprinkler's 5.5 m reach, the Lurk Mine invisible to the other team / a ghost to its
own / popping up on its windup, the Hop Beacon's jump lights and sonar, the Drip Curtain's ink meter, the Skitter /
Waddle / Mine windups — online records and the bots' danger areas included):
`MAP=testbox MODE=turf PAGE=tools/botlab/tests/sub-tweaks.js tools/botlab/run.sh tools/botlab/page.cjs`
(`PAGE_ARGS='only=sprinkler,mine,beacon,curtain,windup'`). Its pictures: `tools/botlab/scenes/sub-tweaks.js`
through shoot.cjs (`PRE=…/sub-tweaks.js PRE_ARGS=<scene>`, see its header).

Audio cues (src/audio/cues.js, src/audio/sfx-cues.js, src/audio/sfx-alerts.js — every sub and special by ear: its
sound at each phase, one positional loop per moving thing, a gliding flight for every thrown sub, warnings before the big
blasts, launch alerts / "you're in it" alarms / stings for the enemy's specials, the enemy's louder than yours):
- `MAP=testbox MODE=turf PAGE=tools/botlab/tests/sfx-cues.js tools/botlab/run.sh tools/botlab/page.cjs` (records every
  audio.play / audio.loop; `PAGE_ARGS='only=subs'`, `'only=specials'`, `'only=bomb,crab'` for a part)
- the listening sheet: `tools/botlab/run.sh tools/botlab/sfx/render.cjs` renders every sub's and special's
  sounds offline to `tools/botlab/sfx/out/` (git-ignored WAVs; `cues.wav` is the whole sheet, `cues.txt` its
  index, `metrics.json` levels and how alike the sounds are). The before / after inventory:
  `tools/botlab/sfx/INVENTORY.md`.
- what the player actually hears: `tools/botlab/run.sh tools/botlab/sfx/realflow.cjs` (`OUT=file.json` for the raw
  numbers) goes title → PLAY → TURF WAR → START! with trusted key / mouse input, taps the master and every voice with
  an AnalyserNode (a cue's × the cue bus's gain and compressor at that moment), stages each sub and special from the
  local player's view over a busy fight, and holds each cue family's audible level against your weapon fire and the
  music (prints `FAMILY …` lines: the before / after table); every thrown sub's flight glide over its airtime
  (`GLIDE …`); every enemy special's launch alert and "you're in it" alarm and their lead before it hits you
  (`SPECIAL …`); the stings; the busy fight's sample peak and K-weighted loudness (`LOUDNESS …`); then pause / resume,
  quit, the Cues slider in SETTINGS → Audio (trusted clicks), a second match, the loadout screen, practice and its
  loadout (the cue director running, the loop bus open, the listener set).
