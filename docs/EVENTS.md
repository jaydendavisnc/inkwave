# Game event bus

`import { on, emit, G } from '../core/ctx.js'` — `on(name, fn)` returns an unsubscribe function. Effects, HUD and
screen-FX modules should subscribe to these instead of editing gameplay code.

## Emitted today
| event | payload | where |
|---|---|---|
| `hit` | `{ attacker, victim, damage, killed, weaponId }` | weapons.js applyHit / storm |
| `damage` | `{ victim, attacker, amount, source }` | actor.damage |
| `splatted` | `{ victim, attacker, cause }` (cause: weapon id, 'water', …) | actor.splat |
| `respawn` | `{ actor }` | actor.respawn |
| `special:ready` | `{ actor }` | actor.addTurf |
| `special:use` | `{ actor, id }` ('slam' / 'storm') | actor._startSpecial |
| `superjump` | `{ actor, phase: 'charge' \| 'flight', to? }` | actor.superJump |
| `shake` | `{ amount, pos? }` | camera trauma requests |
| `recoil` | `{ amount }` | local-player visual recoil |
| `lowink` | `{ actor, need? }` | weapons |
| `match:state` | `{ state, match }` ('intro','playing','finish','judge','results') | match.js |
| `match:oneminute` / `match:count` | `{}` / `{ n }` | match.js |
| `actor:<name>` | `{ actor, surface, ...data }` — re-emitted from `character.onEvent(name, data)`; surface 0 dry · 1 own ink · 2 enemy ink | actor.js wiring |

## To add
| event | payload |
|---|---|
| `actor:jump` | `{ actor, surface, swim }` |
| `actor:land` | `{ actor, speed, surface, pos }` |
| `actor:form` | `{ actor, form: 'kid' \| 'squid', surface }` |
| `actor:dive` / `actor:emerge` | `{ actor, pos, speed }` (squid enters / leaves own ink) |
| `actor:climb` | `{ actor, on }` |
| `actor:enemyInk` | `{ actor, on }` |
| `weapon:fire` | `{ actor, weapon, muzzle, dir, charge? }` |
| `weapon:impact` | `{ pos, normal, team, kind, radius }` (kind: 'shot','blast','drop','charger','roll') |
| `bomb:throw` / `bomb:arm` / `bomb:explode` | `{ actor?, pos, team, radius? }` |
| `special:slam` | `{ actor, pos, radius }` |
| `storm:start` / `storm:end` | `{ pos, team }` |
| `superjump:land` | `{ actor, pos }` |
| `turf` | `{ actor, area }` (every claimed chunk; aggregate yourself) |

## Character → actor` inside character.js)
| name | data |
|---|---|
| `footstep` | `{ foot: 'L' \| 'R', pos: THREE.Vector3 (world, copy it) , speed }` at each foot plant |
| `handplant` (optional) | `{ pos }` roller/charger heavy moments |

## Audio (lead-owned, src/audio/audio.js)
- The lead plays footstep sounds on `actor:footstep` (surface-aware: `step_dry`, `step_ink`, `step_enemy`) and runs the
  harbour ambience (`harbor_ambience` loop + random `gull` cries). Don't duplicate these.
- Extra SFX names available to everyone via `G.audio.play(name, { pos, volume, pitch })`: `step_dry`, `step_ink`,
  `step_enemy`, `ink_drip`, `gull`, `harbor_ambience` (loop) — plus the full list in docs/CONTRACTS.md §2.
- Need a new sound? Add a def in src/audio/audio.js and list it in SFX_GROUPS.
- Subs and specials play through the cue director, `G.cues` (src/audio/cues.js; sounds in src/audio/sfx-cues.js):
  `G.cues.sub(kind, phase, { owner, team, at })` for a sub's one-shots (phase: throw · land · warn · boom · end · beep ·
  use) and `G.cues.one(name, { at, owner, kind })` for any other cue — both apply the own / ally / foe mix (your own
  throws have no position). The loops of anything moving or live (a sub in the air, a fuse, a Kraken, a Crab, a
  twister, a Tempest cloud …) are the director's: it reads them off the world every frame, so a new sub or special
  adds its loop in `Cues._gather` rather than calling `G.audio.loop` itself.
