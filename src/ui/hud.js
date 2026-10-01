// INKWAVE — in-match HUD (contract: docs/CONTRACTS.md §3).
//   const hud = new HUD(rootEl [, { playSound }]);
//   hud.setVisible(bool) · hud.update(dt, HudFrame) · hud.banner(kind, text) · hud.countdown(n)
//   hud.hitMarker('hit'|'kill') · hud.feed({text,color,kind}) · hud.damage(amount, color, angle?)
//   hud.showSplatted({by, byColor, respawn, attacker?, cause?}) · hud.hideSplatted() · hud.judge({colors, percents, names}) → Promise
//   Zone Control: HudFrame.zones = ZoneControl.state() + { viewer } switches on the team counters / objective chip, the
//   zones:* events drive the call-outs + cues, and hud.judge({ mode: 'zones', colors, names, counts, penalty, totals?,
//   winner, reason, overtime }) → Promise plays the final-count reveal (see _judgeZones).
// Additive: hud.attachScreenFX(fx) (src/fx/screenfx.js takes over the damage smears + low-HP vignette + splat tint),
//           hud.lab = { local, actors } (ui-lab: drives the event-driven systems without a match).
//
// Systems (all event/frame driven, dirty-checked, transforms/opacity only in per-frame paths):
//   roster top bar (weapon badges, splatted X + respawn ring, special-ready glow, you-caret, state pops) · timer
//   (last-minute / final-10 states) · special gauge (liquid orb, gain pulses, ready flare + rays, active spin) · turf
//   total pill + "+Np" ticker (aggregated 'turf' events) · per-weapon reticles (fire bloom, damage-scaled hit ticks,
//   kill X + ring burst, charge ring + full flash, spawn-shield ring, bomb-aim cost chip) · damage direction arcs ·
//   sloshing canvas ink tank (bubbles on refill, sub-cost line, low/empty states) · kill cards (victim + weapon) ·
//   streak callouts (first/double/triple/quad/wipeout/revenge/streak) · assist cards · death markers (squid-skulls in the
//   victim's ink where anyone was splatted: world view + minimap; frame.deaths = main.js's pooled records) ·
//   ally tags with weapon icons · minimap frame with super-jump beacons (1-4 keys, virtual cursor, click to jump) ·
//   intro team lineup · banners · final countdown · splatted card (what did it: main weapon / sub / special / the sea,
//   splatCause; + the Super Jump planned for the respawn, frame.jumpQueue; hud.jumpNote(text) for a cancelled one) ·
//   judge reveal · feed · sub badge on the special orb (frame.subKind / subCost / ink) · "Can't use" callout (sub:cantuse).
//
// Conventions for frame fields the contract leaves open:
//   map.players[].yaw   radians on the minimap canvas: 0 = pointing up (−y), positive = clockwise.
//   markers[].angle     radians in screen space toward the off-screen ally: 0 = right, positive = clockwise (y down).
//   percents            accepted as 0..100 or 0..1.
// Boss mode (docs/BOSS.md): src/ui/hud-boss.js (hud.boss) adds the boss bar / title card / callouts / damage numbers and
// the endings; the roster slots show the 8-kid squad in squad ink. It switches on match.mode === 'boss' or boss:spawn.
// Who's ahead: src/ui/hud-lead.js (hud.lead) grows / shrinks each team's roster group, hangs a bouncing LEAD / DANGER
// banner under it and flashes + stings when a team takes the lead (Turf War, Zone Control, Tower Command).
import { h, clamp, colorVars, toHex, fmtTime, fmtInt, splatSVG, splatShape, pct, shade, lerp, easeOutBack, easeOutCubic, restartAnim, prefersReducedMotion } from './ui-util.js';
import { SQUID, SPLAT_ICON, DEATH_ICON, GLYPHS, SUB_ICONS, WEAPON_ICONS, richText, keycap, specialIcon, weaponIcon } from './ui-icons.js';
import { WEAPONS, SPECIALS, TEAM_NAMES, SUB, PLAYER, MATCH, ZONES, TOWER } from '../config.js';
import { on, G } from '../core/ctx.js';
import { SFX } from '../audio/audio.js';
import { BossHud } from './hud-boss.js';
import { LeadHud } from './hud-lead.js';
import { installBossAudio } from '../audio/bossAudio.js';
import { bossEmblem, BOSS_NAME, BOSS_EPITHET } from './boss-art.js';

let HUD_ID = 0;
const BUMP = { duration: 320, easing: 'cubic-bezier(.34,1.8,.64,1)' };
// dualies: the ring of the pistol that just fired jabs outward (SVG → Web Animations; the reflow restart trick needs HTML)
const TWIN_KICK = [{ transform: 'scale(1.55)', strokeWidth: '2.6px' }, { transform: 'scale(1)', strokeWidth: '1.8px' }];
const TWIN_KICK_T = { duration: 130, easing: 'cubic-bezier(.2,.8,.3,1)' };
// Sponge Mitts: each glove bracket jabs outward on its own punch ([right, left])
const MITT_KICK = [[{ transform: 'translateX(4px) scale(1.35)' }, { transform: 'none' }], [{ transform: 'translateX(-4px) scale(1.35)' }, { transform: 'none' }]];
const MITT_KICK_T = { duration: 150, easing: 'cubic-bezier(.2,.8,.3,1)' };
const TAU = Math.PI * 2;
const STREAKS = { 2: 'DOUBLE SPLAT!', 3: 'TRIPLE SPLAT!', 4: 'QUAD SPLAT!' };
const kindOf = (w) => (WEAPONS[w] && WEAPONS[w].kind) || w || 'shooter';
// super-jump map slots: 3 teammates, base, then up to 6 team jump beacons (keys 1–9, 0)
const NB = 10;
const slotKey = (i) => String((i + 1) % 10);
// reticle family for weapons that share another kind's crosshair: our twins / spinner / bucket wear upstream's dualies /
// splatling / slosher reticles (the retired weapons they replaced), the brush the roller's brackets
const RETICLE_OF = { bucket: 'slosher', spinner: 'splatling', twins: 'dualies', brush: 'roller' };

