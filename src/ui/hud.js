// INKWAVE — in-match HUD (contract: docs/CONTRACTS.md §3).
//   const hud = new HUD(rootEl [, { playSound }]);
//   hud.setVisible(bool) · hud.update(dt, HudFrame) · hud.banner(kind, text) · hud.countdown(n)
//   hud.hitMarker('hit'|'kill') · hud.feed({text,color,kind}) · hud.damage(amount, color, angle?)
//   hud.showSplatted({by, byColor, respawn}) · hud.hideSplatted() · hud.judge({colors, percents, names}) → Promise
// Additive: hud.attachScreenFX(fx) (src/fx/screenfx.js takes over the damage smears + low-HP vignette + splat tint),
//           hud.lab = { local, actors } (ui-lab: drives the event-driven systems without a match).
//
// Systems (all event/frame driven, dirty-checked, transforms/opacity only in per-frame paths):
//   roster top bar (weapon badges, splatted X + respawn ring, special-ready glow, you-caret, state pops) · timer
//   (last-minute / final-10 states) · special gauge (liquid orb, gain pulses, ready flare + rays, active spin) · turf
//   total pill + "+Np" ticker (aggregated 'turf' events) · per-weapon reticles (fire bloom, damage-scaled hit ticks,
//   kill X + ring burst, charge ring + full flash, spawn-shield ring, bomb-aim cost chip) · damage direction arcs ·
//   sloshing canvas ink tank (bubbles on refill, sub-cost line, low/empty states) · kill cards (victim + weapon) ·
//   streak callouts (first/double/triple/quad/wipeout/revenge/streak) · assist cards · ally-down pings in 3D ·
//   ally tags with weapon icons · minimap frame with super-jump beacons (1-4 keys, virtual cursor, click to jump) ·
//   intro team lineup · banners · final countdown · splatted card · judge reveal · feed.
//
// Conventions for frame fields the contract leaves open:
//   map.players[].yaw   radians on the minimap canvas: 0 = pointing up (−y), positive = clockwise.
//   markers[].angle     radians in screen space toward the off-screen ally: 0 = right, positive = clockwise (y down).
//   percents            accepted as 0..100 or 0..1.
import { h, clamp, colorVars, toHex, fmtTime, fmtInt, splatSVG, splatShape, pct, shade, lerp, easeOutBack, easeOutCubic, restartAnim } from './ui-util.js';
import { SQUID, SPLAT_ICON, DEATH_ICON, GLYPHS, SUB_ICONS, richText, keycap, specialIcon, weaponIcon } from './ui-icons.js';
import { WEAPONS, TEAM_NAMES, SUB, PLAYER, MATCH } from '../config.js';
import { on, G } from '../core/ctx.js';

let HUD_ID = 0;
const BUMP = { duration: 320, easing: 'cubic-bezier(.34,1.8,.64,1)' };
// dualies: the ring of the pistol that just fired jabs outward (SVG → Web Animations; the reflow restart trick needs HTML)
const TWIN_KICK = [{ transform: 'scale(1.55)', strokeWidth: '2.6px' }, { transform: 'scale(1)', strokeWidth: '1.8px' }];
const TWIN_KICK_T = { duration: 130, easing: 'cubic-bezier(.2,.8,.3,1)' };
const TAU = Math.PI * 2;
const STREAKS = { 2: 'DOUBLE SPLAT!', 3: 'TRIPLE SPLAT!', 4: 'QUAD SPLAT!' };
const kindOf = (w) => (WEAPONS[w] && WEAPONS[w].kind) || w || 'shooter';