- Every sub's and special's sound rides the cue bus (audio.js `isCue`: the Subs / Specials / Flight / Special alerts /
  Special stings groups, the Splat Bomb's, the kit subs' `torpedo_` / `tracer_` / `boomerang_` / `waddle_` /
  `shaker_` sounds): +6 dB over the other SFX at the Cues slider's 100 % (settings `cues`, 0 … 1.5) and a gentle
  compressor. A new sub / special sound joins it by being listed in those groups (or `G.audio.play(name, { cue: true })`).
- A thrown sub in the air needs nothing: `Cues._fly` gives it the gliding `sub_flight` (add its voice to sfx-alerts.js
  `FLIGHT` and cues.js `FLIGHT_KIND`). An enemy special's launch alert and "you're in it" alarm come from the bots'
  danger model (botSpecials.js `specialDangers`): a new special with a danger area there gets them by adding its src to
  cues.js `alarmOf` (and an `alert_<kind>` / `DANGER` voice); its sting is `sting_<kind>` on `special:start` /
  `special:use`.

## Added since upstream 1.0 (this fork)
Specials, subs and Zone Control emit these on top of the table above. `actor:dive`, `footstep` and `handplant` are no
longer emitted.

| event | payload | where |
|---|---|---|
| `actor:cheer` | `{ actor, helped }` | specials.js (Cheer Orb) |
| `actor:dodge` / `weapon:dodge` | `{ actor, dir }` / `{ actor, pos, dir }` | weapons.js (Twins dodge roll) |
| `actor:poisoned` / `actor:tracked` | `{ actor }` / `{ actor, team }` | subs.js (poison / point sensor) |
| `bomb:arm` / `bomb:explode` | `{ actor, pos, team, radius }` | subs.js |
| `match:count` | `{ n }` (final countdown) | match.js |
| `special:start` / `special:end` | `{ actor, id }` / `{ actor, id, reason }` | specials.js |
| `special:launch` / `special:sonar` / `special:shield` | `{ actor, to }` / `{ actor, pos }` / `{ actor, time }` | specials.js |
| `special:strike` / `special:wail` | `{ actor, pos, radius }` / `{ actor, pos, dir }` | specials.js |
| `storm:end` | `{ pos, team, actor }` | weapons.js |
| `sub:use` | `{ actor, kind }` | subs.js |
| `sub:land` / `sub:arm` / `sub:cloud` / `sub:destroyed` | `{ kind, pos, team, radius? }` | subs.js |
| `sub:charge` | `{ actor, kind: 'shaker', level, max }` — the Shaker Bomb in hand reached a new charge (2, then 3 = max) | kits/shaker.js |
| `sub:lock` / `sub:end` | `{ kind: 'waddle', pos, team, actor, target }` / `{ kind, why, team, pos }` (why: reached · travel · life · lost · stuck · fuse · popped · sea · fell · cleared) | kits/waddle.js |
| `zones:zone` | `{ zone, owner }` — one zone taken (≥ 80 % ink); it is then flooded with the taker's ink | zones.js |
| `zones:control` | `{ owner, prev, objective }` — the live objective's holder changed (owner −1 = neutral) | zones.js |
| `zones:contest` | `{ zone, holder, share }` — the other team has inked a held zone to the warning share (ZONES.warn) | zones.js |
| `zones:penalty` | `{ team, penalty, total, start, end }` | zones.js |
| `zones:active` | `{ objective, zones, final, moved }` — rotation (final = the last-30-s centre lock) | zones.js |
| `zones:overtime` | `{ losing }` | zones.js |
| `zones:end` | `{ winner, reason, counts }` (reason: knockout · time · comeback · retake · neutralised · overtime-cap) | zones.js |