// ------------------------------------------------------------------ HUD-only art
const K = '#15121c';
const SPAWN_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="48" rx="24" ry="9" fill="none" stroke="${K}" stroke-width="8"/><ellipse cx="32" cy="48" rx="24" ry="9" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 6 L32 36 M20 25 L32 38 L44 25" fill="none" stroke="${K}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 6 L32 36 M20 25 L32 38 L44 25" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const DROP_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 C32 5 51 28 51 41 C51 52 42.5 59 32 59 C21.5 59 13 52 13 41 C13 28 32 5 32 5 Z" fill="currentColor" stroke="${K}" stroke-width="4"/><path d="M24 37 Q24 30 29 26" stroke="#fff" stroke-opacity=".7" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
// Zone Control: a zone box (corner brackets round a rounded square); fill = currentColor
const ZONE_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="7" width="18" height="18" rx="3.5" fill="currentColor" stroke="${K}" stroke-width="3"/><path d="M3.5 11 V6 a2.5 2.5 0 0 1 2.5 -2.5 H11 M21 3.5 H26 a2.5 2.5 0 0 1 2.5 2.5 V11 M28.5 21 V26 a2.5 2.5 0 0 1 -2.5 2.5 H21 M11 28.5 H6 a2.5 2.5 0 0 1 -2.5 -2.5 V21" fill="none" stroke="${K}" stroke-width="5" stroke-linecap="round"/><path d="M3.5 11 V6 a2.5 2.5 0 0 1 2.5 -2.5 H11 M21 3.5 H26 a2.5 2.5 0 0 1 2.5 2.5 V11 M28.5 21 V26 a2.5 2.5 0 0 1 -2.5 2.5 H21 M11 28.5 H6 a2.5 2.5 0 0 1 -2.5 -2.5 V21" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const ZONE_NEUTRAL = '#dcd7e6';
// Tower Command: a platform with its mast, beacon and signal arcs
const TOWER_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9.5 12.5 a8 8 0 0 1 13 0" fill="none" stroke="${K}" stroke-width="4.6" stroke-linecap="round"/><path d="M9.5 12.5 a8 8 0 0 1 13 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><rect x="14.6" y="7" width="2.8" height="14" fill="#fff" stroke="${K}" stroke-width="2"/><circle cx="16" cy="7" r="3.3" fill="currentColor" stroke="${K}" stroke-width="2.4"/><path d="M4.5 20 h23 l-2.6 7.5 h-17.8 z" fill="currentColor" stroke="${K}" stroke-width="3" stroke-linejoin="round"/></svg>`;
// death marker: a squid-skull (mantle + fins, X eyes) in the victim's ink (currentColor), white-rimmed so it reads on
// any ink or deck. Shared with the TAB map diorama.
const DM_HEAD = 'M32 7 C36.5 7 50 20 54.5 26.5 C56.5 29.5 54.5 32.5 50.5 31.7 L46 31 L46 41 C46 48 41.5 51 32 51 C22.5 51 18 48 18 41 L18 31 L13.5 31.7 C9.5 32.5 7.5 29.5 9.5 26.5 C14 20 27.5 7 32 7 Z';
export const DEATH_MARK_SVG = `<svg viewBox="0 0 64 60" aria-hidden="true"><path d="${DM_HEAD}" fill="none" stroke="#fff" stroke-width="11" stroke-linejoin="round"/><path d="${DM_HEAD}" fill="currentColor" stroke="${K}" stroke-width="4.6" stroke-linejoin="round"/><path d="M21.5 20.5 Q26 14.5 31 13.2" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3.4" stroke-linecap="round"/><path d="M21.8 32.3 L28.8 39.3 M28.8 32.3 L21.8 39.3 M35.2 32.3 L42.2 39.3 M42.2 32.3 L35.2 39.3" stroke="${K}" stroke-width="4.4" stroke-linecap="round"/></svg>`;
// Super Jump glyph (splat-screen plan chip): an arc onto a landing ring
const SJ_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="42" cy="50" rx="15" ry="6" fill="none" stroke="${K}" stroke-width="7"/><ellipse cx="42" cy="50" rx="15" ry="6" fill="none" stroke="currentColor" stroke-width="3.6"/><path d="M8 52 C9 22 30 6 42 36" fill="none" stroke="${K}" stroke-width="10" stroke-linecap="round"/><path d="M8 52 C9 22 30 6 42 36" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M33 31 L42.5 40 L47.5 27.5" fill="none" stroke="${K}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M33 31 L42.5 40 L47.5 27.5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// splat-screen cause for the sea (fell / knocked off the stage): a curling wave over a swell line
const SEA_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M5 45 C12 45 13 32 22 24 C31 16 46 16 52 27 C45 23 37 26 36 33 C35 40 42 44 48 42 C53 40.5 56 43 59 45 L59 51 L5 51 Z" fill="currentColor" stroke="${K}" stroke-width="4.2" stroke-linejoin="round"/><path d="M24 30 Q28 24 35 22.5" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3.4" stroke-linecap="round"/><path d="M6 58 Q12.5 53 19 58 T32 58 T45 58 T58 58" fill="none" stroke="${K}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 58 Q12.5 53 19 58 T32 58 T45 58 T58 58" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="54" cy="16" r="4.2" fill="currentColor" stroke="${K}" stroke-width="3"/><circle cx="45" cy="9" r="2.8" fill="currentColor" stroke="${K}" stroke-width="2.6"/></svg>`;
const ZONE_LABEL = { center: 'CENTRE', home: 'YOUR SIDE', away: 'ENEMY SIDE' };
// main-weapon icon for an id or kind (kit weapons register WEAPON_ICONS[kind] themselves; unknown → the shooter)
const mainIcon = (id) => WEAPON_ICONS[id] || WEAPON_ICONS[(WEAPONS[id] || {}).kind] || weaponIcon(kindOf(id));
const ENV_CAUSES = { water: 'Fell in the sea', sea: 'Fell in the sea', fall: 'Fell off the stage', oob: 'Out of bounds', bounds: 'Out of bounds' };
/**
 * What splatted you, for the splat screen: the 'splatted' event's cause (= the finishing hit's weaponId, or 'water') →
 * { kind: 'main' | 'sub' | 'special' | 'env', id, name, tag, icon } (null when there's nothing to show). Sub and special
 * ids resolve through SUBS / SPECIALS (kit subs and new specials included, icons from SUB_ICONS / specialIcon, a missing
 * sub icon falls back to the bomb); anything else that isn't the sea is the attacker's main weapon: main paths pass their
 * weapon id, a projectile type ('shot', 'blast', 'drop', 'slosh': weapons.js applyHit(… p.weaponId || p.wid || p.type))
 * or nothing, and a kit weapon that reuses a built-in firing path (the charger beam passes 'charger') is still the
 * attacker's own weapon.
 */
export function splatCause(cause, attacker) {
  const c = typeof cause === 'string' ? cause : null;
  if (c && ENV_CAUSES[c]) return { kind: 'env', id: c, name: attacker ? 'Knocked into the sea' : ENV_CAUSES[c], tag: '', icon: SEA_ICON };
  if (c && SUB[c]) return { kind: 'sub', id: c, name: SUB[c].name || c, tag: 'SUB', icon: SUB_ICONS[SUB[c].kind] || SUB_ICONS[c] || SUB_ICONS.bomb };
  if (c && SPECIALS[c]) return { kind: 'special', id: c, name: SPECIALS[c].name || c, tag: 'SPECIAL', icon: specialIcon(c) };
  const w = (attacker && attacker.weaponId) || (c && WEAPONS[c] ? c : null);
  if (w) return { kind: 'main', id: w, name: (WEAPONS[w] || {}).name || '', tag: '', icon: mainIcon(w) };
  return null;
}
// "Can't use" (a kit sub refused the throw, e.g. one already out): a soft, low two-note bonk — quieter than ui_error's buzz
if (!SFX.sub_cantuse) SFX.sub_cantuse = {
  gain: 0.24, max: 1, jitter: 0, reverb: 0.03, minGap: 0.18,
  build(v, p) {
    const lp = v.filter('lowpass', 1600, 0.8, v.out);
    v.tone({ t: 0, f: 622 * p, f1: 587 * p, sw: 0.05, a: 0.003, d: 0.07, peak: 0.45, to: lp });
    v.tone({ t: 0.08, f: 466 * p, f1: 415 * p, sw: 0.09, a: 0.003, d: 0.13, peak: 0.55, to: lp });
    v.tone({ t: 0.08, type: 'triangle', f: 233 * p, a: 0.002, d: 0.09, peak: 0.16, to: lp });
  },
};
// squid-head badge silhouette (roster)
const BADGE_PATH = 'M32 2.5 C35.5 2.5 43 9 47.5 14.5 C50 14 55 15.5 57 18.5 C58.6 21 57.4 23.6 55.2 24.8 A24.5 24.5 0 1 1 8.8 24.8 C6.6 23.6 5.4 21 7 18.5 C9 15.5 14 14 16.5 14.5 C21 9 28.5 2.5 32 2.5 Z';
function arcPath(r0, r1, halfDeg, tip) {
  const a = (halfDeg * Math.PI) / 180;
  const P = (r, t) => `${(Math.sin(t) * r).toFixed(2)} ${(-Math.cos(t) * r).toFixed(2)}`;
  return `M${P(r1, -a)} A${r1} ${r1} 0 0 1 ${P(r1, a)} L${P(r0, a * 0.78)} A${r0} ${r0} 0 0 0 ${P(r0, -a * 0.78)} Z M${P(r1 - 1, -0.16)} L${P(r1 + tip, 0)} L${P(r1 - 1, 0.16)} Z`;
}
const DD_PATH = arcPath(80, 89, 26, 12);

export class HUD {
  constructor(rootEl, opts = {}) {
    this.root = rootEl || document.body;
    this.playSound = opts.playSound || null;
    this.id = ++HUD_ID;
    this._L = {};           // last-written values (dirty checks)
    this._smears = [];
    this._visible = false;
    this.timeScale = 1;     // effect clock multiplier (debug / slow-mo)
    this.paused = false;    // freezes self-driven effects (judge, smears, splatted ring)
    this._fxTime = 0;
    this.fx = null;         // ScreenFX (optional)
    this.lab = null;        // ui-lab driver { local, actors }
    this._t = 0;            // HUD clock (frame driven)
    this._dd = [];          // damage direction indicators
    this._turfAcc = 0; this._turfT = 0; this._turfTotal = 0; this._turfShown = 0;
    this._kills = { times: [], streak: 0, first: false, lastKiller: null, dealt: new Map() };
    this._bloom = 0; this._kick = 0; this._hitN = 0; this._hitT = -9;
    this._tank = { level: 1, slosh: 0, sloshV: 0, wobble: 0, bubbles: [], prevInk: 1, prevYaw: null, prevVx: 0, prevVz: 0, empty: 0, t: 0 };
    this._map = { cx: 0.5, cy: 0.5, hover: -1, open: false, pressed: -1, pressT: 0 };
    this._build();
    this._fxLoop = this._fxLoop.bind(this);
    this._lastFx = 0;
    this._rafId = 0;
    this._onResize = () => this._resizeCanvas();
    addEventListener('resize', this._onResize);
    this._bindBus();
    this.boss = new BossHud(this);
    this.lead = new LeadHud(this);   // (after the build: it hangs its banners on the roster groups)
    installBossAudio();   // boss-mode sfx + music director (idle outside boss matches)
  }

  // ================================================================ build
  _build() {
    const el = this.el = h('div', { class: 'iw-hud is-hidden', 'aria-hidden': 'true' });
    colorVars(el, 'self', '#ff8a14');
    colorVars(el, 'enemy', '#2f5bff');

    this.vig = h('div', { class: 'iw-hud__vig' });
    this.canvas = h('canvas', { class: 'iw-hud__smear' });
    this.ctx = this.canvas.getContext('2d');

    // ---- top bar: roster + timer
    const squad = (side) => h('div', { class: `iw-squad iw-squad--${side}` }, Array.from({ length: 4 }, () => {
      const ring = h('i', { class: 'iw-sq__ring', html: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" pathLength="100"/></svg>' });
      return h('span', { class: 'iw-sq' },
        h('span', { class: 'iw-sq__badge', html: `<svg class="iw-sq__shape" viewBox="0 0 64 64" aria-hidden="true"><path class="o" d="${BADGE_PATH}"/><path class="f" d="${BADGE_PATH}"/><path class="g" d="M17 30 Q20 22 28 19"/></svg>` },
          h('span', { class: 'iw-sq__w' })),
        ring,
        h('i', { class: 'iw-sq__x', html: GLYPHS.close }),
        h('b', { class: 'iw-sq__n' }),
        h('i', { class: 'iw-sq__you' }),
        h('i', { class: 'iw-sq__spark' }));
    }));
    this.squads = [squad('a'), squad('b')];
    this.timerTxt = h('span', { class: 'iw-timer__txt' }, '3:00');
    this.timer = h('div', { class: 'iw-timer' }, h('span', { class: 'iw-timer__blob' }), h('span', { class: 'iw-timer__drip' }), this.timerTxt);
    // Zone Control: a count badge per team either side of the timer + the objective chip hanging under it (all hidden
    // unless the frame carries `zones`, so turf / practice lay out exactly as before)
    const zcounter = (side) => h('div', { class: `iw-zc iw-zc--${side}` },
      h('span', { class: 'iw-zc__plate' }),
      h('span', { class: 'iw-zc__bar' }, h('i', { class: 'iw-zc__fill' }), h('i', { class: 'iw-zc__pen' })),
      h('b', { class: 'iw-zc__num' }, '100'),
      h('span', { class: 'iw-zc__pb' }, '+0'),
      h('i', { class: 'iw-zc__hold', html: ZONE_ICON }));
    this.zc = [zcounter('a'), zcounter('b')];
    this.zoIcons = h('span', { class: 'iw-zo__icons' });
    this.zoLabel = h('span', { class: 'iw-zo__lbl' }, 'CENTRE');
    this.zoShiftN = h('b', null, '5');
    this.zoOtBar = h('i', { class: 'iw-zo__otbar' }, h('i'));
    this.zo = h('div', { class: 'iw-zo' },
      h('div', { class: 'iw-zo__ot' }, h('span', { class: 'iw-display' }, 'OVERTIME'), this.zoOtBar),
      h('div', { class: 'iw-zo__chip' }, this.zoIcons, this.zoLabel),
      h('div', { class: 'iw-zo__shift' }, h('i', { html: GLYPHS.clock || '' }), h('span', null, 'ZONE SHIFT IN '), this.zoShiftN));
    this.timer.appendChild(this.zo);
    // Tower Command: the tower track hanging under the timer (drawn from your side: your goal at the right end, so your
    // push always runs left → right), checkpoints, each team's best, the tower with its riders, a status line; the Zone
    // Control count badges show the scores. Plus a pointer to the tower whenever you're off it. (Hidden unless the frame
    // carries `tower`.)
    this.twTower = h('span', { class: 'iw-tw__tower' }, h('i', { class: 'iw-tw__ring' }), h('i', { class: 'iw-tw__ti', html: TOWER_ICON }),
      h('span', { class: 'iw-tw__pips' }, h('i'), h('i'), h('i'), h('i')));
    this.twBest = [h('i', { class: 'iw-tw__best is-a' }), h('i', { class: 'iw-tw__best is-b' })];
    this.twCps = h('span', { class: 'iw-tw__cps' });
    this.twTrack = h('span', { class: 'iw-tw__track' }, h('i', { class: 'iw-tw__half is-a' }), h('i', { class: 'iw-tw__half is-b' }), h('i', { class: 'iw-tw__mid' }),
      h('i', { class: 'iw-tw__goal is-a' }), h('i', { class: 'iw-tw__goal is-b' }), this.twCps, ...this.twBest, this.twTower);
    this.twStatus = h('span', { class: 'iw-tw__status' });
    this.tw = h('div', { class: 'iw-tw' }, h('div', { class: 'iw-tw__ot' }, h('span', { class: 'iw-display' }, 'OVERTIME')), this.twTrack, this.twStatus);
    this.timer.appendChild(this.tw);
    this.tptr = h('div', { class: 'iw-tptr' }, h('i', { class: 'iw-tptr__arrow' }), h('span', { class: 'iw-tptr__ico', html: TOWER_ICON }), h('b', { class: 'iw-tptr__d' }));
    this.twTimers = h('div', { class: 'iw-twts' });   // Tower Command: a countdown over each uncleared checkpoint
    this.top = h('div', { class: 'iw-hud__top' }, this.squads[0], this.zc[0], this.timer, this.zc[1], this.squads[1]);

    // ---- special gauge (liquid orb) + turf total
    const sid = `iwsp${this.id}`;
    const blob = 'M50 6 C72 5 93 20 94 45 C95 70 80 94 52 95 C25 96 6 78 6 51 C6 25 26 7 50 6 Z';
    let wave = 'M-100 0';
    for (let x = -100; x < 200; x += 25) wave += ' q6.25 -5 12.5 0 t12.5 0';
    wave += ' V120 H-100 Z';
    const rays = Array.from({ length: 12 }, (_, i) => h('i', { style: { '--r': `${i * 30}deg`, '--d': `${(i % 3) * 40}ms` } }));
    this.sp = h('div', { class: 'iw-sp' },
      h('div', { class: 'iw-sp__rays' }, rays),
      h('div', { class: 'iw-sp__orb', html: `<svg viewBox="0 0 100 100" aria-hidden="true">
          <defs><clipPath id="${sid}"><path d="${blob}"/></clipPath>
            <radialGradient id="${sid}g" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
          <path class="iw-sp__bg" d="${blob}"/>
          <g clip-path="url(#${sid})"><g class="iw-sp__liquid"><path class="iw-sp__wave2" d="${wave}"/><path class="iw-sp__wave" d="${wave}"/></g>
            <circle class="iw-sp__bub" cx="30" cy="80" r="3"/><circle class="iw-sp__bub b" cx="62" cy="88" r="2.2"/><circle class="iw-sp__bub c" cx="46" cy="92" r="1.6"/>
            <rect x="0" y="0" width="100" height="100" fill="url(#${sid}g)"/>
            <ellipse cx="34" cy="26" rx="15" ry="8" fill="#fff" opacity=".2"/></g>
          <path class="iw-sp__rim" d="${blob}"/>
          <path class="iw-sp__spin" d="${blob}" pathLength="100"/>
        </svg>` }),
      h('i', { class: 'iw-sp__ring' }),
      h('span', { class: 'iw-sp__icon' }),
      h('span', { class: 'iw-sp__pct' }),
      h('div', { class: 'iw-sp__ready' }, h('span', null, 'READY!'), h('span', { html: keycap('F') })));
    this.spLiquid = this.sp.querySelector('.iw-sp__liquid');
    this.spIcon = this.sp.querySelector('.iw-sp__icon');
    this.spPct = this.sp.querySelector('.iw-sp__pct');
    this.turfNum = h('b', null, '0');
    this.turfEl = h('div', { class: 'iw-turf' }, h('i', { html: DROP_ICON }), this.turfNum, h('small', null, 'p'));
    this.feedEl = h('div', { class: 'iw-feed' });
    // ---- sub badge: a small disc overlapping the special orb's lower-left edge — the equipped sub (Bomb Barrage: its
    // bomb), its rim filling with ink toward the throw cost, dimmed while you can't afford it (_updSubBadge)
    this.sbIcon = h('span', { class: 'iw-sb__icon', html: SUB_ICONS.bomb });
    this.subBadge = h('div', { class: 'iw-sb' },
      h('span', { class: 'iw-sb__disc' }),
      h('i', { class: 'iw-sb__ring', html: '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" cx="50" cy="50" r="44" pathLength="100"/><circle class="spin" cx="50" cy="50" r="44" pathLength="100"/></svg>' }),
      this.sbIcon,
      h('i', { class: 'iw-sb__x', html: GLYPHS.close }));
    this.sbFg = this.subBadge.querySelector('.fg');

    // ---- crosshair cluster
    this.ret = h('div', { class: 'iw-ret' });
    this.hitEl = h('div', { class: 'iw-hit' }, h('i'), h('i'), h('i'), h('i'));
    this.killEl = h('div', { class: 'iw-kill' }, h('span', { class: 'iw-kill__ring' }), h('span', { class: 'iw-kill__splat', html: SPLAT_ICON }), h('i'), h('i'), h('i'), h('i'));
    this.shield = h('div', { class: 'iw-shield', html: '<svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="36" pathLength="100"/></svg>' });
    this.subChip = h('div', { class: 'iw-subaim' }, h('i', { html: SUB_ICONS.bomb }), h('span', { class: 'iw-subaim__bar' }, h('i')), h('b', null, `${Math.round(SUB.bomb.inkCost)}%`));
    // status badges (tracked by the enemy / poisoned) + the poison vignette
    this.statusEl = h('div', { class: 'iw-status' }, h('span', { class: 'iw-status__b is-tracked' }, 'TRACKED'), h('span', { class: 'iw-status__b is-poison' }, 'POISONED'));
    this.poisonVig = h('div', { class: 'iw-poison' });
    this.tankCanvas = h('canvas', { class: 'iw-tank__cv' });
    this.tankCtx = this.tankCanvas.getContext('2d');
    this.tank = h('div', { class: 'iw-tank' }, this.tankCanvas, h('div', { class: 'iw-tank__low' }, 'LOW INK'));
    this.tpops = h('div', { class: 'iw-tpops' });
    // "Can't use": a kit sub refused the throw (sub:cantuse) — a short callout where the sub-aim chip sits
    this.denyIcon = h('span', { class: 'iw-deny__i', html: SUB_ICONS.bomb });
    this.denyEl = h('div', { class: 'iw-deny' }, h('span', { class: 'iw-deny__b' }, this.denyIcon, h('i', { class: 'iw-deny__no' })), h('b', null, 'CAN’T USE'));
    this.xh = h('div', { class: 'iw-xh' }, this.shield, this.ret, this.hitEl, this.killEl, this.tank, this.subChip, this.denyEl, this.tpops);
    this.ddLayer = h('div', { class: 'iw-dds' });

    // ---- minimap + super-jump beacons
    this.mapSlot = h('div', { class: 'iw-map__slot' });
    const arrow = '<svg class="iw-mdot__arrow" viewBox="-13 -15 26 30" aria-hidden="true"><path class="o" d="M0 -11 L9 11 L0 5.5 L-9 11 Z"/><path class="i" d="M0 -11 L9 11 L0 5.5 L-9 11 Z"/></svg>';
    this.mapDots = Array.from({ length: 8 }, () => h('i', { class: 'iw-mdot', html: '<b></b>' + arrow }));
    // death markers on the minimap (under the player dots)
    this.mapDms = Array.from({ length: 12 }, () => h('i', { class: 'iw-mdm', html: DEATH_MARK_SVG }));
    this.mapFrame = h('div', { class: 'iw-map__frame' }, this.mapSlot, h('div', { class: 'iw-map__dms' }, this.mapDms), h('div', { class: 'iw-map__dots' }, this.mapDots), h('i', { class: 'iw-map__gloss' }));
    this.mapLabel = h('div', { class: 'iw-map__label' }, h('span', { html: keycap('TAB') }), h('span', null, 'MAP'));
    this.beacons = Array.from({ length: NB }, (_, i) => {
      const b = h('div', { class: 'iw-bcn' + (i === 3 ? ' iw-bcn--home' : i > 3 ? ' iw-bcn--dev' : '') },
        h('span', { class: 'iw-bcn__stem' }, h('i')),
        h('span', { class: 'iw-bcn__pulse' }),
        h('span', { class: 'iw-bcn__disc' }, h('span', { class: 'iw-bcn__icon', html: i === 3 ? SPAWN_ICON : i > 3 ? SUB_ICONS.beacon || '' : '' })),
        h('span', { class: 'iw-bcn__key' }, slotKey(i)),
        h('span', { class: 'iw-bcn__label' }, h('small', null, 'SUPER JUMP'), h('b', null, i === 3 ? 'Base' : '')));
      b.addEventListener('pointerenter', () => { if (this._map.open) this._map.hover = i; });
      b.addEventListener('pointerleave', () => { if (this._map.hover === i) this._map.hover = -1; });
      b.addEventListener('click', (e) => { e.stopPropagation(); this._jumpTo(i); });
      return b;
    });
    this.mapCursor = h('div', { class: 'iw-mcur' }, h('i'));
    this.mapJumpLine = h('div', { class: 'iw-map__jline', html: '<svg aria-hidden="true"><path/></svg>' });
    this.legendRows = Array.from({ length: NB }, (_, i) => {
      const row = h('div', { class: 'iw-lg__row' + (i === 3 ? ' is-home' : '') },
        h('span', { class: 'iw-lg__key', html: keycap(slotKey(i)) }),
        h('span', { class: 'iw-lg__w', html: i === 3 ? SPAWN_ICON : i > 3 ? SUB_ICONS.beacon || '' : '' }),
        h('span', { class: 'iw-lg__name' }, i === 3 ? 'Base' : '—'),
        h('span', { class: 'iw-lg__st' }));
      row.addEventListener('pointerenter', () => { if (this._map.open) this._map.hover = i; });
      row.addEventListener('pointerleave', () => { if (this._map.hover === i) this._map.hover = -1; });
      row.addEventListener('click', (e) => { e.stopPropagation(); this._jumpTo(i); });
      return row;
    });
    this.mapLegend = h('div', { class: 'iw-map__legend' },
      h('div', { class: 'iw-lg__title iw-display' }, 'SUPER JUMP'),
      h('div', { class: 'iw-lg__sub' }, 'Pick a landing spot'),
      h('div', { class: 'iw-lg__rows' }, this.legendRows),
      h('div', { class: 'iw-lg__foot', html: richText('Press [1] – [4] or click · release [TAB] to cancel') }));
    this.map = h('div', { class: 'iw-map' }, this.mapFrame, this.mapJumpLine, h('div', { class: 'iw-map__bcns' }, this.beacons), this.mapCursor, this.mapLabel, this.mapLegend);
    this.mapDim = h('div', { class: 'iw-map-dim' });
    this._mapT = 0; this._mapV = 0;

    this.markers = Array.from({ length: 8 }, () => h('div', { class: 'iw-mk' }, h('span', { class: 'iw-mk__tag' }, h('i', { class: 'iw-mk__w' }), h('b')), h('i', { class: 'iw-mk__arrow' })));
    this.markerLayer = h('div', { class: 'iw-mks' }, this.markers);
    // "Yeah!" cheers: speech bubbles over whoever signalled
    this.cheerEls = Array.from({ length: 8 }, () => h('div', { class: 'iw-cheer' }, 'YEAH!'));
    this.cheerLayer = h('div', { class: 'iw-cheers' }, this.cheerEls);
    // death markers in the world view: a fixed pool, one per record of frame.deaths
    this.dms = Array.from({ length: 12 }, () => {
      const el = h('div', { class: 'iw-dm' }, h('i', { class: 'iw-dm__icon', html: DEATH_MARK_SVG }), h('span', { class: 'iw-dm__name' }));
      return { el, name: el.lastChild, on: false, id: 0, key: '' };
    });
    this.dmLayer = h('div', { class: 'iw-dms' }, this.dms.map((d) => d.el));
    this.jnote = h('div', { class: 'iw-jnote' });

    this.promptEl = h('div', { class: 'iw-prompt is-out' });
    this.fpsEl = h('div', { class: 'iw-fps' });
    this.bannerLayer = h('div', { class: 'iw-banners' });
    this.countLayer = h('div', { class: 'iw-counts' });
    this.splatLayer = h('div', { class: 'iw-splat-layer' });
    this.kcards = h('div', { class: 'iw-kcards' });
    this.callouts = h('div', { class: 'iw-callouts' });
    this.zcalls = h('div', { class: 'iw-zcalls' });

    el.append(this.vig, this.canvas, this.dmLayer, this.markerLayer, this.tptr, this.twTimers, this.cheerLayer, this.ddLayer, this.top, this.sp, this.subBadge, this.turfEl, this.feedEl, this.xh,
      this.kcards, this.callouts, this.zcalls, this.promptEl, this.mapDim, this.map, this.fpsEl, this.countLayer, this.bannerLayer, this.splatLayer, this.jnote, this.poisonVig, this.statusEl);
    this.root.appendChild(el);

    // judge + splatted + lineup live outside the hideable HUD so they survive setVisible(false)
    this.overLayer = h('div', { class: 'iw-hud-over' });
    colorVars(this.overLayer, 'self', '#ff8a14');
    colorVars(this.overLayer, 'enemy', '#2f5bff');
    this.root.appendChild(this.overLayer);
    this._resizeCanvas();
  }

  // ================================================================ public
  setVisible(v) {
    v = !!v;
    if (v === this._visible) return;
    this._visible = v;
    this.el.classList.toggle('is-hidden', !v);
    if (v) restartAnim(this.el, 'is-enter');
  }

  /** Practice sessions: no clock (the timer reads PRACTICE) and no team rosters. */
  setPractice(on) {
    on = !!on;
    if (this._practice === on) return;
    this._practice = on;
    this.el.classList.toggle('is-practice', on);
    this.timer.classList.remove('is-last', 'is-final');
    this._L.fin = false; this._L.lastMin = false; this._L.timer = null;
    this.timerTxt.textContent = on ? 'PRACTICE' : '3:00';
  }

  /** ScreenFX takes over the lens-ink damage smears, the low-HP vignette and the splatted desaturation. */
  attachScreenFX(fx) {
    this.fx = fx || null;
    this.el.classList.toggle('iw-hud--fx', !!fx);
    this.overLayer.classList.toggle('iw-hud--fx', !!fx);
  }

  update(dt, f) {
    if (!f) return;
    this._t += dt;
    const L = this._L;
    const t0 = f.teams && f.teams[0], t1 = f.teams && f.teams[1];
    const ca = toHex(t0 && t0.color, '#ff8a14'), cb = toHex(t1 && t1.color, '#2f5bff');
    if (ca !== L.ca) { L.ca = ca; colorVars(this.el, 'self', ca); colorVars(this.overLayer, 'self', ca); L.tankCol = null; }
    if (cb !== L.cb) { L.cb = cb; colorVars(this.el, 'enemy', cb); colorVars(this.overLayer, 'enemy', cb); }

    const me = this._local();
    const spect = !!(me && me.alive === false);
    if (spect !== L.spect) { L.spect = spect; this.el.classList.toggle('is-spectating', spect); }
    this._deaths = f.deaths || null;
    this._updTimer(f.time);
    if (f.teams) this._updSquads(this.boss.on ? this.boss.squadTeams(f.teams) : f.teams);
    this._updCrosshair(f, dt);
    this._updTank(f, dt);
    this._updSpecial(f, dt);
    this._updSubBadge(f);
    this._updTurf(dt);
    this._updHp(f.hp);
    this._updMap(f.map, dt);
    this._updMarkers(f.markers);
    this._updCheers(f.cheers);
    this._updDamageDirs(dt);
    this._updDeaths(f.deaths);
    this._updSplatJump(f.jumpQueue);
    this._updPrompt(this.boss.on ? this.boss.prompt(f.prompt) : f.prompt);
    this._updFps(f.fps, dt);
    this._updZones(f.zones, dt);
    this._updTower(f.tower, dt);
    this.lead.update(dt, f);
    this.boss.update(dt);
  }

  banner(kind = 'custom', text) {
    if (kind === 'timesup' && this.boss.timesUp()) { this.el.classList.remove('is-live'); return; }
    const k = ['ready', 'go', 'one_minute', 'timesup', 'special', 'custom'].includes(kind) ? kind : 'custom';
    const defaults = { ready: 'READY?', go: 'GO!', one_minute: '1 minute left!', timesup: "TIME'S UP!", special: 'SPECIAL!', custom: '' };
    let label = text != null && text !== '' ? String(text) : defaults[k];
    // Zone Control decided by a knockout: the time's-up horn reads KNOCKOUT! instead
    const ko = k === 'timesup' && this._zKO != null && performance.now() - this._zKO < 4000;
    if (ko && (text == null || text === '')) label = 'KNOCKOUT!';
    const group = k === 'one_minute' ? 'side' : k === 'special' ? 'low' : 'center';
    this.bannerLayer.querySelectorAll(`.iw-bn[data-g="${group}"]`).forEach((b) => b.remove());
    let el;
    if (k === 'go') {
      const drops = Array.from({ length: 10 }, (_, i) => h('i', { class: 'iw-bn__drop', style: { '--a': `${i * 36 + Math.random() * 20}deg`, '--d': `${0.8 + Math.random() * 0.7}`, '--s': `${0.5 + Math.random() * 0.8}` } }));
      el = h('div', { class: 'iw-bn iw-bn--go' },
        h('div', { class: 'iw-bn__burst' }, drops),
        h('div', { class: 'iw-bn__splat', html: splatSVG({ seed: 21, cls: 'iw-fself', r: 60, arms: 11, drops: 9 }) }),
        h('div', { class: 'iw-bn__text iw-display' }, label));
    } else if (k === 'timesup') {
      el = h('div', { class: 'iw-bn iw-bn--timesup' + (ko ? ' iw-bn--ko' : '') },
        h('div', { class: 'iw-bn__splat b', html: splatSVG({ seed: 8, cls: 'iw-fenemy', r: 60, arms: 9, drops: 6 }) }),
        h('div', { class: 'iw-bn__splat', html: splatSVG({ seed: 13, cls: 'iw-fself', r: 60, arms: 10, drops: 7 }) }),
        h('div', { class: 'iw-bn__text iw-display' }, label));
    } else if (k === 'one_minute') {
      el = h('div', { class: 'iw-bn iw-bn--minute' }, h('i', { html: GLYPHS.clock }), h('span', { class: 'iw-display' }, label));
    } else if (k === 'special') {
      el = h('div', { class: 'iw-bn iw-bn--special' }, h('div', { class: 'iw-bn__sicon', html: specialIcon(this._specialId()) }), h('div', { class: 'iw-bn__text iw-display' }, label));
    } else if (k === 'ready') {
      el = h('div', { class: 'iw-bn iw-bn--ready' }, h('div', { class: 'iw-bn__text iw-display' }, [...label].map((c, i) => h('span', { style: { '--i': i } }, c === ' ' ? ' ' : c))));
    } else {
      el = h('div', { class: 'iw-bn iw-bn--custom' }, h('div', { class: 'iw-bn__text iw-display' }, label));
    }
    el.dataset.g = group;
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    setTimeout(() => el.remove(), 4000);
    this.bannerLayer.appendChild(el);
    if (k === 'go') this.el.classList.add('is-live');
    if (k === 'timesup') this.el.classList.remove('is-live');
  }

  countdown(n) {
    if (n == null || n < 0) return;
    this.countLayer.querySelectorAll('.iw-count').forEach((c) => c.classList.add('is-old'));
    const el = h('div', { class: 'iw-count' + (n <= 3 ? ' is-hot' : '') }, h('i', { class: 'iw-count__ring' }), h('span', { class: 'iw-display' }, String(n)));
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    setTimeout(() => el.remove(), 1600);
    this.countLayer.appendChild(el);
  }

  hitMarker(kind = 'hit') {
    this.hitEl.classList.remove('is-weak');
    const dmg = this._lastHitDmg || 36;
    this._lastHitDmg = 0;
    // consecutive hits escalate (ticks grow, fly further and warm toward your ink colour); heavy hits get fat ticks
    const now = this._fxTime;
    this._hitN = now - (this._hitT ?? -9) < 0.55 ? Math.min((this._hitN || 0) + 1, 6) : 0;
    this._hitT = now;
    const s = clamp(0.8 + dmg / 90, 0.8, 1.6) * (1 + this._hitN * 0.06);
    this.hitEl.style.setProperty('--hs', s.toFixed(2));
    this.hitEl.style.setProperty('--hn', String(this._hitN));
    this.hitEl.classList.toggle('is-heavy', dmg >= 60);
    if (kind === 'kill') { this._restart(this.killEl, 'is-on'); this._restart(this.hitEl, 'is-on'); this._restart(this.ret, 'is-killflash'); }
    else { this._restart(this.hitEl, 'is-on'); this._restart(this.ret, 'is-hitflash'); }
  }

  feed({ text = '', color = '#ffffff', kind = 'info' } = {}) {
    // your own splats get the big kill card (below the crosshair) — don't repeat them as a feed pill
    if (kind === 'kill' && this._live() && !this.lab) return;
    const icon = kind === 'kill' ? SPLAT_ICON : kind === 'death' ? DEATH_ICON : kind === 'ally' ? SQUID : GLYPHS.drop;
    const el = h('div', { class: `iw-feed__item iw-feed__item--${kind}` },
      h('span', { class: 'iw-feed__icon', html: icon }),
      h('span', { class: 'iw-feed__text', html: richText(text) }));
    colorVars(el, 'c', toHex(color, '#ffffff'));
    this.feedEl.prepend(el);
    const items = [...this.feedEl.querySelectorAll('.iw-feed__item:not(.is-out)')];
    for (let i = 5; i < items.length; i++) this._expireFeed(items[i], true);
    el._t = setTimeout(() => this._expireFeed(el), 4200);
  }

  // angle (optional): screen-space direction toward the attacker (0 = right, +clockwise, y down). Without ScreenFX the
  // smears land on that edge; with ScreenFX the lens ink does the smear and the HUD only draws direction arcs.
  damage(amount = 0.3, color = '#2f5bff', angle = null) {
    if (this.fx) return;
    amount = clamp(+amount || 0);
    const hex = toHex(color, '#2f5bff');
    const n = 1 + Math.round(amount * 2.2 + Math.random() * 0.8);
    for (let i = 0; i < n; i++) this._spawnSmear(amount, hex, angle);
    while (this._smears.length > 12) this._smears.shift();
    this._addFx('smear', (dt) => this._tickSmears(dt));
  }

  // attacker / cause (optional, from the 'splatted' event): what splatted you — the attacker's main weapon, or the sub /
  // special / sea that did it (splatCause). Without them: the last killer the HUD saw and their main weapon.
  showSplatted({ by = null, byColor = '#2f5bff', respawn = 5, attacker, cause } = {}) {
    this.hideSplatted(true);
    const C = 2 * Math.PI * 44;
    const num = h('b', { class: 'iw-spl__num' }, String(Math.ceil(respawn)));
    const ring = h('div', { class: 'iw-spl__ring', html: `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="bg"/><circle cx="50" cy="50" r="44" class="fg" style="stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${C.toFixed(1)};animation-duration:${Math.max(0.1, respawn)}s"/></svg>` }, num, h('small', null, 'RESPAWN'));
    const tint = h('div', { class: 'iw-spl__tint' });
    this.el.prepend(tint);
    const killer = attacker !== undefined ? attacker : this._kills.lastKiller;
    const why = splatCause(cause, killer);
    const kw = why ? h('span', { class: `iw-spl__w iw-spl__w--${why.kind}`, html: why.icon }) : null;
    let hint = null;
    const el = h('div', { class: 'iw-spl' },
      h('div', { class: 'iw-spl__card' },
        h('div', { class: 'iw-spl__splat', html: splatSVG({ seed: 64, cls: 'iw-fby', r: 62, arms: 11, drops: 5, viewBox: 240 }) }),
        kw,
        h('div', { class: 'iw-spl__text' },
          h('div', { class: 'iw-spl__by' }, by ? 'SPLATTED BY' : 'SPLATTED!'),
          by ? h('div', { class: 'iw-spl__name iw-display' }, String(by)) : null,
          why && why.name ? h('div', { class: `iw-spl__wn iw-spl__wn--${why.kind}` }, why.tag ? h('i', { class: 'iw-spl__wk' }, why.tag) : null, why.name) : null),
        ring),
      (hint = h('div', { class: 'iw-spl__hint', html: richText('Hold [TAB] to plan a Super Jump') })));
    colorVars(el, 'by', toHex(byColor, '#2f5bff'));
    this.splatLayer.appendChild(el);
    const st = { el, tint, hint, qkey: '', end: this._fxTime + Math.max(0, respawn), num, last: Math.ceil(respawn) };
    this._splatted = st;
    this._addFx('splatted', () => {
      if (this._splatted !== st) return false;
      st.t = st.end - this._fxTime;
      const n = Math.max(0, Math.ceil(st.t));
      if (n !== st.last) {
        st.last = n;
        num.textContent = n > 0 ? String(n) : 'GO';
        num.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], BUMP);
        if (n > 0 && n <= 3) this._snd('countdown_tick', { volume: 0.5 });
      }
      return st.t > -0.5;
    });
  }

  hideSplatted(instant = false) {
    const st = this._splatted;
    if (!st) return;
    this._splatted = null;
    if (instant) { st.el.remove(); st.tint.remove(); return; }
    st.el.classList.add('is-out'); st.tint.classList.add('is-out');
    setTimeout(() => { st.el.remove(); st.tint.remove(); }, 380);
  }

  judge(opts = {}) {
    if (opts && opts.mode === 'zones') return this._judgeZones(opts);
    if (opts && opts.mode === 'tower') return this._judgeZones({ ...opts, penalty: [0, 0], icon: TOWER_ICON });   // (the same count reveal)
    return this._judgeTurf(opts);
  }

  _judgeTurf({ colors = ['#ff8a14', '#2f5bff'], percents = [50, 50], names = TEAM_NAMES } = {}) {
    return new Promise((resolve) => {
      const [pa, pb] = pct(percents[0], percents[1]);
      const ca = toHex(colors[0], '#ff8a14'), cb = toHex(colors[1], '#2f5bff');
      const share = pa + pb > 0 ? pa / (pa + pb) : 0.5;
      const winner = Math.abs(pa - pb) < 0.05 ? -1 : pa > pb ? 0 : 1;
      const numA = h('b', { class: 'iw-jd__num' }, '0.0%'), numB = h('b', { class: 'iw-jd__num' }, '0.0%');
      const barA = h('div', { class: 'iw-jd__bar a' });
      const barB = h('div', { class: 'iw-jd__bar b' });
      const edgeA = h('i', { class: 'iw-jd__edge a' }), edgeB = h('i', { class: 'iw-jd__edge b' });
      const clash = h('div', { class: 'iw-jd__clash', html: splatSVG({ seed: 99, fill: '#fff', r: 50, arms: 10, drops: 8 }) });
      const wText = winner < 0 ? "IT'S A TIE!" : `${(names[winner] || TEAM_NAMES[winner] || '').toUpperCase()} WINS!`;
      const win = h('div', { class: 'iw-jd__win' + (winner === 1 ? ' is-b' : winner === 0 ? ' is-a' : ' is-tie') },
        h('div', { class: 'iw-jd__winsplat', html: splatSVG({ seed: 5, cls: 'iw-fwin', r: 58, arms: 11, drops: 5 }) }),
        h('div', { class: 'iw-jd__wintext iw-display' }, wText));
      const el = h('div', { class: 'iw-jd' },
        h('div', { class: 'iw-jd__bg' }),
        h('div', { class: 'iw-jd__title iw-display' }, h('span', null, 'JUDGING'), h('span', { class: 'iw-jd__dots' }, h('i'), h('i'), h('i'))),
        h('div', { class: 'iw-jd__arena' },
          h('div', { class: 'iw-jd__labels' },
            h('div', { class: 'iw-jd__side a' }, h('span', { class: 'iw-jd__name' }, names[0] || TEAM_NAMES[0]), numA),
            h('div', { class: 'iw-jd__side b' }, numB, h('span', { class: 'iw-jd__name' }, names[1] || TEAM_NAMES[1]))),
          h('div', { class: 'iw-jd__track' }, h('div', { class: 'iw-jd__clip' }, barA, barB), edgeA, edgeB, clash)),
        win);
      colorVars(el, 'ja', ca); colorVars(el, 'jb', cb);
      colorVars(el, 'jw', winner === 1 ? cb : ca);
      this.overLayer.appendChild(el);
      const snd = (n) => this._snd(n);

      let t = 0, drum = false, reveal = false, punched = false, finished = false;
      const t0 = this._fxTime;
      let rollT = 0;
      const R = { a: 0, b: 0 };
      const fmt = (v) => `${v.toFixed(1)}%`;
      let trackW = 0;
      const setBars = (a, b) => {
        barA.style.transform = `scaleX(${a.toFixed(4)})`;
        barB.style.transform = `scaleX(${b.toFixed(4)})`;
        if (!trackW) trackW = barA.parentNode.offsetWidth;
        edgeA.style.transform = `translateX(${(a * trackW).toFixed(1)}px)`;
        edgeB.style.transform = `translateX(${(-b * trackW).toFixed(1)}px)`;
      };
      setBars(0, 0);
      let revealFrom = { a: 0, b: 0 };
      this._addFx('judge', (dt) => {
        t = this._fxTime - t0;
        if (t < 0.8) return true;
        if (!drum) { drum = true; snd('judge_drumroll'); el.classList.add('is-racing'); }
        if (t < 3.45) {
          const k = easeOutCubic(clamp((t - 0.8) / 1.5));
          const jitter = t > 2.3 ? Math.sin(t * 38) * 0.006 + Math.sin(t * 23) * 0.004 : 0;
          R.a = 0.43 * k + jitter; R.b = 0.43 * k - jitter;
          setBars(R.a, R.b);
          rollT += dt;
          if (rollT > 0.05) {
            rollT = 0;
            if (t > 2.3) { numA.textContent = '??.?%'; numB.textContent = '??.?%'; el.classList.add('is-drum'); }
            else { numA.textContent = fmt(10 + Math.random() * 60); numB.textContent = fmt(10 + Math.random() * 60); }
          }
          return true;
        }
        if (!reveal) {
          reveal = true; snd('judge_reveal');
          el.classList.remove('is-drum'); el.classList.add('is-reveal');
          revealFrom = { a: R.a, b: R.b };
          clash.style.left = `${(share * 100).toFixed(2)}%`;
        }
        const rk = clamp((t - 3.45) / 0.55);
        const e = easeOutBack(rk, 2.2);
        setBars(lerp(revealFrom.a, share, e), lerp(revealFrom.b, 1 - share, e));
        const nk = easeOutCubic(clamp((t - 3.45) / 0.45));
        numA.textContent = fmt(pa * nk); numB.textContent = fmt(pb * nk);
        if (!punched && t > 3.75) { punched = true; el.classList.add('is-winner', winner === 1 ? 'is-win-b' : winner === 0 ? 'is-win-a' : 'is-tie'); }
        if (!finished && t > 5.1) {
          finished = true;
          resolve({ winner });
          el.classList.add('is-out');
          setTimeout(() => el.remove(), 650);
          return false;
        }
        return true;
      });
    });
  }

  dispose() {
    removeEventListener('resize', this._onResize);
    cancelAnimationFrame(this._rafId);
    this._unsubs?.forEach((u) => u());
    this.boss?.dispose();
    this.el.remove(); this.overLayer.remove();
  }

  // ================================================================ bus: event-driven systems
  _snd(name, o) { try { this.playSound && this.playSound(name, o); } catch (e) { /* optional */ } }
  _live() { if (this.lab) return true; const m = G.match; return !!(m && !m.attract && G.mode === 'match'); }
  _local() { return this.lab ? this.lab.local : G.match?.local || null; }
  _actors() { return this.lab ? this.lab.actors || [] : G.match?.actors || G.actors || []; }
  _now() { return this._fxTime; }
  _specialId() { const a = this._local(); if (a && a.specialId) return a.specialId; const w = a && WEAPONS[a.weaponId]; return w ? w.special : 'slam'; }

  _bindBus() {
    this._unsubs = [
      on('turf', ({ actor, area }) => { if (area > 0 && actor && actor === this._local() && this._live()) { this._turfAcc += area * (MATCH.pointsPerM2 || 1); this._turfTotal += area * (MATCH.pointsPerM2 || 1); } }),
      on('hit', ({ attacker, victim, damage }) => {
        if (!this._live() || !attacker || attacker !== this._local()) return;
        this._lastHitDmg = damage || 0;
        if (victim) this._kills.dealt.set(victim, this._now());
      }),
      on('damage', ({ victim, attacker }) => {
        if (!this._live() || !victim || victim !== this._local() || !attacker || attacker === victim) return;
        this._addDamageDir(attacker);
      }),
      on('splatted', (e) => this._onSplatted(e)),
      on('respawn', ({ actor }) => { if (actor && actor === this._local()) { this._clearDamageDirs(); this._restart(this.shield, 'is-on'); } }),
      on('recoil', ({ amount }) => { if (this._live()) { this._bloom = Math.min(1, this._bloom + 0.18 + (amount || 0) * 6); this._tank.wobble = Math.min(1, this._tank.wobble + 0.25); } }),
      on('weapon:fire', ({ actor, hand }) => {
        if (!actor || actor !== this._local() || !this._live()) return;
        this._kick = 1; this._tank.wobble = Math.min(1, this._tank.wobble + 0.06);
        if (this._L.kind === 'dualies' && this._twin) { const el = this._twin[hand ? 1 : 0]; if (el && el.animate) el.animate(TWIN_KICK, TWIN_KICK_T); }
        if (this._L.kind === 'mitts' && this._mitt) { const el = this._mitt[hand ? 1 : 0]; if (el && el.animate) el.animate(MITT_KICK[hand ? 1 : 0], MITT_KICK_T); }
      }),
      on('lowink', ({ actor }) => { if (actor === this._local() && this._live()) { this._tank.empty = 0.45; this._restart(this.tank, 'is-empty'); } }),
      on('special:ready', ({ actor }) => { if (actor === this._local() && this._live()) this._restart(this.sp, 'is-flare'); }),
      on('superjump', ({ actor, phase, to }) => { if (actor === this._local() && phase === 'charge' && this._live()) this._snd('ui_confirm', { volume: 0.6 }); void to; }),
      on('sub:cantuse', ({ actor, kind }) => { if (actor && actor === this._local() && this._live()) this._cantUse(kind); }),
      on('zones:control', (e) => this._zControl(e)),
      on('zones:penalty', (e) => this._zPenalty(e)),
      on('zones:active', (e) => this._zActive(e)),
      on('zones:overtime', (e) => this._zOvertime(e)),
      on('zones:end', (e) => this._zEnd(e)),
      on('zones:zone', (e) => this._zZone(e)),
      on('tower:control', (e) => this._twControl(e)),
      on('tower:checkpoint', (e) => this._twCheckpoint(e)),
      on('tower:contest', (e) => this._twContest(e)),
      on('tower:overtime', (e) => this._twLive() && this._zOvertime(e)),
      on('tower:end', (e) => this._zEnd(e)),
      on('match:state', ({ state, match }) => {
        if (!match || match.attract) return;
        if (state === 'intro') this._startMatchHud(match);
        if (state === 'playing') this.el.classList.add('is-live');
        if (state === 'finish' || state === 'judge') { this.el.classList.remove('is-live'); this._clearDamageDirs(); }
      }),
    ];
  }

  _startMatchHud(match) {
    this._turfAcc = 0; this._turfTotal = 0; this._turfShown = 0; this._turfT = 0;
    this._kills = { times: [], streak: 0, first: false, lastKiller: null, dealt: new Map(), perActor: new Map() };
    this._clearDamageDirs();
    this.kcards.innerHTML = ''; this.callouts.innerHTML = ''; this.tpops.innerHTML = '';
    this._updDeaths(null); this.jnote.classList.remove('is-on');
    this.zcalls.innerHTML = ''; this._zObj = null; this._zKO = null; this._zTick = [null, null]; this._L.zKey = null;
    this._L.tOn = null; this._L.tCps = null; this._twContestT = 0;
    G.music?.setOvertime?.(false);
    this.el.classList.remove('is-live');
    this._L.turfTxt = null;
    this.turfNum.textContent = '0';
    this.boss.setMode(!!match && match.mode === 'boss', match && match.boss);
    this._lineup(match);
  }

  _onSplatted({ victim, attacker }) {
    if (!this._live() || !victim) return;
    const me = this._local();
    const K = this._kills;
    const now = this._now();
    // per-actor streaks (for "shutdown" / revenge bookkeeping)
    if (!K.perActor) K.perActor = new Map();
    const vStreak = K.perActor.get(victim) || 0;
    K.perActor.set(victim, 0);
    if (attacker && attacker !== victim) K.perActor.set(attacker, (K.perActor.get(attacker) || 0) + 1);
    if (victim === me) {
      K.lastKiller = attacker || null;
      K.streak = 0;
      this._clearDamageDirs();
      return;
    }
    if (attacker && attacker === me) {
      K.times = K.times.filter((t) => now - t < 4.2);
      K.times.push(now);
      K.streak++;
      const multi = K.times.length;
      this._killCard(victim, 'kill');
      // callouts, most important first
      let call = null, sub = null;
      const enemies = this._actors().filter((a) => a.team !== me.team);
      if (enemies.length >= 4 && enemies.every((a) => !a.alive)) { call = 'WIPEOUT!'; sub = 'The whole team is splatted'; }
      else if (multi >= 2) call = STREAKS[Math.min(4, multi)];
      else if (!K.first) { call = 'FIRST SPLAT!'; }
      else if (K.lastKiller && victim === K.lastKiller) { call = 'REVENGE!'; K.lastKiller = null; }
      else if (vStreak >= 3) { call = 'SHUTDOWN!'; sub = `Ended ${victim.name}'s streak`; }
      else if (K.streak >= 3 && K.streak % 2 === 1) { call = `SPLAT STREAK ×${K.streak}`; }
      K.first = true;
      if (call) this._callout(call, sub, multi >= 3 || call === 'WIPEOUT!');
      return;
    }
    if (me && attacker && attacker.team === me.team && K.dealt.has(victim) && now - K.dealt.get(victim) < 4) {
      this._killCard(victim, 'assist');
      K.dealt.delete(victim);
    }
  }

  // ---------------------------------------------------------------- kill / assist cards + callouts
  _killCard(victim, kind) {
    const col = toHex(G.teamHex?.[victim.team], kind === 'assist' ? '#ffffff' : (this._L.cb || '#2f5bff'));
    const card = h('div', { class: `iw-kcard iw-kcard--${kind}` },
      h('span', { class: 'iw-kcard__splat', html: splatSVG({ seed: 30 + ((Math.random() * 40) | 0), cls: 'iw-fself', r: 56, arms: 9, drops: 4 }) }),
      h('span', { class: 'iw-kcard__w', html: weaponIcon(kindOf(victim.weaponId)) }),
      h('span', { class: 'iw-kcard__txt' },
        h('small', null, kind === 'assist' ? 'ASSIST' : 'SPLATTED'),
        h('b', null, victim.name || 'Squidkid')));
    colorVars(card, 'v', col);
    this.kcards.prepend(card);
    const cards = [...this.kcards.children].filter((c) => !c._out);
    for (let i = 2; i < cards.length; i++) this._dropCard(cards[i], true);
    card._t = setTimeout(() => this._dropCard(card), kind === 'assist' ? 1700 : 2200);
    this.el.classList.add('has-cards');
    if (kind === 'assist') this._snd('hit_marker', { volume: 0.4, pitch: 1.3 });
  }
  _dropCard(card, fast) {
    if (card._out) return;
    card._out = true;
    clearTimeout(card._t);
    card.classList.add('is-out');
    setTimeout(() => { card.remove(); if (!this.kcards.children.length) this.el.classList.remove('has-cards'); }, fast ? 200 : 420);
  }
  _callout(text, sub, big) {
    this.callouts.querySelectorAll('.iw-call').forEach((c) => c.remove());
    const el = h('div', { class: 'iw-call' + (big ? ' is-big' : '') },
      h('span', { class: 'iw-call__ribbon' }),
      h('span', { class: 'iw-call__txt iw-display' }, text),
      sub ? h('small', { class: 'iw-call__sub' }, sub) : null);
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    setTimeout(() => el.remove(), 3200);
    this.callouts.appendChild(el);
    this._snd(big ? 'special_ready' : 'ui_confirm', { volume: big ? 0.7 : 0.55 });
  }

  // ---------------------------------------------------------------- intro lineup
  _lineup(match) {
    this.overLayer.querySelectorAll('.iw-lineup').forEach((e) => e.remove());
    const actors = (match && match.actors) || this._actors();
    if (!actors.length) return;
    const names = (G.game && G.game.palette && G.game.palette.names) || TEAM_NAMES;
    const col = (t) => toHex(G.teamHex?.[t], t ? '#2f5bff' : '#ff8a14');
    const side = (t) => {
      const list = actors.filter((a) => a.team === t);
      const wrap = h('div', { class: `iw-lu__team iw-lu__team--${t ? 'b' : 'a'}` },
        h('div', { class: 'iw-lu__name iw-display' }, (names[t] || TEAM_NAMES[t] || '').toUpperCase()),
        list.map((a, i) => h('div', { class: 'iw-lu__card' + (a.isLocal ? ' is-self' : ''), style: { '--i': i } },
          h('span', { class: 'iw-lu__w', html: weaponIcon(kindOf(a.weaponId)) }),
          h('span', { class: 'iw-lu__txt' }, h('b', null, a.name), h('small', null, (WEAPONS[a.weaponId] || {}).name || '')),
          a.isLocal ? h('em', null, 'YOU') : null)));
      colorVars(wrap, 't', col(t));
      return wrap;
    };
    if (this.boss.on) {
      // boss mode: the whole squad (two columns) vs HULLBREAKER
      const squad = side(0);
      squad.classList.add('is-squad');
      squad.querySelector('.iw-lu__name').textContent = 'YOUR SQUAD';
      const foe = h('div', { class: 'iw-lu__team iw-lu__team--b iw-lu__foe' },
        h('div', { class: 'iw-lu__name iw-display' }, BOSS_NAME),
        h('div', { class: 'iw-lu__bosscard' }, h('span', { class: 'iw-lu__bossart', html: bossEmblem() }), h('small', null, BOSS_EPITHET)));
      colorVars(foe, 't', col(1));
      const bel = h('div', { class: 'iw-lineup is-boss' }, squad,
        h('div', { class: 'iw-lu__vs' }, h('span', { class: 'iw-lu__vsplat', html: splatSVG({ seed: 77, fill: '#fff', r: 56, arms: 10, drops: 6 }) }), h('span', { class: 'iw-display' }, 'VS')),
        foe);
      this.overLayer.appendChild(bel);
      // out before HULLBREAKER bursts up (boss time 1.8 s) so the title card has the stage
      setTimeout(() => bel.classList.add('is-out'), 1650);
      setTimeout(() => bel.remove(), 2200);
      return;
    }
    const el = h('div', { class: 'iw-lineup' },
      side(this._myTeam()),
      h('div', { class: 'iw-lu__vs' }, h('span', { class: 'iw-lu__vsplat', html: splatSVG({ seed: 77, fill: '#fff', r: 56, arms: 10, drops: 6 }) }), h('span', { class: 'iw-display' }, 'VS')),
      side(1 - this._myTeam()));
    this.overLayer.appendChild(el);
    [0, 1, 2, 3].forEach((i) => setTimeout(() => { if (el.isConnected) this._snd('ui_hover', { volume: 0.5, pitch: 0.9 + i * 0.08 }); }, 250 + i * 90));
    setTimeout(() => el.classList.add('is-out'), 2900);
    setTimeout(() => el.remove(), 3500);
  }

  // ---------------------------------------------------------------- damage direction arcs
  _addDamageDir(attacker) {
    let d = this._dd.find((x) => x.a === attacker);
    if (!d) {
      if (this._dd.length >= 6) { const old = this._dd.shift(); old.el.remove(); }
      const el = h('div', { class: 'iw-dd', html: `<svg viewBox="-110 -110 220 220" aria-hidden="true"><path class="o" d="${DD_PATH}"/><path class="f" d="${DD_PATH}"/></svg>` });
      colorVars(el, 'c', toHex(G.teamHex?.[attacker.team], this._L.cb || '#2f5bff'));
      this.ddLayer.appendChild(el);
      d = { a: attacker, el, t: 0, ang: null, px: 0, pz: 0 };
      this._dd.push(d);
    }
    d.t = 0;
    if (attacker.pos) { d.px = attacker.pos.x; d.pz = attacker.pos.z; }
    this._restart(d.el, 'is-hit');
  }
  _clearDamageDirs() { for (const d of this._dd) d.el.remove(); this._dd = []; }
  _updDamageDirs(dt) {
    if (!this._dd.length) return;
    const cam = G.camera;
    let fx = 0, fz = 1, rx = 1, rz = 0, cx = 0, cz = 0;
    if (cam && cam.matrixWorld) {
      const e = cam.matrixWorld.elements;
      fx = -e[8]; fz = -e[10]; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      rx = e[0]; rz = e[2]; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
      cx = cam.position.x; cz = cam.position.z;
    }
    for (let i = this._dd.length - 1; i >= 0; i--) {
      const d = this._dd[i];
      d.t += dt;
      if (d.t > 1.6) { d.el.remove(); this._dd.splice(i, 1); continue; }
      if (d.a && d.a.pos && d.a.alive !== false) { d.px = d.a.pos.x; d.pz = d.a.pos.z; }
      const vx = d.px - cx, vz = d.pz - cz;
      const ang = Math.atan2(vx * rx + vz * rz, vx * fx + vz * fz);
      const o = d.t < 1.0 ? 1 : 1 - (d.t - 1.0) / 0.6;
      d.el.style.transform = `rotate(${ang.toFixed(3)}rad)`;
      d.el.style.opacity = o.toFixed(2);
    }
  }

  // ---------------------------------------------------------------- death markers
  // frame.deaths = main.js's pooled records { on, id, team, name, ally, k (fade 1 → 0), vis, sx, sy, sc, mx, my };
  // record i ↔ pool element i, so nothing is created per frame. World view: a squid-skull in the victim's ink floating
  // over the spot, smaller with distance; teammates' names under theirs for the first moments.
  _updDeaths(list) {
    const live = this._live();
    for (let i = 0; i < this.dms.length; i++) {
      const e = this.dms[i], d = list && list[i];
      if (!(live && d && d.on && d.vis)) { if (e.on) { e.on = false; e.el.style.display = 'none'; } continue; }
      if (!e.on) { e.on = true; e.el.style.display = 'block'; }
      if (e.id !== d.id) {
        e.id = d.id;
        e.el.style.setProperty('--c', this._teamHex(d.team));
        const named = !!(d.ally && !d.local);          // a teammate's name under theirs (not your own)
        e.el.classList.toggle('is-ally', named);
        e.name.textContent = named ? d.name : '';
        this._restart(e.el, 'is-new');
      }
      const key = `${d.sx.toFixed(1)}|${d.sy.toFixed(1)}|${d.sc.toFixed(3)}|${d.k.toFixed(2)}`;
      if (key === e.key) continue;
      e.key = key;
      e.el.style.transform = `translate3d(${d.sx.toFixed(1)}px,${d.sy.toFixed(1)}px,0) scale(${d.sc.toFixed(3)})`;
      e.el.style.opacity = d.k.toFixed(2);
    }
  }
  // minimap: the same records, placed in canvas space under the player dots
  _updMapDeaths(bw, bh) {
    const list = this._deaths;
    for (let i = 0; i < this.mapDms.length; i++) {
      const el = this.mapDms[i], d = list && list[i];
      if (!(d && d.on)) { if (el._on) { el._on = false; el.style.display = 'none'; } continue; }
      if (!el._on) { el._on = true; el.style.display = 'block'; }
      if (el._id !== d.id) { el._id = d.id; el.style.setProperty('--c', this._teamHex(d.team)); this._restart(el, 'is-new'); }
      const key = `${(clamp(d.mx) * bw).toFixed(1)}|${(clamp(d.my) * bh).toFixed(1)}|${d.k.toFixed(2)}`;
      if (key === el._key) continue;
      el._key = key;
      el.style.transform = `translate3d(${(clamp(d.mx) * bw).toFixed(1)}px,${(clamp(d.my) * bh).toFixed(1)}px,0)`;
      el.style.opacity = d.k.toFixed(2);
    }
  }
  _teamHex(t) { return toHex(G.teamHex?.[t], t ? (this._L.cb || '#2f5bff') : (this._L.ca || '#ff8a14')); }

  // ---------------------------------------------------------------- Super Jump planned while splatted
  // The splat screen's line under the card: "Hold TAB to plan a Super Jump" until a target is picked on the TAB map,
  // then "SUPER JUMP → Name — on respawn" (frame.jumpQueue = the player controller's plan, main.js).
  _updSplatJump(q) {
    const st = this._splatted;
    if (!st || !st.hint) return;
    const key = q ? `${q.kind}|${q.name}` : '';
    if (key === st.qkey) return;
    const had = !!st.qkey;
    st.qkey = key;
    const hint = st.hint;
    hint.classList.toggle('is-queued', !!q);
    if (!q) { hint.innerHTML = richText('Hold [TAB] to plan a Super Jump'); return; }
    hint.textContent = '';
    hint.append(
      h('i', { class: 'iw-spl__sj', html: SJ_ICON }),
      h('b', { class: 'iw-spl__sjk' }, 'SUPER JUMP'),
      h('span', { class: 'iw-spl__sja' }, '\u2192'),
      h('strong', { class: 'iw-spl__sjn iw-display' }, q.name),
      h('em', { class: 'iw-spl__sjw' }, '\u2014 on respawn'));
    hint.animate([{ scale: had ? '1.08' : '1.2' }, { scale: '1' }], BUMP);
  }

  /** A short note over the lower screen — e.g. a Super Jump planned while splatted that had to be called off. */
  jumpNote(text) {
    const el = this.jnote;
    el.textContent = '';
    el.append(h('i', { html: SJ_ICON }), h('span', null, String(text || '')));
    this._restart(el, 'is-on');
    clearTimeout(this._jnT);
    this._jnT = setTimeout(() => el.classList.remove('is-on'), 2800);
  }

  // ================================================================ Zone Control (frame.zones + zones:* events)
  // frame.zones = ZoneControl.state() + { viewer } (main.js). Counters: team 0 on the left (self colours), team 1 on the
  // right, each showing its count (ceil'd; the score), a "+N" penalty badge and a bar that fills toward the timer as the
  // count closes on 0 (the striped block ahead of it = penalty to count off before the count moves again). The chip under the timer names the operational
  // objective (CENTRE / YOUR SIDE / ENEMY SIDE, relative to the viewer), colours each of its zones by holder and shows
  // each zone's live ink share (the ticks = the 80 % needed to take it); then the rotation hint or the OVERTIME badge.
  _zMe() { const a = this._local(); return a && (a.team === 0 || a.team === 1) ? a.team : 0; }
  _zLive() { return this._live() && !!(this.lab || (G.match && (G.match.zones || G.match.tower))); }   // (Tower Command shares the banners)
  _zHex(t) { return t === 0 || t === 1 ? toHex(G.teamHex?.[t], t ? '#2f5bff' : '#ff8a14') : '#ffffff'; }
  _zLabel(id, me) { return id === 'center' ? ZONE_LABEL.center : (id === 'sideA' ? 0 : 1) === me ? ZONE_LABEL.home : ZONE_LABEL.away; }

  _updZones(z, dt) {
    const L = this._L;
    const on = !!z;
    if (on !== L.zOn) {
      L.zOn = on;
      this.el.classList.toggle('is-zones', on);
      L.zKey = L.zc0 = L.zc1 = null; L.zSh = L.zOt = L.zOff = L.zG = null;
    }
    if (!on) return;
    const me = z.viewer === 0 || z.viewer === 1 ? z.viewer : this._zMe();
    this._zObj = z.active;
    // ---- team counters
    for (let t = 0; t < 2; t++) {
      const el = this.zc[t ^ me];   // (the HUD is drawn from your side: your team's badge left, in your colour)
      if (!el._num) { el._num = el.querySelector('.iw-zc__num'); el._pb = el.querySelector('.iw-zc__pb'); }
      // count (the score) and penalty (apart: not part of the score) as whole numbers, like the judge and results
      const cnt = Math.max(0, Math.ceil((z.count?.[t] ?? 100) - 1e-6));
      const pen = Math.max(0, Math.ceil((z.penalty?.[t] ?? 0) - 1e-6));
      const hold = z.owner === t;
      const key = `${cnt}|${pen}|${hold ? 1 : 0}`, lk = 'zc' + t;
      if (L[lk] === key) continue;
      const prev = L[lk] ? L[lk].split('|').map(Number) : null;
      L[lk] = key;
      el._num.textContent = String(cnt);
      if (pen > 0) el._pb.textContent = `+${pen}`;   // (keeps the last value while it fades out)
      el.classList.toggle('has-pen', pen > 0);
      el.style.setProperty('--p', clamp((100 - cnt) / 100).toFixed(3));
      el.style.setProperty('--q', clamp(pen / 100).toFixed(3));
      el.classList.toggle('is-hold', hold);
      const tot = cnt + pen;
      el.classList.toggle('is-hot', tot <= 10);
      if (!prev) continue;
      const ptot = prev[0] + prev[1];
      if (pen > prev[1]) this._restart(el, 'is-penalised');
      else if (tot < ptot) {
        (cnt < prev[0] ? el._num : el._pb).animate([{ transform: 'translateY(-12%) scale(1.14)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.34,1.8,.64,1)' });
        if (tot <= 10 && tot > 0) this._snd('zone_tick', { volume: t === me ? 0.55 : 0.4, pitch: t === me ? 1.12 : 0.9 });
      }
      if (hold && !prev[2]) this._restart(el, 'is-took');
    }
    // ---- objective chip
    const zs = z.zones || [];
    const zkey = `${z.active}|${me}|${z.owner}|` + zs.map((q) => `${q.owner}:${Math.round((q.share?.[0] || 0) * 100)}:${Math.round((q.share?.[1] || 0) * 100)}`).join(',');
    if (zkey !== L.zKey) {
      L.zKey = zkey;
      if (this.zoIcons.children.length !== zs.length) {
        this.zoIcons.innerHTML = '';
        for (let i = 0; i < zs.length; i++) {
          this.zoIcons.appendChild(h('span', { class: 'iw-zo__z' },
            h('i', { class: 'iw-zo__zi', html: ZONE_ICON }),
            h('span', { class: 'iw-zo__sh' }, h('i', { class: 'a' }), h('i', { class: 'b' }), h('em', { class: 'ta' }), h('em', { class: 'tb' }))));
        }
      }
      zs.forEach((q, i) => {
        const el = this.zoIcons.children[i];
        const col = q.owner === 0 || q.owner === 1 ? this._zHex(q.owner) : ZONE_NEUTRAL;
        if (el._col !== col) { el._col = col; el.style.setProperty('--zc', col); }
        el.style.setProperty('--sa', clamp(q.share?.[0] || 0).toFixed(3));
        el.style.setProperty('--sb', clamp(q.share?.[1] || 0).toFixed(3));
        el.classList.toggle('is-held', q.owner === 0 || q.owner === 1);
      });
      this.zoLabel.textContent = this._zLabel(z.active, me);
      const held = z.owner === 0 || z.owner === 1;
      this.zo.style.setProperty('--zo', held ? this._zHex(z.owner) : '#ffffff');
      this.zo.classList.toggle('is-held', held);
    }
    // ---- rotation hint (last 5 s) / overtime badge
    const sh = !z.overtime && z.winner == null && z.nextSwap > 0 && z.nextSwap <= 5;
    if (sh !== L.zSh) { L.zSh = sh; this.zo.classList.toggle('is-shift', sh); L.zShN = null; }
    if (sh) {
      const n = Math.ceil(z.nextSwap);
      if (n !== L.zShN) { L.zShN = n; this.zoShiftN.textContent = String(n); this.zoShiftN.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], BUMP); }
    }
    const ot = !!z.overtime;
    if (ot !== L.zOt) { L.zOt = ot; this.zo.classList.toggle('is-ot', ot); L.zG = null; }
    if (ot) {
      const c = z.count || [0, 0];
      const lose = c[0] === c[1] ? -1 : c[0] > c[1] ? 0 : 1;
      const off = lose >= 0 && z.owner !== lose;
      const g = off ? clamp(1 - (z.neutralT || 0) / (ZONES.overtimeGrace || 10)) : 1;
      if (off !== L.zOff) { L.zOff = off; this.zo.classList.toggle('is-otoff', off); }
      if (lose !== L.zLose) { L.zLose = lose; this.zo.style.setProperty('--zl', lose >= 0 ? this._zHex(lose) : '#ffffff'); }
      if (L.zG == null || Math.abs(g - L.zG) > 0.004) { L.zG = g; this.zoOtBar.firstChild.style.transform = `scaleX(${g.toFixed(3)})`; }
    }
    void dt;
  }

  // ---- Tower Command (frame.tower = TowerCommand.state() + viewer + onTower): the score badges (the Zone Control
  // ones: count 100 → 0, fill toward the timer, the tower tab while that team controls it), the track under the timer
  // and the pointer to the tower
  _twLive() { return this._live() && !!(G.match && G.match.tower); }
  _updTower(z, dt) {
    const L = this._L;
    const on = !!z;
    if (on !== L.tOn) {
      L.tOn = on;
      this.el.classList.toggle('is-tower', on);
      for (const el of this.zc) { const hold = el.querySelector('.iw-zc__hold'); if (hold) hold.innerHTML = on ? TOWER_ICON : ZONE_ICON; }
      L.zc0 = L.zc1 = L.tKey = L.tCps = L.tSt = null;
    }
    if (!on) { if (L.tpOn) { L.tpOn = false; this.tptr.classList.remove('is-on'); } if (L.twtKey) { L.twtKey = null; this.twTimers.replaceChildren(); } return; }
    const me = z.viewer === 0 || z.viewer === 1 ? z.viewer : this._zMe(), them = 1 - me;
    // ---- score badges (your team's on the left)
    for (let t = 0; t < 2; t++) {
      const el = this.zc[t ^ me];
      if (!el._num) { el._num = el.querySelector('.iw-zc__num'); el._pb = el.querySelector('.iw-zc__pb'); }
      const cnt = Math.max(0, Math.round(z.score?.[t] ?? 100)), hold = z.owner === t;
      const key = `${cnt}|${hold ? 1 : 0}`, lk = 'zc' + t;
      if (L[lk] === key) continue;
      const prev = L[lk] ? L[lk].split('|').map(Number) : null;
      L[lk] = key;
      el._num.textContent = String(cnt);
      el.classList.remove('has-pen');
      el.style.setProperty('--p', clamp((100 - cnt) / 100).toFixed(3));
      el.style.setProperty('--q', '0');
      el.classList.toggle('is-hold', hold);
      el.classList.toggle('is-hot', cnt <= 10);
      if (!prev) continue;
      if (cnt < prev[0]) {
        el._num.animate([{ transform: 'translateY(-12%) scale(1.14)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.34,1.8,.64,1)' });
        if (cnt <= 10 && cnt > 0) this._snd('zone_tick', { volume: t === me ? 0.55 : 0.4, pitch: t === me ? 1.12 : 0.9 });
      }
      if (hold && !prev[1]) this._restart(el, 'is-took');
    }
    // ---- the track: [their goal (in your half) … centre … your goal (in theirs)]
    const lenMine = z.len[me], lenTheirs = z.len[them], span = lenMine + lenTheirs || 1;
    const X = (sMe) => clamp((sMe + lenTheirs) / span);
    const sMe = me === 0 ? z.s : -z.s;
    if (L.tCps == null) {
      L.tCps = 1;
      this.twCps.innerHTML = '';
      this.twTrack.style.setProperty('--mid', X(0).toFixed(4));
      for (const c of z.checkpoints) {
        const d = h('i', { class: 'iw-tw__cp' + (c.team === me ? ' is-mine' : ' is-theirs') });
        d.style.setProperty('--x', X(c.team === me ? c.d : -c.d).toFixed(4));
        this.twCps.appendChild(d);
      }
    }
    z.checkpoints.forEach((c, i) => { const d = this.twCps.children[i]; if (d && d._clr !== c.cleared) { d._clr = c.cleared; d.classList.toggle('is-clear', c.cleared); } });
    this.twTower.style.setProperty('--x', X(sMe).toFixed(4));
    this.twBest[0].style.setProperty('--x', X(z.best[me]).toFixed(4));
    this.twBest[1].style.setProperty('--x', X(-z.best[them]).toFixed(4));
    const side = z.owner === me ? 'mine' : z.owner === them ? 'theirs' : 'neutral';
    const n = z.owner >= 0 ? z.riders[z.owner] : 0;
    const nx = z.next && z.next.at && z.owner === z.next.team ? z.next : null;
    const tkey = `${side}|${n}|${z.contested ? 1 : 0}|${z.moving ? 1 : 0}|${nx ? 1 : 0}`;
    if (tkey !== L.tKey) {
      L.tKey = tkey;
      this.twTower.dataset.side = side;
      this.tw.dataset.side = side;
      this.twTower.classList.toggle('is-contested', !!z.contested);
      this.twTower.classList.toggle('is-moving', !!z.moving);
      this.twTower.classList.toggle('is-cp', !!nx);
      [...this.twTower.querySelector('.iw-tw__pips').children].forEach((p, i) => p.classList.toggle('is-on', i < n));
    }
    if (nx) this.twTower.style.setProperty('--k', clamp(1 - nx.left / (nx.dur || 1)).toFixed(3));
    // ---- the status line
    let st = '';
    if (nx) st = `CHECKPOINT ${Math.max(0, Math.ceil(nx.left - 1e-6))}`;
    else if (z.contested) st = 'CONTESTED';
    else if (z.returning) st = 'ROLLING BACK';
    else if (z.homing) st = `ROLLING HOME · ${Math.max(0, Math.ceil(TOWER.idleNeutral - z.emptyT))}`;
    else if (z.owner >= 0 && n === 0 && z.emptyT > 0.3) st = `EMPTY · ${Math.max(0, Math.ceil(TOWER.idleNeutral - z.emptyT))}`;
    if (st !== L.tSt) {
      L.tSt = st;
      this.twStatus.textContent = st;
      this.tw.classList.toggle('has-status', !!st);
    }
    const ot = !!z.overtime;
    if (ot !== L.tOt) { L.tOt = ot; this.tw.classList.toggle('is-ot', ot); }
    this._updTowerPtr(z);
    this._updTowerTimers(z, me);
    void dt;
  }
  // the countdown over each uncleared checkpoint: the seconds left in a ring that sweeps like a clock in quarters —
  // the team's ink for seconds that score, grey for dummy seconds (a refilled timer's share already scored) — and an
  // outer ring running down the grace while the tower is off a half-cleared one
  _updTowerTimers(z, me) {
    const L = this._L, box = this.twTimers, m = G.match, cps = z.checkpoints || [];
    const key = cps.length + ':' + (m && (m.id || m.startedAt || 1));
    if (L.twtKey !== key || !L.twt) {
      L.twtKey = key;
      const C = 2 * Math.PI * 19, G2 = 2 * Math.PI * 23;
      box.replaceChildren(...cps.map(() => {
        const e = h('div', { class: 'iw-twt' });
        e.innerHTML = `<svg viewBox="0 0 56 56" aria-hidden="true"><circle class="iw-twt__bg" cx="28" cy="28" r="19"/>` +
          `<circle class="iw-twt__dum" cx="28" cy="28" r="19" stroke-dasharray="0 ${C}"/><circle class="iw-twt__done" cx="28" cy="28" r="19" stroke-dasharray="0 ${C}"/>` +
          `<circle class="iw-twt__run" cx="28" cy="28" r="19" stroke-dasharray="0 ${C}"/><circle class="iw-twt__grace" cx="28" cy="28" r="23.5" stroke-dasharray="0 ${G2}"/>` +
          [0, 1, 2, 3].map((q) => { const a = (q * Math.PI) / 2, x = 28 + Math.sin(a) * 21.5, y = 28 - Math.cos(a) * 21.5, x2 = 28 + Math.sin(a) * 16.5, y2 = 28 - Math.cos(a) * 16.5; return `<line class="iw-twt__tick" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`; }).join('') +
          `</svg><b></b>`;
        return e;
      }));
      L.twt = [...box.children].map((e) => ({ e, dum: e.querySelector('.iw-twt__dum'), done: e.querySelector('.iw-twt__done'), run: e.querySelector('.iw-twt__run'), grace: e.querySelector('.iw-twt__grace'), num: e.lastChild, sig: '', n: -1, C, G2, on: false }));
    }
    const cam = G.rig?.gameCam || G.camera;
    const live = !!cam && !!m && (m.state === 'playing' || m.state === 'intro') && z.winner == null && !this.el.classList.contains('is-mapopen');
    const W = this.el.clientWidth || window.innerWidth, H = this.el.clientHeight || window.innerHeight;
    // only the checkpoint each team is heading for (its nearest uncleared one) — the rest wait their turn
    const next = [-1, -1];
    cps.forEach((c, i) => { if (!c.cleared && (next[c.team] < 0 || c.d < cps[next[c.team]].d)) next[c.team] = i; });
    cps.forEach((c, i) => {
      const T = L.twt[i];
      if (!T) return;
      let show = live && !c.cleared && !!c.pos && next[c.team] === i;
      let p = null;
      if (show) { p = this._project(cam, c.pos[0], c.pos[1] + 6.3, c.pos[2]); show = !!p && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1; }
      if (show !== T.on) { T.on = show; T.e.classList.toggle('is-on', show); }
      if (!show) return;
      const cp = cam.position, dist = Math.hypot(cp.x - c.pos[0], cp.y - c.pos[1], cp.z - c.pos[2]);
      const k = Math.max(0.55, Math.min(1.15, 24 / Math.max(1, dist)));
      T.e.style.transform = `translate(${((p.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((0.5 - p.y * 0.5) * H).toFixed(1)}px) scale(${k.toFixed(3)})`;
      const prog = Math.max(0, Math.min(1, 1 - c.left / (c.dur || 1))), dum = Math.max(0, Math.min(1, c.dummy || 0));
      const grace = !c.at && c.lost > 0 && prog > 0 ? Math.max(0, 1 - c.lost / (z.grace || 5)) : 0;
      const active = c.at || prog > 0 || grace > 0;
      const sig = `${c.team === me ? 'm' : 't'}|${(prog * 400) | 0}|${(dum * 400) | 0}|${(grace * 200) | 0}|${active ? 1 : 0}`;
      if (sig !== T.sig) {
        T.sig = sig;
        T.e.dataset.side = c.team === me ? 'mine' : 'theirs';
        T.e.classList.toggle('is-active', active);
        T.e.classList.toggle('is-grace', grace > 0);
        const C = T.C, sw = Math.min(prog, dum);
        T.dum.setAttribute('stroke-dasharray', `${(dum * C).toFixed(2)} ${C}`);                     // the dummy share, faint
        T.done.setAttribute('stroke-dasharray', `${(sw * C).toFixed(2)} ${C}`);                      // dummy seconds re-cleared
        T.run.setAttribute('stroke-dasharray', prog > dum ? `0 ${(dum * C).toFixed(2)} ${((prog - dum) * C).toFixed(2)} ${C}` : `0 ${C}`);   // seconds that score
        T.grace.setAttribute('stroke-dasharray', `${(grace * T.G2).toFixed(2)} ${T.G2}`);
      }
      const n = Math.max(0, Math.ceil(c.left - 1e-6));
      if (n !== T.n) { T.n = n; T.num.textContent = String(n); }
    });
  }
  // the pointer: over the tower when it's on screen, pinned to the screen edge (arrow out) when it isn't
  _updTowerPtr(z) {
    const L = this._L, el = this.tptr, m = G.match;
    const show = !z.onTower && z.winner == null && !!m && (m.state === 'playing' || m.state === 'intro') && !this.el.classList.contains('is-mapopen');
    if (show !== L.tpOn) { L.tpOn = show; el.classList.toggle('is-on', show); }
    if (!show) return;
    const cam = G.rig?.gameCam || G.camera;
    if (!cam) return;
    const W = this.el.clientWidth || window.innerWidth, H = this.el.clientHeight || window.innerHeight;
    const p = this._project(cam, z.pos[0], z.top + 3, z.pos[2]);
    if (!p) return;
    let x = p.x, y = p.y;
    const behind = p.z > 1;
    const inside = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.8;
    if (!inside) {
      if (behind) { x = -x; y = -y; if (Math.abs(x) < 1e-3 && Math.abs(y) < 1e-3) y = -1; }
      const k = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.78, 1e-6);
      x /= k; y /= k;
    }
    const sx = (x * 0.5 + 0.5) * W, sy = (0.5 - y * 0.5) * H;
    el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    el.classList.toggle('is-edge', !inside);
    if (!inside) el.style.setProperty('--rot', `${Math.atan2(-y, x).toFixed(3)}rad`);
    const side = z.owner === z.viewer ? 'mine' : z.owner >= 0 ? 'theirs' : 'neutral';
    if (el.dataset.side !== side) el.dataset.side = side;
    const a = this._local();
    if (a) {
      const d = Math.round(Math.hypot(a.pos.x - z.pos[0], a.pos.z - z.pos[2]));
      if (d !== L.tpD) { L.tpD = d; el.lastChild.textContent = `${d}m`; }
    }
  }
  _twControl({ owner, prev }) {
    if (!this._twLive()) return;
    const me = this._zMe(), them = 1 - me, icon = TOWER_ICON;
    if (owner === me) { this._zCall("WE'VE GOT THE TOWER!", { team: me, icon }); this._snd('zone_ours'); }
    else if (owner === them) { this._zCall("THEY'VE GOT THE TOWER!", { team: them, kind: 'bad', icon }); this._snd('zone_theirs'); }
    else if (prev === me) { this._zCall('WE LOST THE TOWER!', { team: them, kind: 'bad', icon }); this._snd('zone_lost'); }
    else if (prev === them) { this._zCall('THEY LOST THE TOWER!', { team: me, small: true, icon }); this._snd('zone_broken'); }
    this._restart(this.twTower, 'is-flip');
  }
  _twCheckpoint({ team, state }) {
    if (!this._twLive()) return;
    const me = this._zMe(), mine = team === me, icon = TOWER_ICON;
    if (state === 'reach') { this._zCall(mine ? 'CHECKPOINT!' : 'THEY HIT A CHECKPOINT!', { team, small: true, icon, sub: mine ? 'STAY ON TO CLEAR IT' : 'KNOCK THEM OFF!' }); this._snd('tower_checkpoint', { volume: mine ? 0.8 : 0.6 }); }
    else if (state === 'clear') { this._zCall(mine ? 'CHECKPOINT CLEARED!' : 'THEY CLEARED A CHECKPOINT', { team, kind: mine ? '' : 'bad', icon }); this._snd('tower_clear', { volume: mine ? 0.9 : 0.6, pitch: mine ? 1 : 0.85 }); }
    else if (state === 'refill') this._zCall(mine ? 'CHECKPOINT RESET' : 'THEIR CHECKPOINT RESET', { team: 1 - team, small: true, icon });
  }
  _twContest({ on }) {
    if (!on || !this._twLive()) return;
    const now = performance.now();
    if (now - (this._twContestT || 0) < 5000) return;
    this._twContestT = now;
    this._zCall('CONTESTED!', { small: true, icon: TOWER_ICON });
    this._snd('ui_toggle', { volume: 0.4, pitch: 0.8 });
  }

  // transient zone call-outs (stacked under the kill call-outs; newest on top, at most two)
  _zCall(text, { team = -1, sub = null, kind = '', small = false, icon = null } = {}) {
    const el = h('div', { class: 'iw-zcall' + (small ? ' is-small' : '') + (kind ? ` is-${kind}` : '') + (team < 0 ? ' is-neutral' : '') },
      h('span', { class: 'iw-zcall__ribbon' }),
      h('span', { class: 'iw-zcall__row' }, h('i', { class: 'iw-zcall__icon', html: icon || ZONE_ICON }), h('span', { class: 'iw-zcall__txt iw-display' }, text)),
      sub ? h('small', { class: 'iw-zcall__sub' }, sub) : null);
    colorVars(el, 'zk', this._zHex(team));
    const live = [...this.zcalls.children];
    for (let i = 1; i < live.length; i++) live[i].remove();
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    setTimeout(() => el.remove(), 3200);
    this.zcalls.prepend(el);
  }
  _zBanner(text) {
    this.bannerLayer.querySelectorAll('.iw-bn[data-g="center"]').forEach((b) => b.remove());
    const el = h('div', { class: 'iw-bn iw-bn--timesup iw-bn--ot' },
      h('div', { class: 'iw-bn__splat b', html: splatSVG({ seed: 8, cls: 'iw-fenemy', r: 60, arms: 9, drops: 6 }) }),
      h('div', { class: 'iw-bn__splat', html: splatSVG({ seed: 13, cls: 'iw-fself', r: 60, arms: 10, drops: 7 }) }),
      h('div', { class: 'iw-bn__text iw-display' }, text));
    el.dataset.g = 'center';
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    setTimeout(() => el.remove(), 4000);
    this.bannerLayer.appendChild(el);
  }

  _zControl({ owner, prev, objective }) {
    if (!this._zLive()) return;
    if (this._zObj && objective && objective !== this._zObj) return;   // a rotation resets control: ZONE SHIFTED says it
    const me = this._zMe(), them = 1 - me;
    // four distinct cues (src/audio/audio.js): we take it · they take it · our hold broken · their hold broken
    if (owner === me) { this._zCall("WE'VE GOT CONTROL!", { team: me }); this._snd('zone_ours'); }
    else if (owner === them) { this._zCall("THEY'VE GOT CONTROL!", { team: them, kind: 'bad' }); this._snd('zone_theirs'); }
    else if (prev === me) { this._zCall('WE LOST CONTROL!', { team: them, kind: 'bad' }); this._snd('zone_lost'); }
    else if (prev === them) { this._zCall('THEY LOST CONTROL!', { team: me, small: true }); this._snd('zone_broken'); }
  }
  _zPenalty({ team, penalty }) {
    if (!this._zLive() || !(penalty > 0) || (team !== 0 && team !== 1)) return;
    const me = this._zMe();
    this._zCall(`PENALTY +${Math.round(penalty)}`, { team, sub: team === me ? 'WE COUNT IT OFF FIRST' : 'THEY COUNT IT OFF FIRST', small: true, kind: 'pen' });
    this._snd('zone_penalty', { volume: team === me ? 0.9 : 0.65, pitch: team === me ? 0.94 : 1.06 });
  }
  _zActive({ objective, final, moved }) {
    if (!this._zLive()) return;
    this._zObj = objective;
    // the last 30 s lock (zones.js): a note, and the shift call-out only if it actually moved the objective
    if (final) { this.banner('one_minute', 'FINAL 30 — CENTRE ONLY'); this._snd('zone_final'); }
    if (moved === false) return;
    this._zCall(`ZONE SHIFTED → ${this._zLabel(objective, this._zMe())}`, { kind: 'shift' });
    if (!final) this._snd('zone_shift');
    this._restart(this.zo, 'is-moved');
  }
  _zOvertime() {
    if (!this._zLive()) return;
    this._zBanner('OVERTIME!');
    this._snd('zone_overtime');
    G.music?.setOvertime?.(true);
  }
  _zEnd({ reason }) {
    G.music?.setOvertime?.(false);
    if (reason === 'knockout' && this._zLive()) this._zKO = performance.now();
  }
  _zZone({ zone, owner }) {
    if (!this._zLive() || !zone || !G.match?.zones) return;
    const zs = G.match.zones.active.zones, i = zs.indexOf(zone);
    const el = i >= 0 ? this.zoIcons.children[i] : null;
    if (el) this._restart(el, 'is-flip');
    // two-zone centres: each half changing hands gets a soft tick (the objective's own cue plays when it's complete)
    if (zs.length > 1) this._snd('ui_toggle', { volume: 0.35, pitch: owner === this._zMe() ? 1.25 : owner < 0 ? 1 : 0.8 });
  }

  // Zone Control result reveal: both counts roll down from 100 to where they finished, then the winner (a KNOCKOUT!
  // stamp when a team counted all the way down). Resolves after ≈ 3.8 s.
  //   { mode: 'zones', colors, names, counts: [a, b], penalty: [a, b], winner, reason, overtime }
  //   counts are the scores (ZoneControl.state().count / match.result.counts); penalty is what each team still had to
  //   count off, shown apart (a hatched block ahead of the bar) — it isn't part of the score
  _judgeZones({ colors = ['#ff8a14', '#2f5bff'], names = TEAM_NAMES, counts = [100, 100], penalty = [0, 0], winner = null, reason = null, overtime = false, icon = null } = {}) {
    return new Promise((resolve) => {
      const ca = toHex(colors[0], '#ff8a14'), cb = toHex(colors[1], '#2f5bff');
      const whole = (v, d) => Math.max(0, Math.ceil((Number.isFinite(+v) ? +v : d) - 1e-6));
      const cnt = [0, 1].map((t) => whole(counts?.[t], 100)), pen = [0, 1].map((t) => whole(penalty?.[t], 0));
      const win = winner === 0 || winner === 1 ? winner : cnt[0] === cnt[1] ? -1 : cnt[0] < cnt[1] ? 0 : 1;
      const ko = reason === 'knockout';
      const side = (t) => {
        const num = h('b', { class: 'iw-jz__num' }, '100');
        const fill = h('i', { class: 'iw-jz__fill' }), penBar = h('i', { class: 'iw-jz__penbar' });
        const el = h('div', { class: `iw-jz__team ${t ? 'b' : 'a'}` },
          h('span', { class: 'iw-jd__name' }, names[t] || TEAM_NAMES[t]),
          h('div', { class: 'iw-jz__badge' }, h('span', { class: 'iw-jz__plate' }), num, pen[t] > 0 ? h('span', { class: 'iw-jz__pen' }, `+${pen[t]}`) : null),
          h('div', { class: 'iw-jz__bar' }, fill, penBar),
          h('small', { class: 'iw-jz__cap' }, pen[t] > 0 ? `COUNT LEFT · +${pen[t]} PENALTY` : 'COUNT LEFT'));
        return { el, num, fill, penBar };
      };
      const A = side(0), B = side(1);
      const sub = ko ? '' : ({ comeback: 'OVERTIME COMEBACK!', retake: 'RETAKEN IN OVERTIME', neutralised: 'HELD ON THROUGH OVERTIME', 'overtime-cap': 'OVERTIME LIMIT', 'sudden-death': 'SUDDEN DEATH' }[reason] || (overtime ? 'OVERTIME' : ''));
      const wText = win < 0 ? "IT'S A TIE!" : `${(names[win] || TEAM_NAMES[win] || '').toUpperCase()} WINS!`;
      const el = h('div', { class: 'iw-jd iw-jz' + (ko ? ' is-ko' : '') },
        h('div', { class: 'iw-jd__bg' }),
        h('div', { class: 'iw-jd__title iw-display' }, h('span', null, 'FINAL COUNT')),
        sub ? h('div', { class: 'iw-jz__sub' }, sub) : null,
        h('div', { class: 'iw-jz__arena' }, A.el, h('div', { class: 'iw-jz__vs', html: icon || ZONE_ICON }), B.el),
        ko ? h('div', { class: 'iw-jz__ko' },
          h('div', { class: 'iw-jz__kosplat', html: splatSVG({ seed: 31, cls: 'iw-fwin', r: 60, arms: 12, drops: 8 }) }),
          h('div', { class: 'iw-jz__kotxt iw-display' }, 'KNOCKOUT!')) : null,
        h('div', { class: 'iw-jd__win' + (win === 1 ? ' is-b' : win === 0 ? ' is-a' : ' is-tie') },
          h('div', { class: 'iw-jd__winsplat', html: splatSVG({ seed: 5, cls: 'iw-fwin', r: 58, arms: 11, drops: 5 }) }),
          h('div', { class: 'iw-jd__wintext iw-display' }, wText)));
      colorVars(el, 'ja', ca); colorVars(el, 'jb', cb);
      colorVars(el, 'jw', win === 1 ? cb : ca);
      this.overLayer.appendChild(el);
      const t0 = this._fxTime;
      const shown = [100, 100];
      let tickT = 0, revealed = false, finished = false;
      const put = (S, t, k) => {
        const c = Math.round(lerp(100, cnt[t], k));
        if (c !== shown[t]) { shown[t] = c; S.num.textContent = String(c); }
        const p = clamp((100 - lerp(100, cnt[t], k)) / 100), q = Math.min(1 - p, clamp(pen[t] / 100) * k);
        S.fill.style.transform = `scaleX(${p.toFixed(4)})`;
        S.penBar.style.width = `${(q * 100).toFixed(2)}%`;
        S.penBar.style[t ? 'right' : 'left'] = `${(p * 100).toFixed(2)}%`;
      };
      put(A, 0, 0); put(B, 1, 0);
      this._addFx('judgez', (dt) => {
        const t = this._fxTime - t0;
        const k = easeOutCubic(clamp((t - 0.75) / 1.2));
        put(A, 0, k); put(B, 1, k);
        if (k > 0 && k < 0.995 && (tickT -= dt) <= 0) { tickT = 0.07; this._snd('xp_tick', { volume: 0.3, pitch: 0.8 + k * 0.5 }); }
        if (!revealed && t > 2.05) {
          revealed = true;
          this._snd('judge_reveal');
          el.classList.add('is-winner', win === 1 ? 'is-win-b' : win === 0 ? 'is-win-a' : 'is-tie');
          if (ko) el.classList.add('is-kohit');
        }
        if (!finished && t > 3.8) {
          finished = true;
          resolve({ winner: win });
          el.classList.add('is-out');
          setTimeout(() => el.remove(), 650);
          return false;
        }
        return true;
      });
    });
  }

  // ================================================================ per-frame pieces
  _updTimer(time) {
    if (time == null) return;
    const L = this._L;
    const txt = fmtTime(time);
    if (txt !== L.timer) {
      L.timer = txt;
      this.timerTxt.textContent = txt;
      if (time <= 10.001 && time > 0) this.timer.animate([{ transform: 'scale(1.3) rotate(-4deg)' }, { transform: 'scale(1)' }], BUMP);
    }
    const fin = time <= 10.001;
    if (fin !== L.fin) { L.fin = fin; this.timer.classList.toggle('is-final', fin); }
    const last = time <= 60.001 && !fin;
    if (last !== L.lastMin) { L.lastMin = last; this.timer.classList.toggle('is-last', last); }
  }

  _updCheers(list) {
    const els = this.cheerEls;
    for (let i = 0; i < els.length; i++) {
      const c = list && list[i], el = els[i];
      if (!c) { if (el._on) { el._on = false; el.style.display = 'none'; } continue; }
      if (!el._on) { el._on = true; el.style.display = 'block'; }
      const pop = c.k < 0.12 ? 0.4 + 0.6 * (c.k / 0.12) * 1.15 : 1;
      el.style.transform = `translate(${c.x.toFixed(1)}px, ${(c.y - c.k * 26).toFixed(1)}px) translate(-50%, -100%) scale(${pop.toFixed(3)}) rotate(-4deg)`;
      el.style.opacity = (c.k > 0.75 ? (1 - c.k) / 0.25 : 1).toFixed(3);
      if (el._col !== c.color) { el._col = c.color; el.style.setProperty('--cc', c.color); }
    }
  }

  // world → NDC without three.js (camera matrices are plain arrays); used by the boss HUD's markers (hud-boss.js)
  _project(cam, x, y, z) {
    const v = cam.matrixWorldInverse.elements, p = cam.projectionMatrix.elements;
    const ex = v[0] * x + v[4] * y + v[8] * z + v[12], ey = v[1] * x + v[5] * y + v[9] * z + v[13], ez = v[2] * x + v[6] * y + v[10] * z + v[14];
    const cx = p[0] * ex + p[4] * ey + p[8] * ez + p[12], cy = p[1] * ex + p[5] * ey + p[9] * ez + p[13], cz = p[2] * ex + p[6] * ey + p[10] * ez + p[14], cw = p[3] * ex + p[7] * ey + p[11] * ez + p[15];
    if (Math.abs(cw) < 1e-6) return null;
    return { x: cx / cw, y: cy / cw, z: cw < 0 ? 2 : cz / cw };
  }

  // online you can be on Bravo: the HUD is drawn from your side (your squad left, your colour as "self")
  _myTeam() { return G.local && G.local.team === 1 ? 1 : 0; }
  _actorFor(side, i) {
    const team = side ^ this._myTeam();
    const list = this._actors().filter((a) => a.team === team);
    return list[i] || null;
  }

  _updSquads(teams) {
    const L = this._L;
    for (let t = 0; t < 2; t++) {
      const ps = (teams[t] && teams[t].players) || [];
      const icons = this.squads[t].children;
      for (let i = 0; i < 4; i++) {
        const p = ps[i];
        const el = icons[i];
        const k = `sq${t}${i}`;
        if (!p) { if (L[k] !== 'none') { L[k] = 'none'; el.classList.add('is-empty'); } continue; }
        const w = p.weapon || (this._actorFor(t, i) || {}).weaponId || 'shooter';
        const key = `${p.alive ? 1 : 0}|${p.alive ? 0 : Math.ceil(p.respawn || 0)}|${p.specialReady ? 1 : 0}|${p.isSelf ? 1 : 0}|${w}`;
        if (L[k] === key) continue;
        const prev = L[k];
        L[k] = key;
        el.classList.remove('is-empty');
        if (el._w !== w) { el._w = w; el.querySelector('.iw-sq__w').innerHTML = weaponIcon(kindOf(w)); }
        const wasAlive = prev && prev !== 'none' ? prev[0] === '1' : true;
        const wasReady = prev && prev !== 'none' ? prev.split('|')[2] === '1' : false;
        el.classList.toggle('is-dead', !p.alive);
        el.classList.toggle('is-ready', !!p.specialReady && !!p.alive);
        el.classList.toggle('is-self', !!p.isSelf);
        el.querySelector('.iw-sq__n').textContent = p.alive ? '' : String(Math.max(0, Math.ceil(p.respawn || 0)) || '');
        if (wasAlive && !p.alive) {
          el.animate([{ transform: 'scale(1.4) rotate(-14deg)' }, { transform: 'scale(.92) rotate(4deg)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.34,1.6,.64,1)' });
          const ring = el.querySelector('.iw-sq__ring circle');
          ring.style.animationDuration = `${Math.max(0.2, p.respawn || PLAYER.respawnTime)}s`;
          this._restart(el, 'is-dying');
        } else if (!wasAlive && p.alive) {
          el.animate([{ transform: 'translateY(-10px) scale(1.25)' }, { transform: 'none' }], BUMP);
          el.classList.remove('is-dying');
        }
        if (!wasReady && p.specialReady && p.alive) this._restart(el, 'is-readyflash');
      }
    }
  }

  _buildReticle(kind) {
    const r = this.ret;
    r.className = `iw-ret iw-ret--${kind}`;
    if (kind === 'charger') {
      const C = 2 * Math.PI * 25;
      r.innerHTML = `<i class="iw-ret__dot"></i><i class="iw-ret__line l"></i><i class="iw-ret__line r"></i><i class="iw-ret__line d"></i>
        <svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true"><circle r="25" class="iw-ret__track"/><circle r="25" class="iw-ret__charge" style="stroke-dasharray:${C.toFixed(2)};stroke-dashoffset:${C.toFixed(2)}"/>
        <g class="iw-ret__notch"><path d="M0 -31 L0 -36"/><path d="M31 0 L36 0"/><path d="M0 31 L0 36"/><path d="M-31 0 L-36 0"/></g></svg>`;
      this._chargeC = C;
      this._chargeEl = r.querySelector('.iw-ret__charge');
    } else if (kind === 'blaster') {
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true">
        <circle r="23" class="iw-ret__ring" pathLength="100" style="stroke-dasharray:19 6;stroke-dashoffset:9.5"/><circle r="9" class="iw-ret__ring thin"/></svg>`;
    } else if (kind === 'roller') {
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg wide" viewBox="-80 -40 160 80" aria-hidden="true">
        <path class="iw-ret__ring" d="M-46 -15 L-56 -15 Q-60 -15 -60 -11 L-60 11 Q-60 15 -56 15 L-46 15"/>
        <path class="iw-ret__ring" d="M46 -15 L56 -15 Q60 -15 60 -11 L60 11 Q60 15 56 15 L46 15"/>
        <path class="iw-ret__ring thin" d="M-30 22 Q0 30 30 22"/></svg>`;
    } else if (kind === 'dualies') {
      // twin reticle: one ring per pistol (each kicks on its own shot), spread ticks, and a lock diamond after a roll
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true">
        <circle cx="-10.5" r="6.2" class="iw-ret__ring thin iw-ret__twin l"/><circle cx="10.5" r="6.2" class="iw-ret__ring thin iw-ret__twin r"/>
        <path class="iw-ret__lock" d="M0 -19 L19 0 L0 19 L-19 0 Z"/></svg>
        <i class="iw-ret__tick" style="--a:0deg"></i><i class="iw-ret__tick" style="--a:90deg"></i><i class="iw-ret__tick" style="--a:180deg"></i><i class="iw-ret__tick" style="--a:270deg"></i>`;
      this._twin = [r.querySelector('.iw-ret__twin.r'), r.querySelector('.iw-ret__twin.l')];
    } else if (kind === 'slosher') {
      // the lob: an arch over the aim point and a landing "bucket" bracket under it
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true">
        <path class="iw-ret__ring iw-ret__arch" d="M-24 6 Q0 -26 24 6"/><path class="iw-ret__ring thin" d="M-10 13 L-6 18 L6 18 L10 13"/>
        <path class="iw-ret__ring thin" d="M-24 6 L-27 1 M24 6 L27 1"/></svg>`;
    } else if (kind === 'splatling') {
      // spin-up meter (8 segments) that fills while charging and drains while the stream runs + spread ticks
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true"><circle r="21" class="iw-ret__track"/>
        <circle r="21" class="iw-ret__charge" pathLength="100" style="stroke-dasharray:100;stroke-dashoffset:100"/>
        <g class="iw-ret__segs">${Array.from({ length: 8 }, (_, i) => `<path d="M0 -17 L0 -25" transform="rotate(${i * 45})"/>`).join('')}</g></svg>
        <i class="iw-ret__tick" style="--a:90deg"></i><i class="iw-ret__tick" style="--a:270deg"></i>`;
      this._chargeEl = r.querySelector('.iw-ret__charge'); this._chargeC = 100;
    } else if (kind === 'bow') {
      // Tideline Bow (kits/bow.js): two charge rings — the inner one fills to ring 1, the outer from ring 1 to a full
      // draw; each turns your ink when reached — and the three-arrow fan as pips (flat on the ground, upright in the air)
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true">
        <circle r="14.5" class="iw-ret__track in"/><circle r="14.5" class="iw-ret__fill in" pathLength="100" style="stroke-dasharray:100;stroke-dashoffset:100"/>
        <circle r="22.5" class="iw-ret__track out"/><circle r="22.5" class="iw-ret__fill out" pathLength="100" style="stroke-dasharray:100;stroke-dashoffset:100"/></svg>
        <div class="iw-ret__fan"><i class="iw-ret__pip l"></i><i class="iw-ret__pip r"></i></div>`;
      this._bowIn = r.querySelector('.iw-ret__fill.in'); this._bowOut = r.querySelector('.iw-ret__fill.out');
      this._L.ring = null; this._L.air = null;
    } else if (kind === 'mitts') {
      // Sponge Mitts (kits/mitts.js): a glove bracket each side (each jabs out on its own punch) and a leap-charge meter
      // under the dot that fills from the bottom up both sides; tinted while stuck to a wall
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true">
        <path class="iw-ret__ring iw-ret__mitt r" d="M9 -10 Q19.5 -10 19.5 0 Q19.5 10 9 10 M19.5 -3 L22.5 -3 M19.5 3 L22.5 3"/>
        <path class="iw-ret__ring iw-ret__mitt l" d="M-9 -10 Q-19.5 -10 -19.5 0 Q-19.5 10 -9 10 M-19.5 -3 L-22.5 -3 M-19.5 3 L-22.5 3"/>
        <circle r="27" class="iw-ret__mtrack" pathLength="100" style="stroke-dasharray:50 100"/>
        <circle r="27" class="iw-ret__mc" pathLength="100" transform="rotate(90)" style="stroke-dasharray:0 100"/>
        <circle r="27" class="iw-ret__mc" pathLength="100" transform="scale(-1 1) rotate(90)" style="stroke-dasharray:0 100"/></svg>`;
      this._mitt = [r.querySelector('.iw-ret__mitt.r'), r.querySelector('.iw-ret__mitt.l')];
      this._mittC = [...r.querySelectorAll('.iw-ret__mc')]; this._mittS = {};
    } else if (kind === 'brolly') {
      // Canopy Brolly (kits/brolly.js): four ticks on the pellet cone, and a canopy dome under the dot — its hp (the
      // regrowth while it's broken / launched); held open, the arc above it fills toward the launch
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true">
        <circle r="7.5" class="iw-ret__ring thin" style="stroke-dasharray:2.4 3.5"/>
        <path d="M-19 33 Q0 15 19 33" style="stroke-width:4.2;opacity:.28"/>
        <path class="iw-ret__brh" pathLength="100" d="M-19 33 Q0 15 19 33" style="stroke-width:4.2;stroke-dasharray:100;stroke-dashoffset:0;transition:stroke-dashoffset .1s linear,opacity .15s"/>
        <path class="iw-ret__brl" pathLength="100" d="M-15 25.5 Q0 11 15 25.5" style="stroke-width:2.4;stroke:var(--self-light);stroke-dasharray:100;stroke-dashoffset:100"/>
        <path d="M0 33 L0 37.5" style="stroke-width:2.2;opacity:.8"/></svg>
        <i class="iw-ret__tick" style="--a:0deg"></i><i class="iw-ret__tick" style="--a:90deg"></i><i class="iw-ret__tick" style="--a:180deg"></i><i class="iw-ret__tick" style="--a:270deg"></i>`;
      this._brolly = { hp: r.querySelector('.iw-ret__brh'), ln: r.querySelector('.iw-ret__brl'), ticks: r.querySelectorAll('.iw-ret__tick') };
    } else if (kind === 'twins') {
      // one full reticle per gun; they slide together into one while planted in rapid mode after a dodge roll
      const one = (side) => `<div class="iw-ret__gun ${side}"><i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true"><circle r="12" class="iw-ret__ring thin"/></svg>
        <i class="iw-ret__tick" style="--a:0deg"></i><i class="iw-ret__tick" style="--a:90deg"></i><i class="iw-ret__tick" style="--a:180deg"></i><i class="iw-ret__tick" style="--a:270deg"></i></div>`;
      r.innerHTML = one('l') + one('r');
    } else if (kind === 'blade') {
      // Brine Cutlass (kits/blade.js): two crescents (the cut's arc) with edge ticks round the dot, and an arc meter over
      // it for the charged cut — charging pulls the crescents in and fills the arc; full charge turns it your ink
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg wide" viewBox="-80 -40 160 80" aria-hidden="true">
        <path class="iw-ret__ring iw-ret__cres l" d="M-26 -17 Q-39 0 -26 17"/><path class="iw-ret__ring iw-ret__cres r" d="M26 -17 Q39 0 26 17"/>
        <path class="iw-ret__ring thin" d="M-38 -4 L-44 0 L-38 4 M38 -4 L44 0 L38 4"/>
        <path class="iw-ret__track iw-ret__bar" d="M-22 -27 Q0 -35 22 -27"/>
        <path class="iw-ret__charge iw-ret__bar" pathLength="100" d="M-22 -27 Q0 -35 22 -27" style="stroke-dasharray:100;stroke-dashoffset:100"/></svg>`;
      this._chargeEl = r.querySelector('.iw-ret__charge'); this._chargeC = 100;
    } else {
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true"><circle r="15" class="iw-ret__ring thin"/></svg>
        <i class="iw-ret__tick" style="--a:0deg"></i><i class="iw-ret__tick" style="--a:90deg"></i><i class="iw-ret__tick" style="--a:180deg"></i><i class="iw-ret__tick" style="--a:270deg"></i>`;
    }
    this._L.spread = null; this._L.charge = null; this._L.full = null;
    this._L.planted = null; this._L.lock = null; this._L.roll = null; this._L.streaming = null; this._L.bk = null; this._L.charging = null;
  }

  _updCrosshair(f, dt) {
    const L = this._L;
    const w = f.weapon || 'shooter';
    if (w !== L.weapon) {
      L.weapon = w;
      const W = WEAPONS[w];
      const kind = RETICLE_OF[(W && W.kind) || w] || (W && W.kind) || w;
      this._buildReticle(kind);
      L.kind = kind;
      this.xh.className = `iw-xh iw-xh--${kind}` + (L.tgt ? ' is-target' : '') + (L.far ? ' is-far' : '');
    }
    // the special gauge shows the equipped special (picked in the loadout, can change mid-practice)
    const sid = f.specialId || (WEAPONS[w] && WEAPONS[w].special) || 'slam';
    if (sid !== L.specialId) { L.specialId = sid; this.spIcon.innerHTML = specialIcon(sid); }
    // per-shot kick (recoil events) on top of the live cone the engine reports in screen px (already includes bloom)
    this._bloom = Math.max(0, this._bloom - dt * 5);
    this._kick = Math.max(0, (this._kick || 0) - dt * 16);   // per-shot reticle kick (~60 ms), on top of the live spread
    const ch = f.crosshair || {};
    if (L.kind === 'shooter' || L.kind === 'blaster' || L.kind === 'twins' || L.kind === 'dualies' || L.kind === 'splatling') {
      const kk = L.kind === 'blaster' ? 0 : this._kick * this._kick * (L.kind === 'splatling' ? 4 : 7);
      const sp = clamp((+ch.spread || 0) + this._bloom * (L.kind === 'blaster' ? 5 : 2.5) + kk, 0, 90);
      if (L.spread == null || Math.abs(sp - L.spread) > 0.25) { L.spread = sp; this.ret.style.setProperty('--sp', sp.toFixed(1)); }
    } else {
      const b = this._bloom;
      if (L.bl == null || Math.abs(b - L.bl) > 0.02) { L.bl = b; this.ret.style.setProperty('--bl', b.toFixed(2)); }
    }
    const planted = !!(f.twin && f.twin.planted);
    if (planted !== L.planted) { L.planted = planted; this.ret.classList.toggle('is-planted', planted); }
    const tgt = ch.onTarget === 'enemy';
    if (tgt !== L.tgt) { L.tgt = tgt; this.xh.classList.toggle('is-target', tgt); }
    const far = ch.inRange === false && !tgt;
    if (far !== L.far) { L.far = far; this.xh.classList.toggle('is-far', far); }
    if (L.kind === 'charger' || L.kind === 'blade') {   // (blade: the charged cut's arc meter)
      const c = clamp(+f.charge || 0);
      if (L.charge == null || Math.abs(c - L.charge) > 0.004) {
        L.charge = c;
        this._chargeEl.style.strokeDashoffset = (this._chargeC * (1 - c)).toFixed(2);
        this.ret.style.setProperty('--ch', c.toFixed(3));
      }
      const full = c >= 0.999;
      if (full !== L.full) { L.full = full; this.ret.classList.toggle('is-full', full); if (full) this._restart(this.ret, 'is-flash'); }
      const charging = c > 0.001;
      if (charging !== L.charging) { L.charging = charging; this.ret.classList.toggle('is-charging', charging); }
    } else if (L.kind === 'splatling') {
      // splatling meter: fills while spinning up, drains while the stream runs (the spinner's stream = its burst)
      const la = this._local(), lr = la?.weaponRunner, spin = la?.weapon?.kind === 'spinner';
      const streaming = !!(lr && (spin ? lr.burstT > 0 : lr.streaming));
      const c = spin && streaming ? clamp(lr.burstT / Math.max(0.01, lr.burstDur || 1)) : clamp(+f.charge || 0);
      if (L.charge == null || Math.abs(c - L.charge) > 0.004) { L.charge = c; this._chargeEl.style.strokeDashoffset = (100 * (1 - c)).toFixed(2); this.ret.style.setProperty('--ch', c.toFixed(3)); }
      if (streaming !== L.streaming) { L.streaming = streaming; this.ret.classList.toggle('is-streaming', streaming); }
      const full = !streaming && c >= 0.999;
      if (full !== L.full) { L.full = full; this.ret.classList.toggle('is-full', full); if (full) this._restart(this.ret, 'is-flash'); }
    } else if (L.kind === 'dualies') {
      // lock diamond: the dualies' post-roll turret / the twins' planted rapid mode; roll: mid dodge
      const la = this._local(), lr = la?.weaponRunner, tw = la?.weapon?.kind === 'twins';
      const lock = !!(lr && (tw ? lr.turret : lr.lockT > 0)), roll = !!(lr && (tw ? lr.dodgeT > 0 : lr.dodge));
      if (lock !== L.lock) { L.lock = lock; this.ret.classList.toggle('is-lock', lock); }
      if (roll !== L.roll) { L.roll = roll; this.ret.classList.toggle('is-roll', roll); }
    }
    if (L.kind === 'bow') {
      // the rings fill with the draw (ring 1 / full flash the reticle); the fan pips tighten with the charge and turn
      // upright while airborne (the volley fans vertically in the air)
      const c = clamp(+f.charge || 0), r1 = WEAPONS.bow?.ring1 ?? 0.45;
      if (L.charge == null || Math.abs(c - L.charge) > 0.004) {
        L.charge = c;
        this._bowIn.style.strokeDashoffset = (100 * (1 - clamp(c / r1))).toFixed(2);
        this._bowOut.style.strokeDashoffset = (100 * (1 - clamp((c - r1) / (1 - r1)))).toFixed(2);
        this.ret.style.setProperty('--fan', (9 - 3 * c).toFixed(2));
      }
      const ring = c >= 0.999 ? 2 : c >= r1 ? 1 : 0;
      if (ring !== L.ring) {
        if (ring > (L.ring || 0)) this._restart(this.ret, 'is-flash');
        L.ring = ring; this.ret.classList.toggle('is-r1', ring >= 1); this.ret.classList.toggle('is-full', ring === 2);
      }
      const la = this._local(), air = !!(la && la.alive && !la.grounded);
      if (air !== L.air) { L.air = air; this.ret.classList.toggle('is-air', air); }
    }
    if (L.kind === 'slosher') {
      const k = this._kick;
      if (L.bk == null || Math.abs(k - L.bk) > 0.02) { L.bk = k; this.ret.style.setProperty('--kk', k.toFixed(2)); }
    }
    if (L.kind === 'brolly' && this._brolly) {
      // Canopy Brolly: ticks on the pellet cone (flatter than wide); the dome = canopy hp, or its regrowth while gone
      // (dim); open, it turns your ink and the arc over it fills toward the launch (off the local runner's kit)
      const B = this._brolly, sp = clamp((+ch.spread || 0) + this._kick * this._kick * 6, 0, 90);
      if (L.spread == null || Math.abs(sp - L.spread) > 0.25) {
        L.spread = sp;
        B.ticks.forEach((t, i) => t.style.setProperty('--sp', (sp * (i % 2 ? 0.9 : 0.66)).toFixed(1)));
      }
      const K = this._local()?.weaponRunner?.kit;
      if (K && K.brolly) {
        const up = K.state === 'ready', v = up ? K.hp / K.hpMax : K.regrowK || 0, open = up && K.open > 0.5, lk = open ? K.launchK || 0 : 0;
        if (L.brH == null || Math.abs(v - L.brH) > 0.004) { L.brH = v; B.hp.style.strokeDashoffset = (100 * (1 - v)).toFixed(1); }
        if (L.brL == null || Math.abs(lk - L.brL) > 0.004) { L.brL = lk; B.ln.style.strokeDashoffset = (100 * (1 - lk)).toFixed(1); }
        const s = !up ? 'down' : open ? 'open' : v < 0.34 ? 'low' : 'up';
        if (s !== L.brS) {
          L.brS = s;
          B.hp.style.opacity = s === 'down' ? '.4' : '1';
          B.hp.style.stroke = s === 'open' ? 'var(--self-light)' : s === 'low' ? '#ff5a4a' : '';
        }
      }
    }
    if (L.kind === 'mitts') {
      // Sponge Mitts: leap-charge meter, stuck-to-a-wall tint, mid-leap fade (off the local runner's kit state)
      const la = this._local(), K = la?.weaponRunner?.kit?.mitts ? la.weaponRunner.kit : null, S = this._mittS || (this._mittS = {});
      const charging = !!(K && K.charging), c = charging ? clamp(K.charge) : 0;
      if (S.c == null || Math.abs(c - S.c) > 0.004) { S.c = c; const d = `${(c * 25).toFixed(2)} 100`; for (const el of this._mittC || []) el.style.strokeDasharray = d; }
      if (charging !== S.ch) { S.ch = charging; this.ret.classList.toggle('is-charging', charging); }
      const full = charging && c >= 0.999;
      if (full !== S.full) { S.full = full; this.ret.classList.toggle('is-full', full); if (full) this._restart(this.ret, 'is-flash'); }
      const cl = !!(K && K.cling), lp = !!(K && K.leaping);
      if (cl !== S.cl) { S.cl = cl; this.ret.classList.toggle('is-cling', cl); }
      if (lp !== S.lp) { S.lp = lp; this.ret.classList.toggle('is-leap', lp); }
    }
    // spawn shield + bomb aim (read straight off the local actor; absent in the lab unless mocked)
    const a = this._local();
    const inv = !!(a && a.alive && a.invuln > 0.05);
    if (inv !== L.inv) { L.inv = inv; this.shield.classList.toggle('is-up', inv); }
    const subKey = f.subKind + '|' + (f.subCost ?? 0.7);
    if (f.subKind && subKey !== L.subKey) {
      L.subKey = subKey;
      this.subChip.firstChild.innerHTML = SUB_ICONS[f.subKind] || SUB_ICONS.bomb;
      this.subChip.lastChild.textContent = f.subCost === 0 ? 'FREE' : `${Math.round((f.subCost ?? 0.7) * 100)}%`;
    }
    const tr = !!f.tracked, po = !!f.poisoned;
    if (tr !== L.stTr) { L.stTr = tr; this.statusEl.classList.toggle('show-tracked', tr); }
    if (po !== L.stPo) { L.stPo = po; this.statusEl.classList.toggle('show-poison', po); this.poisonVig.classList.toggle('is-on', po); }
    const aim = !!(a && a.alive && a.weaponRunner && a.weaponRunner.aimingSub) || !!f.subAim;
    if (aim !== L.aim) { L.aim = aim; this.subChip.classList.toggle('is-on', aim); if (aim) this._snd('ui_toggle', { volume: 0.35 }); }
    if (aim) {
      const ok = (f.ink ?? 1) >= (f.subCost ?? 0.7) - 1e-3;
      if (ok !== L.aimOk) { L.aimOk = ok; this.subChip.classList.toggle('is-short', !ok); }
      const fr = clamp((f.ink ?? 1) / Math.max(0.01, f.subCost ?? 0.7));
      if (L.aimFr == null || Math.abs(fr - L.aimFr) > 0.01) { L.aimFr = fr; this.subChip.style.setProperty('--f', fr.toFixed(3)); }
    }
  }

  // ---------------------------------------------------------------- ink tank (canvas, sloshing liquid)
  _updTank(f, dt) {
    const L = this._L, T = this._tank;
    const ink = clamp(f.ink == null ? 1 : +f.ink);
    const sub = clamp(+f.subCost || 0);
    const low = !!f.inkLow;
    const nosub = sub > 0 && ink < sub;
    if (low !== L.low) { L.low = low; this.tank.classList.toggle('is-low', low); }
    if (nosub !== L.nosub) { L.nosub = nosub; this.tank.classList.toggle('is-nosub', nosub); }
    // fade when full + idle
    L.fullT = ink >= 0.995 && !low && !L.aim ? (L.fullT || 0) + dt : 0;
    const idle = L.fullT > 1.4;
    if (idle !== L.idle) { L.idle = idle; this.tank.classList.toggle('is-idle', idle); }
    // slosh drive: camera turn rate + lateral acceleration of the local player
    T.t += dt;
    let drive = 0;
    const a = this._local();
    const yaw = G.rig ? G.rig.yaw : null;
    if (yaw != null && T.prevYaw != null && dt > 0) { let dy = yaw - T.prevYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); drive += clamp(dy / dt, -8, 8) * 0.55; }
    T.prevYaw = yaw;
    if (a && a.vel && dt > 0) {
      const ax = (a.vel.x - T.prevVx) / dt, az = (a.vel.z - T.prevVz) / dt;
      T.prevVx = a.vel.x; T.prevVz = a.vel.z;
      const cam = G.camera;
      if (cam) { const e = cam.matrixWorld.elements; const rx = e[0], rz = e[2]; drive += clamp((ax * rx + az * rz) * 0.05, -3, 3); }
    }
    const kS = 90, cS = 7.5;
    T.sloshV += (-kS * T.slosh - cS * T.sloshV - drive * 6) * dt;
    T.slosh = clamp(T.slosh + T.sloshV * dt, -0.6, 0.6);
    T.wobble = Math.max(0, T.wobble - dt * 1.8);
    T.empty = Math.max(0, T.empty - dt);
    // bubbles while refilling
    const rising = ink > T.prevInk + 1e-4;
    if (rising && T.bubbles.length < 14 && Math.random() < dt * (ink - T.prevInk > dt * 0.2 ? 40 : 12)) T.bubbles.push({ x: 0.2 + Math.random() * 0.6, y: 0, r: 0.6 + Math.random() * 1.4, v: 0.5 + Math.random() * 0.7 });
    T.prevInk = ink;
    T.level += (ink - T.level) * (1 - Math.exp(-dt * 14));
    if (idle && !T.bubbles.length && Math.abs(T.sloshV) < 0.01) return;
    this._drawTank(dt, sub, low, nosub);
  }

  _drawTank(dt, sub, low, nosub) {
    const T = this._tank, c = this.tankCtx, cv = this.tankCanvas;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const cw = cv.clientWidth || 18, chh = cv.clientHeight || 74;
    const W = Math.round(cw * dpr), H = Math.round(chh * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const L = this._L;
    if (!L.tankCol) { const s = L.ca || '#ff8a14'; L.tankCol = [shade(s, 0.42), s, shade(s, -0.3), shade(s, -0.55)]; }
    const [cLight, cMid, cDark, cDeep] = L.tankCol;
    c.clearRect(0, 0, W, H);
    const pad = 3 * dpr, bw = W - pad * 2, bh = H - pad * 2, rr = bw / 2;
    const T2 = this._tankCache || (this._tankCache = {});
    if (T2.W !== W || T2.H !== H || T2.col !== cMid) {
      T2.W = W; T2.H = H; T2.col = cMid;
      T2.body = new Path2D(); T2.body.roundRect(pad, pad, bw, bh, rr);
      T2.g = c.createLinearGradient(pad, 0, pad + bw, 0);
      T2.g.addColorStop(0, cDark); T2.g.addColorStop(0.45, cMid); T2.g.addColorStop(1, cLight);
    }
    const body = T2.body;
    // glass back
    c.fillStyle = 'rgba(14,11,22,.62)';
    c.fill(body);
    c.save();
    c.clip(body);
    // liquid with a sloshing wavy surface
    const lvl = pad + bh * (1 - T.level);
    const amp = (1.2 + T.wobble * 3 + Math.abs(T.sloshV) * 2.2) * dpr;
    const tilt = T.slosh * bw * 0.9;
    c.beginPath();
    c.moveTo(pad - 2, H + 2);
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const u = i / N, x = pad + u * bw;
      const y = lvl + (u - 0.5) * tilt + Math.sin(u * 6.5 + T.t * 7) * amp * 0.5 + Math.sin(u * 11 - T.t * 9.5) * amp * 0.25;
      c.lineTo(x, y);
    }
    c.lineTo(pad + bw + 2, H + 2);
    c.closePath();
    c.fillStyle = T2.g;
    c.fill();
    // depth shading toward the bottom
    const g2 = c.createLinearGradient(0, lvl, 0, H);
    g2.addColorStop(0, 'rgba(255,255,255,.18)'); g2.addColorStop(0.15, 'rgba(255,255,255,0)'); g2.addColorStop(1, cDeep + '66');
    c.fillStyle = g2;
    c.fill();
    // bubbles
    c.fillStyle = 'rgba(255,255,255,.6)';
    for (let i = T.bubbles.length - 1; i >= 0; i--) {
      const b = T.bubbles[i];
      b.y += b.v * dt;
      const by = H - pad - b.y * bh;
      if (by < lvl + 2) { T.bubbles.splice(i, 1); continue; }
      c.beginPath(); c.arc(pad + b.x * bw + Math.sin(b.y * 20) * dpr, by, b.r * dpr, 0, TAU); c.fill();
    }
    c.restore();
    // sub-weapon cost line
    if (sub > 0) {
      const sy = pad + bh * (1 - sub);
      c.fillStyle = nosub ? '#ff4d5e' : '#fff';
      c.fillRect(pad - 1 * dpr, sy - 1.2 * dpr, bw + 2 * dpr, 2.4 * dpr);
      c.fillStyle = 'rgba(0,0,0,.55)';
      c.fillRect(pad - 1 * dpr, sy + 1.2 * dpr, bw + 2 * dpr, 1 * dpr);
    }
    // gloss + rim
    c.fillStyle = 'rgba(255,255,255,.5)';
    c.beginPath(); c.roundRect(pad + bw * 0.2, pad + bh * 0.07, bw * 0.16, bh * 0.4, bw * 0.08); c.fill();
    c.lineWidth = 3.4 * dpr; c.strokeStyle = 'rgba(12,9,20,.8)'; c.stroke(body);
    c.lineWidth = 1.8 * dpr; c.strokeStyle = low ? (Math.sin(T.t * 14) > 0 ? '#ff3d5e' : '#ffffff') : '#ffffff'; c.stroke(body);
  }

  // ---------------------------------------------------------------- special gauge
  _updSpecial(f, dt) {
    const L = this._L;
    const s = clamp(+f.special || 0);
    if (L.special == null || Math.abs(s - L.special) > 0.002) {
      if (L.special != null && s > L.special + 0.035 && s < 0.999) {
        this.sp.animate([{ scale: '1.08' }, { scale: '1' }], { duration: 260, easing: 'cubic-bezier(.34,1.8,.64,1)' });
        this._restart(this.sp, 'is-gain');
      }
      L.special = s;
      this.spLiquid.style.transform = `translateY(${(100 - s * 92 - 4).toFixed(2)}px)`;
      const pt = s >= 0.999 ? '' : `${Math.floor(s * 100)}%`;
      if (pt !== L.spTxt) { L.spTxt = pt; this.spPct.textContent = pt; }
    }
    const ready = !!f.specialReady;
    if (ready !== L.ready) {
      L.ready = ready;
      this.sp.classList.toggle('is-ready', ready);
      if (ready) {
        this.sp.animate([{ transform: 'scale(1.35) rotate(-10deg)' }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.34,1.9,.64,1)' });
        this._restart(this.sp, 'is-flare');
      }
    }
    const act = !!f.specialActive;
    if (act !== L.active) { L.active = act; this.sp.classList.toggle('is-active', act); }
    void dt;
  }

  // ---------------------------------------------------------------- sub badge (on the special orb) + "Can't use"
  // frame.subKind (Bomb Barrage: its bomb), frame.subCost (0..1 of the tank; 0 = free during a barrage), frame.ink
  _updSubBadge(f) {
    const L = this._L, B = this.subBadge;
    const kind = f.subKind || 'bomb';
    if (kind !== L.sbKind) {
      const first = L.sbKind == null;
      L.sbKind = kind;
      this.sbIcon.innerHTML = SUB_ICONS[kind] || SUB_ICONS.bomb;   // kit subs register their own icon; none yet → the bomb
      B.dataset.kind = kind;
      if (!first) this._restart(B, 'is-swap');
    }
    const cost = f.subCost == null ? 0.7 : Math.max(0, +f.subCost || 0);
    const free = cost <= 0;
    const ink = clamp(f.ink == null ? 1 : +f.ink);
    const fr = free ? 1 : clamp(ink / cost);
    if (L.sbFr == null || Math.abs(fr - L.sbFr) > 0.004) { L.sbFr = fr; this.sbFg.style.strokeDashoffset = (100 * (1 - fr)).toFixed(2); }
    const ok = free || ink >= cost - 1e-3;
    if (ok !== L.sbOk) {
      const had = L.sbOk;
      L.sbOk = ok;
      B.classList.toggle('is-short', !ok);
      if (ok && had === false) this._restart(B, 'is-ready');   // enough ink again: a little pop
    }
    if (free !== L.sbFree) { L.sbFree = free; B.classList.toggle('is-free', free); }
    const aim = !!L.aim;
    if (aim !== L.sbAim) { L.sbAim = aim; B.classList.toggle('is-aim', aim); }
  }

  // a sub refused the throw (sub:cantuse — e.g. a Torpedo or Boomerang already out): a callout where the aim chip was,
  // the badge shakes, a soft deny bonk
  _cantUse(kind) {
    const now = performance.now();
    if (now - (this._denyT || -1e9) < 140) return;
    this._denyT = now;
    const icon = SUB_ICONS[kind] || SUB_ICONS[(SUB[kind] || {}).kind] || SUB_ICONS.bomb;
    if (this.denyIcon._k !== kind) { this.denyIcon._k = kind; this.denyIcon.innerHTML = icon; }
    this._restart(this.denyEl, 'is-on');
    this._restart(this.subBadge, 'is-deny');
    this._snd('sub_cantuse', { volume: 0.75 });
  }

  // ---------------------------------------------------------------- turf ticker
  _updTurf(dt) {
    this._turfT += dt;
    if (this._turfAcc > 0 && (this._turfT > 0.4 || this._turfAcc > 40)) {
      const n = Math.round(this._turfAcc);
      if (n >= 1) this._turfPop(n);
      this._turfAcc -= n;
      if (this._turfAcc < 0) this._turfAcc = 0;
      this._turfT = 0;
    }
    // total counts up toward the real value
    const tgt = this._turfTotal;
    if (this._turfShown < tgt) this._turfShown = Math.min(tgt, this._turfShown + Math.max(6, (tgt - this._turfShown) * 7) * dt);
    const txt = fmtInt(Math.floor(this._turfShown));
    if (txt !== this._L.turfTxt) {
      this._L.turfTxt = txt; this.turfNum.textContent = txt;
    }
  }
  _turfPop(n) {
    const pops = this.tpops.children;
    if (pops.length >= 4) pops[0].remove();
    const big = n >= 25;
    const el = h('span', { class: 'iw-tpop' + (big ? ' is-big' : ''), style: { '--x': `${(Math.random() * 16 - 8).toFixed(1)}px` } }, `+${n}`, h('small', null, 'p'));
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    this.tpops.appendChild(el);
    this._restart(this.turfEl, 'is-tick');
  }

  _updHp(hp) {
    const L = this._L;
    const v = clamp(hp == null ? 1 : +hp);
    const o = this.fx ? 0 : clamp((0.42 - v) / 0.32);
    if (L.vig == null || Math.abs(o - L.vig) > 0.01) { L.vig = o; this.vig.style.opacity = o.toFixed(3); }
    const crit = v < 0.2 && !this.fx;
    if (crit !== L.crit) { L.crit = crit; this.vig.classList.toggle('is-crit', crit); }
  }

  // ---------------------------------------------------------------- minimap + super jump
  _updMap(m, dt) {
    const L = this._L, M = this._map;
    const show = !!(m && m.canvas);
    if (show !== L.mapShow) { L.mapShow = show; this.map.style.display = show ? '' : 'none'; if (!show) { this.mapDim.classList.remove('is-on'); M.open = false; } }
    if (!show) return;
    if (m.canvas !== this._mapCanvas) {
      this._mapCanvas = m.canvas;
      this.mapSlot.innerHTML = '';
      this.mapSlot.appendChild(m.canvas);
      m.canvas.classList.add('iw-map__canvas');
      L.mapBox = null;
    }
    // Vortex Strike targeting reuses the big map: no super-jump list, a targeting title instead
    const strike = !!m.strike;
    if (strike !== L.mapStrike) {
      L.mapStrike = strike;
      this.map.classList.toggle('is-strike', strike);
      this.mapLegend.querySelector('.iw-lg__title').textContent = strike ? 'VORTEX STRIKE' : 'SUPER JUMP';
      this.mapLegend.querySelector('.iw-lg__sub').textContent = strike ? 'Move the mouse to aim · click to launch' : 'Pick a landing spot';
    }
    // the big map only opens during live play (the controller's TAB state can stay latched through time's up)
    const target = m.expanded && (this.lab || !G.match || G.match.state === 'playing') ? 1 : 0;
    if (target !== L.mapExp) {
      L.mapExp = target;
      this.mapDim.classList.toggle('is-on', !!target);
      this.map.classList.toggle('is-expanded', !!target);
      this.el.classList.toggle('is-mapopen', !!target);
      M.open = !!target;
      if (M.open) { M.cx = M.sx ?? 0.5; M.cy = M.sy ?? 0.8; M.hover = -1; this._snd('ui_click', { volume: 0.5 }); this.map.style.pointerEvents = 'auto'; }
      else { this.map.style.pointerEvents = ''; }
    }
    const k = 190, c = 21;
    const a = k * (target - this._mapT) - c * this._mapV;
    this._mapV += a * Math.min(dt, 0.05); this._mapT += this._mapV * Math.min(dt, 0.05);
    if (Math.abs(target - this._mapT) < 0.001 && Math.abs(this._mapV) < 0.001) { this._mapT = target; this._mapV = 0; }
    const W = innerWidth, H = innerHeight;
    const u = Math.min(W / 100, (H * 1.7778) / 100);
    const asp = (m.canvas.width || 1) / (m.canvas.height || 1);
    const fit = (sz) => (asp >= 1 ? [sz, sz / asp] : [sz * asp, sz]);
    const [w0, h0] = fit(14.5 * u), [w1, h1] = fit(Math.min(H * 0.78, W * 0.6));
    const t = this._mapT;
    const bw = lerp(w0, w1, t), bh = lerp(h0, h1, t);
    const x = lerp(2.2 * u, (W - w1) / 2, t), y = lerp(H - 2.2 * u - h0, (H - h1) / 2 + u * 1.2, t);
    const inside = (W - w1) / 2 < 22 * u;
    if (inside !== L.lgIn) { L.lgIn = inside; this.mapLegend.classList.toggle('is-inside', inside); }
    const box = `${x.toFixed(1)},${y.toFixed(1)},${bw.toFixed(1)},${bh.toFixed(1)}`;
    if (box !== L.mapBox) {
      L.mapBox = box;
      const st = this.map.style;
      st.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      st.width = bw.toFixed(1) + 'px'; st.height = bh.toFixed(1) + 'px';
    }
    // dots
    const ps = m.players || [];
    const ca = L.ca || '#ff8a14', cb = L.cb || '#2f5bff';
    for (let i = 0; i < this.mapDots.length; i++) {
      const d = this.mapDots[i], p = ps[i];
      const dk = `md${i}`;
      if (!p) { if (L[dk] !== 'x') { L[dk] = 'x'; d.style.display = 'none'; } continue; }
      const px = clamp(+p.x || 0) * bw, py = clamp(+p.y || 0) * bh;
      if (p.isSelf) { M.sx = clamp(+p.x || 0); M.sy = clamp(+p.y || 0); }
      const key = `${px.toFixed(1)}|${py.toFixed(1)}|${(+p.yaw || 0).toFixed(2)}|${p.alive === false ? 0 : 1}|${p.isSelf ? 1 : 0}|${p.team}`;
      if (L[dk] === key) continue;
      const prev = L[dk] || '';
      L[dk] = key;
      if (prev === 'x' || !prev) d.style.display = '';
      const sk = `${p.isSelf ? 1 : 0}|${p.alive === false ? 0 : 1}|${p.team}|${p.tracked ? 1 : 0}`;
      if (d._sk !== sk) {
        d._sk = sk;
        d.className = 'iw-mdot' + (p.isSelf ? ' is-self' : '') + (p.alive === false ? ' is-dead' : '') + (p.team !== this._myTeam() ? ' is-enemy' : '') + (p.tracked ? ' is-tracked' : '');
        d.style.setProperty('--c', p.team !== this._myTeam() ? cb : ca);
      }
      d.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) rotate(${p.isSelf ? (+p.yaw || 0).toFixed(3) : 0}rad)`;
    }
    this._updMapDeaths(bw, bh);
    this._updBeacons(bw, bh, dt, u);
  }

  // beacon targets: allies in actor order (same numbering as the player controller), then the base spawn pad
  _beaconTargets() {
    const me = this._local();
    const out = new Array(NB).fill(null);
    if (this.lab && this.lab.beacons) return this.lab.beacons;
    if (!me) return out;
    const allies = (G.actors || []).filter((o) => o.team === me.team && o !== me);
    const mm = G.game && G.game.minimap;
    const tc = { x: 0, y: 0 };
    for (let i = 0; i < 3; i++) {
      const o = allies[i];
      if (!o || !mm) continue;
      mm.toCanvas(o.pos.x, o.pos.z, tc);
      out[i] = { x: tc.x / mm.w, y: tc.y / mm.h, name: o.name, weapon: o.weaponId, ok: !!(o.alive && !o.superJumpState), respawn: o.alive ? 0 : Math.ceil(o.respawnTimer || 0), actor: o };
    }
    const pad = G.level && G.level.spawnPads && G.level.spawnPads[me.team];
    if (pad && mm) { mm.toCanvas(pad.x, pad.z, tc); out[3] = { x: tc.x / mm.w, y: tc.y / mm.h, name: 'Base', ok: true, home: true, pad }; }
    // team jump beacons (oldest first — the same order the number keys use)
    const bs = G.subs && mm ? G.subs.beaconsFor(me.team).sort((x, y) => x.born - y.born).slice(0, NB - 4) : [];
    bs.forEach((b, k) => {
      mm.toCanvas(b.pos.x, b.pos.z, tc);
      // (its jumps left as lights: ●● a fresh one, ●○ its last jump)
      const left = '●'.repeat(Math.max(0, b.uses)) + '○'.repeat(Math.max(0, (b.sub?.uses || 2) - b.uses));
      out[4 + k] = { x: tc.x / mm.w, y: tc.y / mm.h, name: `${b.owner === me ? 'Your' : b.owner.name + "'s"} beacon ${left}`, ok: true, dev: true, beacon: b };
    });
    return out;
  }

  _updBeacons(bw, bh, dt, u = 16) {
    const M = this._map, L = this._L;
    const vis = this._mapT > 0.02;
    if (vis !== L.bcnVis) { L.bcnVis = vis; this.map.classList.toggle('has-beacons', vis); }
    if (!vis) return;
    const tg = this._beaconTargets();
    const me = this._local();
    const canJump = this.lab ? true : !!(me && me.canSuperJump && me.canSuperJump());
    // virtual cursor (pointer is locked in-game: steer with mouse deltas; magnet toward beacons)
    const inp = G.input;
    if (M.open && inp && inp.locked) {
      M.cx = clamp(M.cx + (inp.mouse.dx || 0) / Math.max(80, bw), 0.02, 0.98);
      M.cy = clamp(M.cy + (inp.mouse.dy || 0) / Math.max(80, bh), 0.02, 0.98);
      let best = -1, bd = 0.09;
      for (let i = 0; i < NB; i++) {
        const b = tg[i]; if (!b) continue;
        const d = Math.hypot((b.x - M.cx) * bw, (b.y - M.cy) * bh) / Math.max(bw, bh);
        if (d < bd) { bd = d; best = i; }
      }
      if (best !== M.hover) { M.hover = best; if (best >= 0) this._snd('ui_hover', { volume: 0.45 }); }
      if (inp.mouse.leftPressed && M.hover >= 0) this._jumpTo(M.hover);
      this.mapCursor.style.transform = `translate3d(${(M.cx * bw).toFixed(1)}px,${(M.cy * bh).toFixed(1)}px,0)`;
      this.mapCursor.classList.toggle('is-snap', M.hover >= 0);
    }
    if (M.open !== L.curOn) { L.curOn = M.open; this.mapCursor.classList.toggle('is-on', !!(M.open && inp && inp.locked)); }
    // number keys pressed this frame → flash the matching beacon (the controller performs the jump)
    if (M.open && inp) for (let i = 0; i < NB; i++) if (inp.wasPressed && inp.wasPressed('Digit' + slotKey(i))) { M.pressed = i; M.pressT = 0.5; this._restart(this.beacons[i], 'is-press'); }
    M.pressT = Math.max(0, M.pressT - dt);
    // spread overlapping beacons apart (allies often stand together at spawn); stems point at the true spots
    const P = this._bcnP || (this._bcnP = Array.from({ length: NB }, () => ({ x: 0, y: 0, ox: 0, oy: 0, on: false })));
    const minD = u * 3.4 * 1.3 * (this._mapT > 0.5 ? 1 : 0.6);
    for (let i = 0; i < NB; i++) { const b = tg[i], p = P[i]; p.on = !!b; if (b) { p.x = p.ox = b.x * bw; p.y = p.oy = b.y * bh; } }
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < NB; i++) for (let j = i + 1; j < NB; j++) {
        const a = P[i], c = P[j]; if (!a.on || !c.on) continue;
        let dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
        if (d >= minD) continue;
        if (d < 0.5) { const ang = (i * 2.1 + j * 1.3); dx = Math.cos(ang); dy = Math.sin(ang); d = 1; }
        const push = (minD - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push; c.x += (dx / d) * push; c.y += (dy / d) * push;
      }
    }
    for (let i = 0; i < NB; i++) {
      const el = this.beacons[i], b = tg[i], p = P[i];
      const key = b ? `${p.x.toFixed(0)}|${p.y.toFixed(0)}|${p.ox.toFixed(0)}|${p.oy.toFixed(0)}|${b.ok ? 1 : 0}|${b.respawn || 0}|${M.hover === i ? 1 : 0}|${canJump ? 1 : 0}|${b.name}` : 'x';
      this._updLegendRow(i, b, canJump);
      if (el._key === key) continue;
      el._key = key;
      if (!b) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0)`;
      const sx = p.ox - p.x, sy = p.oy - p.y, sl = Math.hypot(sx, sy);
      const stem = el.firstChild;
      if (sl > 3) { stem.style.display = ''; stem.style.width = sl.toFixed(1) + 'px'; stem.style.transform = `rotate(${Math.atan2(sy, sx).toFixed(3)}rad)`; }
      else stem.style.display = 'none';
      el.classList.toggle('is-off', !b.ok || !canJump);
      el.classList.toggle('is-hover', M.hover === i && b.ok && canJump);
      if (b.dev) el.querySelector('.iw-bcn__label b').textContent = b.name;
      else if (!b.home) {
        if (el._w !== b.weapon) { el._w = b.weapon; el.querySelector('.iw-bcn__icon').innerHTML = weaponIcon(kindOf(b.weapon)); }
        el.querySelector('.iw-bcn__label b').textContent = b.ok ? b.name : `${b.name} · ${b.respawn || '…'}`;
      }
    }
    // dashed jump arc from you to the hovered beacon
    const hb = M.hover >= 0 ? tg[M.hover] : null;
    const showLine = !!(hb && hb.ok && canJump && M.sx != null);
    if (showLine !== L.jl) { L.jl = showLine; this.mapJumpLine.classList.toggle('is-on', showLine); }
    if (showLine) {
      const x0 = M.sx * bw, y0 = M.sy * bh, x1 = hb.x * bw, y1 = hb.y * bh;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - Math.hypot(x1 - x0, y1 - y0) * 0.35;
      const d = `M${x0.toFixed(1)} ${y0.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
      if (d !== L.jlD) { L.jlD = d; const svg = this.mapJumpLine.firstChild; svg.setAttribute('width', bw.toFixed(0)); svg.setAttribute('height', bh.toFixed(0)); svg.firstChild.setAttribute('d', d); }
    }
  }

  _updLegendRow(i, b, canJump) {
    const row = this.legendRows[i], M = this._map;
    const key = b ? `${b.name}|${b.weapon || ''}|${b.ok ? 1 : 0}|${b.respawn || 0}|${M.hover === i ? 1 : 0}|${canJump ? 1 : 0}` : 'x';
    if (row._key === key) return;
    row._key = key;
    row.classList.toggle('is-empty', !b);
    if (!b) return;
    if (!b.home && !b.dev && row._w !== b.weapon) { row._w = b.weapon; row.querySelector('.iw-lg__w').innerHTML = weaponIcon(kindOf(b.weapon)); }
    row.querySelector('.iw-lg__name').textContent = b.name;
    const st = !canJump ? '—' : b.ok ? 'READY' : b.respawn ? `${b.respawn}s` : 'BUSY';
    row.querySelector('.iw-lg__st').textContent = st;
    row.classList.toggle('is-off', !b.ok || !canJump);
    row.classList.toggle('is-hover', M.hover === i && b.ok && canJump);
  }

  _jumpTo(i) {
    const tg = this._beaconTargets()[i];
    if (!tg || !tg.ok) { this._snd('ui_error', { volume: 0.5 }); return; }
    this._restart(this.beacons[i], 'is-press');
    if (this.lab) { this.lab.onJump?.(i); this._snd('ui_confirm'); return; }
    const me = this._local();
    if (!me || !me.canSuperJump || !me.canSuperJump()) { this._snd('ui_error', { volume: 0.5 }); return; }
    const ok = tg.home ? me.superJump(tg.pad.clone()) : tg.beacon ? G.subs.jumpToBeacon(me, tg.beacon) : me.superJump(tg.actor);
    if (!ok) this._snd('ui_error', { volume: 0.5 });
  }

  _updMarkers(ms) {
    const L = this._L;
    ms = ms || [];
    let byName = this._byName;
    const actors = this._actors();
    if (!byName || this._byNameN !== actors.length || this._byNameA !== actors[0]) {
      byName = this._byName = new Map(actors.map((a) => [a.name, a]));
      this._byNameN = actors.length; this._byNameA = actors[0];
    }
    for (let i = 0; i < this.markers.length; i++) {
      const el = this.markers[i], m = ms[i];
      const k = `mk${i}`;
      if (!m) { if (L[k] !== 'x') { L[k] = 'x'; el.style.display = 'none'; } continue; }
      const on = !!m.onScreen;
      const ac = byName.get(m.name);
      const ready = !!(ac && ac.specialReady && ac.specialReady());
      const far = m.dist != null ? clamp((m.dist - 14) / 20, 0, 1) : 0;
      const key = `${(+m.x).toFixed(0)}|${(+m.y).toFixed(0)}|${on ? 1 : 0}|${on ? 0 : (+m.angle || 0).toFixed(2)}|${m.name}|${m.color}|${ready ? 1 : 0}|${far.toFixed(1)}|${m.tracked ? 1 : 0}`;
      if (L[k] === key) continue;
      const prev = L[k];
      L[k] = key;
      if (prev === 'x' || !prev) el.style.display = '';
      if (el._name !== m.name) {
        el._name = m.name;
        el.querySelector('.iw-mk__tag b').textContent = m.name || '';
        const w = (ac && ac.weaponId) || m.weapon;
        el.querySelector('.iw-mk__w').innerHTML = w ? weaponIcon(kindOf(w)) : '';
      }
      const col = toHex(m.color, '#ffffff');
      if (el._col !== col) { el._col = col; colorVars(el, 'c', col); }
      if (el._on !== on) { el._on = on; el.classList.toggle('is-off', !on); }
      if (el._ready !== ready) { el._ready = ready; el.classList.toggle('is-ready', ready); }
      if (el._tracked !== !!m.tracked) { el._tracked = !!m.tracked; el.classList.toggle('is-tracked', !!m.tracked); if (m.tracked) el.querySelector('.iw-mk__tag b').textContent = `${m.name} · TRACKED`; }
      el.style.setProperty('--far', far.toFixed(2));
      el.style.transform = `translate3d(${(+m.x).toFixed(1)}px,${(+m.y).toFixed(1)}px,0)`;
      if (!on) el.lastChild.style.transform = `rotate(${(+m.angle || 0).toFixed(3)}rad)`;
    }
  }

  _updPrompt(p) {
    const L = this._L;
    const v = p || null;
    if (v === L.prompt) return;
    L.prompt = v;
    if (!v) { this.promptEl.classList.add('is-out'); return; }
    this.promptEl.innerHTML = richText(v);
    this.promptEl.classList.remove('is-out');
    this.promptEl.animate([{ transform: 'translateX(-50%) translateY(12px) scale(.85)', opacity: 0 }, { transform: 'translateX(-50%) translateY(0) scale(1)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }

  _updFps(fps, dt) {
    const L = this._L;
    const has = fps != null && isFinite(fps);
    if (has !== L.fpsOn) { L.fpsOn = has; this.fpsEl.style.display = has ? '' : 'none'; }
    if (!has) return;
    L.fpsT = (L.fpsT || 0) + dt;
    if (L.fpsT < 0.25 && L.fpsTxt) return;
    L.fpsT = 0;
    const txt = `${Math.round(fps)} FPS`;
    if (txt !== L.fpsTxt) { L.fpsTxt = txt; this.fpsEl.textContent = txt; this.fpsEl.classList.toggle('is-bad', fps < 45); }
  }

  // ================================================================ effects loop (self-driven so it works while paused / after the match)
  _addFx(name, fn) {
    this._fxMap = this._fxMap || new Map();
    this._fxMap.set(name, fn);
    if (!this._rafId) { this._lastFx = performance.now(); this._rafId = requestAnimationFrame(this._fxLoop); }
  }
  _fxLoop(t) {
    const raw = Math.min(0.25, Math.max(0, (t - this._lastFx) / 1000));
    this._lastFx = t;
    if (this.paused) { this._rafId = requestAnimationFrame(this._fxLoop); return; }
    const dt = raw * this.timeScale;
    this._fxTime += dt;
    for (const [name, fn] of this._fxMap) { let keep = true; try { keep = fn(dt) !== false; } catch (e) { console.error('[hud]', e); keep = false; } if (!keep) this._fxMap.delete(name); }
    this._rafId = this._fxMap.size ? requestAnimationFrame(this._fxLoop) : 0;
  }
  _restart(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // eslint-disable-line no-void
    el.classList.add(cls);
  }
  _expireFeed(el, fast) {
    if (el._out) return;
    el._out = true;
    clearTimeout(el._t);
    el.classList.add('is-out');
    const hgt = el.offsetHeight;
    const a = el.animate([
      { transform: 'translateX(0)', opacity: 1, height: hgt + 'px', marginBottom: getComputedStyle(el).marginBottom },
      { transform: 'translateX(40%)', opacity: 0, height: hgt + 'px', offset: 0.55 },
      { transform: 'translateX(60%)', opacity: 0, height: '0px', marginBottom: '0px' },
    ], { duration: fast ? 220 : 420, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
    a.onfinish = () => el.remove();
  }

  // ---------------------------------------------------------------- damage smears (fallback when ScreenFX is absent)
  _resizeCanvas() {
    const s = 0.6;
    const w = Math.max(2, Math.round(innerWidth * s)), hh = Math.max(2, Math.round(innerHeight * s));
    if (this.canvas.width !== w || this.canvas.height !== hh) { this.canvas.width = w; this.canvas.height = hh; }
    this._cs = s;
  }
  _spawnSmear(amount, hex, angle = null) {
    const W = this.canvas.width, H = this.canvas.height, m = Math.min(W, H);
    const r = m * (0.06 + Math.random() * 0.045) * (0.7 + amount * 0.75);
    let x, y;
    const depth = r * (0.1 + Math.random() * 0.7);
    if (angle !== null && Number.isFinite(angle)) {
      const a = angle + (Math.random() - 0.5) * 0.5;
      const cx = W / 2, cy = H / 2, ca = Math.cos(a), sa = Math.sin(a);
      const k = Math.min((W / 2) / Math.max(1e-3, Math.abs(ca)), (H / 2) / Math.max(1e-3, Math.abs(sa)));
      x = cx + ca * k; y = cy + sa * k;
      x = Math.min(W - depth, Math.max(depth, x - Math.sign(ca) * depth * (Math.abs(ca) > 0.3 ? 1 : 0)));
      y = Math.min(H - depth, Math.max(depth, y - Math.sign(sa) * depth * (Math.abs(sa) > 0.3 ? 1 : 0)));
    } else {
      const side = Math.random();
      if (side < 0.36) { x = depth; y = H * (0.12 + Math.random() * 0.76); }
      else if (side < 0.72) { x = W - depth; y = H * (0.12 + Math.random() * 0.76); }
      else if (side < 0.9) { x = W * (0.08 + Math.random() * 0.84); y = depth; }
      else { x = W * (0.1 + Math.random() * 0.8); y = H - depth; }
    }
    if (y > H * 0.55 && Math.abs(x - W / 2) < W * 0.2) x = W / 2 + Math.sign(x - W / 2 || (Math.random() - 0.5)) * W * (0.2 + Math.random() * 0.08);
    const S = Math.ceil(r * 3.4);
    const oc = document.createElement('canvas');
    oc.width = oc.height = S;
    const c = oc.getContext('2d');
    const shape = splatShape(S / 2, S / 2, r, { seed: (Math.random() * 1e6) | 0, arms: 7 + ((Math.random() * 5) | 0), drops: 5 + ((Math.random() * 4) | 0), armLen: 0.35 + Math.random() * 0.3 });
    const core = new Path2D(shape.core);
    c.fillStyle = shade(hex, -0.28);
    c.save(); c.translate(1.5, 2.5); c.fill(core); c.restore();
    c.fillStyle = hex; c.fill(core);
    for (const d of shape.drops) { c.beginPath(); c.arc(d.x, d.y, Math.max(1.5, d.r), 0, Math.PI * 2); c.fill(); }
    c.save(); c.clip(core);
    const g = c.createRadialGradient(S / 2 - r * 0.35, S / 2 - r * 0.4, 0, S / 2 - r * 0.35, S / 2 - r * 0.4, r * 0.9);
    g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.35, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    c.fillStyle = 'rgba(255,255,255,.75)';
    c.beginPath(); c.ellipse(S / 2 - r * 0.42, S / 2 - r * 0.45, r * 0.13, r * 0.08, -0.6, 0, Math.PI * 2); c.fill();
    c.restore();
    const drips = [];
    const nd = 1 + ((Math.random() * 3) | 0);
    for (let i = 0; i < nd; i++) drips.push({ dx: (Math.random() - 0.5) * r * 1.1, len: 0, max: r * (0.6 + Math.random() * 1.4), sp: r * (0.35 + Math.random() * 0.6), w: r * (0.09 + Math.random() * 0.08) });
    this._smears.push({ x, y, r, img: oc, S, hex, drips, age: 0, life: 1.35 + amount * 0.6 + Math.random() * 0.3, rot: 0 });
  }
  _tickSmears(dt) {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    for (let i = this._smears.length - 1; i >= 0; i--) {
      const s = this._smears[i];
      s.age += dt;
      if (s.age >= s.life) { this._smears.splice(i, 1); continue; }
      const fadeStart = s.life - 0.65;
      const a = s.age < fadeStart ? 1 : clamp(1 - (s.age - fadeStart) / 0.65);
      const pop = s.age < 0.16 ? easeOutBack(s.age / 0.16, 2.4) : 1;
      const sc = 0.55 + 0.45 * pop;
      c.globalAlpha = a * 0.94;
      c.fillStyle = s.hex;
      for (const d of s.drips) {
        d.len = Math.min(d.max, d.len + d.sp * dt * (1 - d.len / (d.max * 1.15)));
        const x0 = s.x + d.dx * sc, y0 = s.y + s.r * 0.2 * sc;
        c.fillRect(x0 - d.w / 2, y0, d.w, d.len);
        c.beginPath(); c.arc(x0, y0 + d.len, d.w * 0.78, 0, Math.PI * 2); c.fill();
      }
      c.save();
      c.translate(s.x, s.y); c.scale(sc, sc);
      c.drawImage(s.img, -s.S / 2, -s.S / 2);
      c.restore();
    }
    c.globalAlpha = 1;
    return this._smears.length > 0 || (c.clearRect(0, 0, W, H), false);
  }
}

// reduced motion: the CSS handles most of it; expose for callers that want to skip heavy one-shots
export const hudReducedMotion = prefersReducedMotion;