// ------------------------------------------------------------------ HUD-only art
const K = '#15121c';
const SPAWN_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="48" rx="24" ry="9" fill="none" stroke="${K}" stroke-width="8"/><ellipse cx="32" cy="48" rx="24" ry="9" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 6 L32 36 M20 25 L32 38 L44 25" fill="none" stroke="${K}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 6 L32 36 M20 25 L32 38 L44 25" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const DROP_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 C32 5 51 28 51 41 C51 52 42.5 59 32 59 C21.5 59 13 52 13 41 C13 28 32 5 32 5 Z" fill="currentColor" stroke="${K}" stroke-width="4"/><path d="M24 37 Q24 30 29 26" stroke="#fff" stroke-opacity=".7" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
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
    this._downs = [];       // ally-down pings
    this._turfAcc = 0; this._turfT = 0; this._turfTotal = 0; this._turfShown = 0;
    this._kills = { times: [], streak: 0, first: false, lastKiller: null, dealt: new Map() };
    this._bloom = 0; this._kick = 0; this._hitN = 0; this._hitT = -9;
    this._tank = { level: 1, slosh: 0, sloshV: 0, wobble: 0, bubbles: [], prevInk: 1, prevYaw: null, prevVx: 0, prevVz: 0, empty: 0, t: 0 };
    this._map = { cx: 0.5, cy: 0.5, hover: -1, open: false, pressed: -1, pressT: 0 };
    this._build();
    this._fxLoop = this._fxLoop.bind(this);
    this._lastFx = 0;
    this._rafId = 0;
    this._onResize = () => { this._resizeCanvas(); this._tankBox = null; };
    addEventListener('resize', this._onResize);
    this._bindBus();
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
    this.top = h('div', { class: 'iw-hud__top' }, this.squads[0], this.timer, this.squads[1]);

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

    // ---- crosshair cluster
    this.ret = h('div', { class: 'iw-ret' });
    this.hitEl = h('div', { class: 'iw-hit' }, h('i'), h('i'), h('i'), h('i'));
    this.killEl = h('div', { class: 'iw-kill' }, h('span', { class: 'iw-kill__ring' }), h('span', { class: 'iw-kill__splat', html: SPLAT_ICON }), h('i'), h('i'), h('i'), h('i'));
    this.shield = h('div', { class: 'iw-shield', html: '<svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="36" pathLength="100"/></svg>' });
    this.subChip = h('div', { class: 'iw-subaim' }, h('i', { html: SUB_ICONS.bomb }), h('span', { class: 'iw-subaim__bar' }, h('i')), h('b', null, `${Math.round(SUB.bomb.inkCost)}%`));
    this.tankCanvas = h('canvas', { class: 'iw-tank__cv' });
    this.tankCtx = this.tankCanvas.getContext('2d');
    this.tank = h('div', { class: 'iw-tank' }, this.tankCanvas, h('div', { class: 'iw-tank__low' }, 'LOW INK'));
    this.tpops = h('div', { class: 'iw-tpops' });
    this.xh = h('div', { class: 'iw-xh' }, this.shield, this.ret, this.hitEl, this.killEl, this.tank, this.subChip, this.tpops);
    this.ddLayer = h('div', { class: 'iw-dds' });

    // ---- minimap + super-jump beacons
    this.mapSlot = h('div', { class: 'iw-map__slot' });
    const arrow = '<svg class="iw-mdot__arrow" viewBox="-13 -15 26 30" aria-hidden="true"><path class="o" d="M0 -11 L9 11 L0 5.5 L-9 11 Z"/><path class="i" d="M0 -11 L9 11 L0 5.5 L-9 11 Z"/></svg>';
    this.mapDots = Array.from({ length: 8 }, () => h('i', { class: 'iw-mdot', html: '<b></b>' + arrow }));
    this.mapFrame = h('div', { class: 'iw-map__frame' }, this.mapSlot, h('div', { class: 'iw-map__dots' }, this.mapDots), h('i', { class: 'iw-map__gloss' }));
    this.mapLabel = h('div', { class: 'iw-map__label' }, h('span', { html: keycap('TAB') }), h('span', null, 'MAP'));
    this.beacons = Array.from({ length: 4 }, (_, i) => {
      const b = h('div', { class: 'iw-bcn' + (i === 3 ? ' iw-bcn--home' : '') },
        h('span', { class: 'iw-bcn__stem' }, h('i')),
        h('span', { class: 'iw-bcn__pulse' }),
        h('span', { class: 'iw-bcn__disc' }, h('span', { class: 'iw-bcn__icon', html: i === 3 ? SPAWN_ICON : '' })),
        h('span', { class: 'iw-bcn__key' }, String(i + 1)),
        h('span', { class: 'iw-bcn__label' }, h('small', null, 'SUPER JUMP'), h('b', null, i === 3 ? 'Base' : '')));
      b.addEventListener('pointerenter', () => { if (this._map.open) this._map.hover = i; });
      b.addEventListener('pointerleave', () => { if (this._map.hover === i) this._map.hover = -1; });
      b.addEventListener('click', (e) => { e.stopPropagation(); this._jumpTo(i); });
      return b;
    });
    this.mapCursor = h('div', { class: 'iw-mcur' }, h('i'));
    this.mapJumpLine = h('div', { class: 'iw-map__jline', html: '<svg aria-hidden="true"><path/></svg>' });
    this.legendRows = Array.from({ length: 4 }, (_, i) => {
      const row = h('div', { class: 'iw-lg__row' + (i === 3 ? ' is-home' : '') },
        h('span', { class: 'iw-lg__key', html: keycap(String(i + 1)) }),
        h('span', { class: 'iw-lg__w', html: i === 3 ? SPAWN_ICON : '' }),
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
    this.downLayer = h('div', { class: 'iw-downs' });

    this.promptEl = h('div', { class: 'iw-prompt is-out' });
    this.fpsEl = h('div', { class: 'iw-fps' });
    this.bannerLayer = h('div', { class: 'iw-banners' });
    this.countLayer = h('div', { class: 'iw-counts' });
    this.splatLayer = h('div', { class: 'iw-splat-layer' });
    this.kcards = h('div', { class: 'iw-kcards' });
    this.callouts = h('div', { class: 'iw-callouts' });

    el.append(this.vig, this.canvas, this.downLayer, this.markerLayer, this.ddLayer, this.top, this.sp, this.turfEl, this.feedEl, this.xh,
      this.kcards, this.callouts, this.promptEl, this.mapDim, this.map, this.fpsEl, this.countLayer, this.bannerLayer, this.splatLayer);
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
    this._updTimer(f.time);
    if (f.teams) this._updSquads(f.teams);
    this._updCrosshair(f, dt);
    this._updTank(f, dt);
    this._updSpecial(f, dt);
    this._updTurf(dt);
    this._updHp(f.hp);
    this._updMap(f.map, dt);
    this._updMarkers(f.markers);
    this._updDamageDirs(dt);
    this._updDowns(dt);
    this._updPrompt(f.prompt);
    this._updFps(f.fps, dt);
  }

  banner(kind = 'custom', text) {
    const k = ['ready', 'go', 'one_minute', 'timesup', 'special', 'custom'].includes(kind) ? kind : 'custom';
    const defaults = { ready: 'READY?', go: 'GO!', one_minute: '1 minute left!', timesup: "TIME'S UP!", special: 'SPECIAL!', custom: '' };
    const label = text != null && text !== '' ? String(text) : defaults[k];
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
      el = h('div', { class: 'iw-bn iw-bn--timesup' },
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

  showSplatted({ by = null, byColor = '#2f5bff', respawn = 5 } = {}) {
    this.hideSplatted(true);
    const C = 2 * Math.PI * 44;
    const num = h('b', { class: 'iw-spl__num' }, String(Math.ceil(respawn)));
    const ring = h('div', { class: 'iw-spl__ring', html: `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="bg"/><circle cx="50" cy="50" r="44" class="fg" style="stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${C.toFixed(1)};animation-duration:${Math.max(0.1, respawn)}s;animation-timing-function:steps(${Math.ceil(Math.max(0.1, respawn) * 30)})"/></svg>` }, num, h('small', null, 'RESPAWN'));
    const tint = h('div', { class: 'iw-spl__tint' });
    this.el.prepend(tint);
    const killer = this._kills.lastKiller;
    const kw = killer && killer.weaponId ? h('span', { class: 'iw-spl__w', html: weaponIcon(kindOf(killer.weaponId)) }) : null;
    const el = h('div', { class: 'iw-spl' },
      h('div', { class: 'iw-spl__card' },
        h('div', { class: 'iw-spl__splat', html: splatSVG({ seed: 64, cls: 'iw-fby', r: 62, arms: 11, drops: 5, viewBox: 240 }) }),
        kw,
        h('div', { class: 'iw-spl__text' },
          h('div', { class: 'iw-spl__by' }, by ? 'SPLATTED BY' : 'SPLATTED!'),
          by ? h('div', { class: 'iw-spl__name iw-display' }, String(by)) : null,
          killer && killer.weaponId ? h('div', { class: 'iw-spl__wn' }, (WEAPONS[killer.weaponId] || {}).name || '') : null),
        ring),
      h('div', { class: 'iw-spl__hint', html: richText('Hold [TAB] to plan a Super Jump') }));
    colorVars(el, 'by', toHex(byColor, '#2f5bff'));
    this.splatLayer.appendChild(el);
    const st = { el, tint, end: this._fxTime + Math.max(0, respawn), num, last: Math.ceil(respawn) };
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

  judge({ colors = ['#ff8a14', '#2f5bff'], percents = [50, 50], names = TEAM_NAMES } = {}) {
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
    this.el.remove(); this.overLayer.remove();
  }

  // ================================================================ bus: event-driven systems
  _snd(name, o) { try { this.playSound && this.playSound(name, o); } catch (e) { /* optional */ } }
  _live() { if (this.lab) return true; const m = G.match; return !!(m && !m.attract && G.mode === 'match'); }
  _local() { return this.lab ? this.lab.local : G.match?.local || null; }
  _actors() { return this.lab ? this.lab.actors || [] : G.match?.actors || G.actors || []; }
  _now() { return this._fxTime; }
  _specialId() { const a = this._local(); const w = a && WEAPONS[a.weaponId]; return w ? w.special : 'slam'; }

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
      on('respawn', ({ actor }) => { if (actor && actor === this._local()) this._clearDamageDirs(); }),
      on('recoil', ({ amount }) => { if (this._live()) { this._bloom = Math.min(1, this._bloom + 0.18 + (amount || 0) * 6); this._tank.wobble = Math.min(1, this._tank.wobble + 0.25); } }),
      on('weapon:fire', ({ actor, hand }) => {
        if (!actor || actor !== this._local() || !this._live()) return;
        this._kick = 1; this._tank.wobble = Math.min(1, this._tank.wobble + 0.06);
        if (this._L.kind === 'dualies' && this._twin) { const el = this._twin[hand ? 1 : 0]; if (el && el.animate) el.animate(TWIN_KICK, TWIN_KICK_T); }
      }),
      on('lowink', ({ actor }) => { if (actor === this._local() && this._live()) { this._tank.empty = 0.45; this._restart(this.tank, 'is-empty'); } }),
      on('special:ready', ({ actor }) => { if (actor === this._local() && this._live()) this._restart(this.sp, 'is-flare'); }),
      on('superjump', ({ actor, phase, to }) => { if (actor === this._local() && phase === 'charge' && this._live()) this._snd('ui_confirm', { volume: 0.6 }); void to; }),
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
    this.kcards.innerHTML = ''; this.callouts.innerHTML = ''; this.tpops.innerHTML = ''; this.downLayer.innerHTML = ''; this._downs = [];
    this.el.classList.remove('is-live');
    this._L.turfN = null;
    this.turfNum.textContent = '0';
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
    if (me && victim.team === me.team) this._allyDown(victim, attacker);
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
    const el = h('div', { class: 'iw-lineup' },
      side(0),
      h('div', { class: 'iw-lu__vs' }, h('span', { class: 'iw-lu__vsplat', html: splatSVG({ seed: 77, fill: '#fff', r: 56, arms: 10, drops: 6 }) }), h('span', { class: 'iw-display' }, 'VS')),
      side(1));
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

  // ---------------------------------------------------------------- ally-down pings
  _allyDown(victim, attacker) {
    if (!victim.pos) return;
    const el = h('div', { class: 'iw-down' }, h('i', { html: DEATH_ICON }), h('span', null, victim.name));
    colorVars(el, 'c', toHex(G.teamHex?.[victim.team], this._L.ca || '#ff8a14'));
    this.downLayer.appendChild(el);
    this._downs.push({ el, x: victim.pos.x, y: victim.pos.y + 1.2, z: victim.pos.z, t: 0 });
    if (this._downs.length > 4) this._downs.shift().el.remove();
    void attacker;
  }
  _updDowns(dt) {
    if (!this._downs.length) return;
    const cam = G.camera;
    const W = innerWidth, H = innerHeight;
    for (let i = this._downs.length - 1; i >= 0; i--) {
      const d = this._downs[i];
      d.t += dt;
      if (d.t > 3 || !cam) { d.el.remove(); this._downs.splice(i, 1); continue; }
      const p = this._project(cam, d.x, d.y, d.z);
      const vis = p && p.z < 1 && p.x > -1.1 && p.x < 1.1 && p.y > -1.1 && p.y < 1.1;
      if (!vis) { d.el.style.opacity = '0'; continue; }
      const o = d.t < 2.4 ? 1 : 1 - (d.t - 2.4) / 0.6;
      d.el.style.opacity = o.toFixed(2);
      d.el.style.transform = `translate3d(${((p.x * 0.5 + 0.5) * W).toFixed(1)}px,${((-p.y * 0.5 + 0.5) * H).toFixed(1)}px,0)`;
    }
  }
  _project(cam, x, y, z) {
    // world → NDC without three.js (camera matrices are plain arrays)
    const v = cam.matrixWorldInverse.elements, p = cam.projectionMatrix.elements;
    const ex = v[0] * x + v[4] * y + v[8] * z + v[12], ey = v[1] * x + v[5] * y + v[9] * z + v[13], ez = v[2] * x + v[6] * y + v[10] * z + v[14];
    const cx = p[0] * ex + p[4] * ey + p[8] * ez + p[12], cy = p[1] * ex + p[5] * ey + p[9] * ez + p[13], cz = p[2] * ex + p[6] * ey + p[10] * ez + p[14], cw = p[3] * ex + p[7] * ey + p[11] * ez + p[15];
    if (Math.abs(cw) < 1e-6) return null;
    return { x: cx / cw, y: cy / cw, z: cw < 0 ? 2 : cz / cw };
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

  _actorFor(team, i) {
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
          const d = Math.max(0.2, p.respawn || PLAYER.respawnTime);
          ring.style.animationDuration = `${d}s`;
          ring.style.animationTimingFunction = `steps(${Math.ceil(d * 30)})`;
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
    } else {
      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true"><circle r="15" class="iw-ret__ring thin"/></svg>
        <i class="iw-ret__tick" style="--a:0deg"></i><i class="iw-ret__tick" style="--a:90deg"></i><i class="iw-ret__tick" style="--a:180deg"></i><i class="iw-ret__tick" style="--a:270deg"></i>`;
    }
    this._L.spread = null; this._L.charge = null; this._L.full = null;
  }

  _updCrosshair(f, dt) {
    const L = this._L;
    const w = f.weapon || 'shooter';
    if (w !== L.weapon) {
      L.weapon = w;
      const W = WEAPONS[w];
      const kind = (W && W.kind) || w;
      this._buildReticle(kind);
      L.kind = kind;
      this.xh.className = `iw-xh iw-xh--${kind}` + (L.tgt ? ' is-target' : '') + (L.far ? ' is-far' : '');
      this.spIcon.innerHTML = specialIcon(W ? W.special : 'slam');
    }
    // per-shot kick (recoil events) on top of the live cone the engine reports in screen px (already includes bloom)
    this._bloom = Math.max(0, this._bloom - dt * 5);
    this._kick = Math.max(0, (this._kick || 0) - dt * 16);   // per-shot reticle kick (~60 ms), on top of the live spread
    const ch = f.crosshair || {};
    if (L.kind === 'shooter' || L.kind === 'blaster' || L.kind === 'dualies' || L.kind === 'splatling') {
      const kk = L.kind === 'blaster' ? 0 : this._kick * this._kick * (L.kind === 'splatling' ? 4 : 7);
      const sp = clamp((+ch.spread || 0) + this._bloom * (L.kind === 'blaster' ? 5 : 2.5) + kk, 0, 90);
      if (L.spread == null || Math.abs(sp - L.spread) > 0.25) { L.spread = sp; this.ret.style.setProperty('--sp', sp.toFixed(1)); }
    } else {
      const b = this._bloom;
      if (L.bl == null || Math.abs(b - L.bl) > 0.02) { L.bl = b; this.ret.style.setProperty('--bl', b.toFixed(2)); }
    }
    const tgt = ch.onTarget === 'enemy';
    if (tgt !== L.tgt) { L.tgt = tgt; this.xh.classList.toggle('is-target', tgt); }
    const far = ch.inRange === false && !tgt;
    if (far !== L.far) { L.far = far; this.xh.classList.toggle('is-far', far); }
    if (L.kind === 'charger') {
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
      const lr = this._local()?.weaponRunner;
      const c = clamp(+f.charge || 0), streaming = !!(lr && lr.streaming);
      if (L.charge == null || Math.abs(c - L.charge) > 0.004) { L.charge = c; this._chargeEl.style.strokeDashoffset = (100 * (1 - c)).toFixed(2); this.ret.style.setProperty('--ch', c.toFixed(3)); }
      if (streaming !== L.streaming) { L.streaming = streaming; this.ret.classList.toggle('is-streaming', streaming); }
      const full = !streaming && c >= 0.999;
      if (full !== L.full) { L.full = full; this.ret.classList.toggle('is-full', full); if (full) this._restart(this.ret, 'is-flash'); }
    } else if (L.kind === 'dualies') {
      const lr = this._local()?.weaponRunner;
      const lock = !!(lr && lr.lockT > 0), roll = !!(lr && lr.dodge);
      if (lock !== L.lock) { L.lock = lock; this.ret.classList.toggle('is-lock', lock); }
      if (roll !== L.roll) { L.roll = roll; this.ret.classList.toggle('is-roll', roll); }
    }
    if (L.kind === 'slosher') {
      const k = this._kick;
      if (L.bk == null || Math.abs(k - L.bk) > 0.02) { L.bk = k; this.ret.style.setProperty('--kk', k.toFixed(2)); }
    }
    // spawn shield + bomb aim (read straight off the local actor; absent in the lab unless mocked)
    const a = this._local();
    const inv = !!(a && a.alive && a.invuln > 0.05);
    if (inv !== L.inv) { L.inv = inv; this.shield.classList.toggle('is-up', inv); }
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
    if ((idle && !T.bubbles.length && Math.abs(T.sloshV) < 0.01) || L.spect) return;
    this._drawTank(dt, sub, low, nosub);
  }

  _drawTank(dt, sub, low, nosub) {
    const T = this._tank, c = this.tankCtx, cv = this.tankCanvas;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const box = this._tankBox || (this._tankBox = [cv.clientWidth || 18, cv.clientHeight || 74]);   // reading it per frame forces a layout
    const W = Math.round(box[0] * dpr), H = Math.round(box[1] * dpr);
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
    const n = Math.floor(this._turfShown);
    if (n !== this._L.turfN) { this._L.turfN = n; this.turfNum.textContent = fmtInt(n); }
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
      const sk = `${p.isSelf ? 1 : 0}|${p.alive === false ? 0 : 1}|${p.team}`;
      if (d._sk !== sk) {
        d._sk = sk;
        d.className = 'iw-mdot' + (p.isSelf ? ' is-self' : '') + (p.alive === false ? ' is-dead' : '') + (p.team === 1 ? ' is-enemy' : '');
        d.style.setProperty('--c', p.team === 1 ? cb : ca);
      }
      d.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) rotate(${p.isSelf ? (+p.yaw || 0).toFixed(3) : 0}rad)`;
    }
    this._updBeacons(bw, bh, dt, u);
  }

  // beacon targets: allies in actor order (same numbering as the player controller), then the base spawn pad
  _beaconTargets() {
    const me = this._local();
    const out = [null, null, null, null];
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
      for (let i = 0; i < 4; i++) {
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
    if (M.open && inp) for (let i = 0; i < 4; i++) if (inp.wasPressed && inp.wasPressed('Digit' + (i + 1))) { M.pressed = i; M.pressT = 0.5; this._restart(this.beacons[i], 'is-press'); }
    M.pressT = Math.max(0, M.pressT - dt);
    // spread overlapping beacons apart (allies often stand together at spawn); stems point at the true spots
    const P = this._bcnP || (this._bcnP = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, ox: 0, oy: 0, on: false })));
    const minD = u * 3.4 * 1.3 * (this._mapT > 0.5 ? 1 : 0.6);
    for (let i = 0; i < 4; i++) { const b = tg[i], p = P[i]; p.on = !!b; if (b) { p.x = p.ox = b.x * bw; p.y = p.oy = b.y * bh; } }
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        const a = P[i], c = P[j]; if (!a.on || !c.on) continue;
        let dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
        if (d >= minD) continue;
        if (d < 0.5) { const ang = (i * 2.1 + j * 1.3); dx = Math.cos(ang); dy = Math.sin(ang); d = 1; }
        const push = (minD - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push; c.x += (dx / d) * push; c.y += (dy / d) * push;
      }
    }
    for (let i = 0; i < 4; i++) {
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
      if (!b.home) {
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
    if (!b.home && row._w !== b.weapon) { row._w = b.weapon; row.querySelector('.iw-lg__w').innerHTML = weaponIcon(kindOf(b.weapon)); }
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
    const ok = tg.home ? me.superJump(tg.pad.clone()) : me.superJump(tg.actor);
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
      const key = `${(+m.x).toFixed(0)}|${(+m.y).toFixed(0)}|${on ? 1 : 0}|${on ? 0 : (+m.angle || 0).toFixed(2)}|${m.name}|${m.color}|${ready ? 1 : 0}|${far.toFixed(1)}`;
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
