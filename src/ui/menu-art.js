// INKWAVE UI — menu art + helpers (menus stream).
//   computeAwards(players, { win, percents }) → { byPlayer: [[award…]…], match: [tag…] }
//   awardIcon(id) · medalMarkup(award) · awardBadge(award) · rankEmblem(tier) · RANK_TIERS
//   inkBurst(parent, { x, y, color, count, dist, size, splat, ring })     — DOM ink splash (auto-removes)
//   InkWipe(host, { isFrozen })  .run({ a, b, mode:'full'|'light'|'fade', dir, onMid, onDone })
//   createPreview(key, ctx) → { el, set(value, settings), tick(dt) }       — settings live previews
import {
  h, clamp, lerp, easeInOutCubic, easeOutBack, rng, splatShape, splatSVG, shade, fmtInt, safeCall,
} from './ui-util.js';
import { SQUID, GLYPHS, WEAPON_ICONS, SPLAT_ICON, SPECIAL_ICONS, mouseGlyph, padGlyph, keycap } from './ui-icons.js';

const K = '#15121c';
const TAU = Math.PI * 2;
const svg = (body, vb = '0 0 64 64', cls = '') => `<svg class="iw-ico ${cls}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ================================================================================== award icons (silhouettes)
// currentColor = the glyph; `.iw-ico-cut` strokes/fills take the medal's light metal colour (set in CSS).
const splatCore = (() => { const s = splatShape(32, 32, 17, { seed: 11, arms: 8, drops: 4, armLen: 0.5 }); return `<path d="${s.core}"/>${s.drops.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="${Math.max(2.4, d.r)}"/>`).join('')}`; })();
export const AWARD_ICONS = {
  star: svg(`<path d="M32 5 L39.6 22.9 L58.6 24.6 L44.2 37.3 L48.4 56.2 L32 46.4 L15.6 56.2 L19.8 37.3 L5.4 24.6 L24.4 22.9 Z" fill="currentColor" stroke="currentColor" stroke-width="4.5" stroke-linejoin="round"/>
    <path class="iw-ico-cut" d="M25.5 27.5 L29.8 26.9" fill="none" stroke-width="3.6" stroke-linecap="round"/>`),
  crown: svg(`<path d="M7.5 22 L20 33.5 L32 11.5 L44 33.5 L56.5 22 L51.5 47 L12.5 47 Z" fill="currentColor" stroke="currentColor" stroke-width="4.5" stroke-linejoin="round"/>
    <rect x="12" y="50.5" width="40" height="7" rx="3" fill="currentColor"/>
    <circle cx="7.5" cy="21" r="4.6" fill="currentColor"/><circle cx="32" cy="10" r="4.6" fill="currentColor"/><circle cx="56.5" cy="21" r="4.6" fill="currentColor"/>
    <circle class="iw-ico-cut" cx="32" cy="36" r="4.2" stroke="none"/>`),
  roller: svg(`<rect x="6" y="9" width="40" height="18" rx="7.5" fill="currentColor"/>
    <path d="M46 18 H53 Q57 18 57 22 V30 Q57 34 53 34 H35 V41" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="29.5" y="39" width="11" height="20" rx="4.5" fill="currentColor"/>
    <path d="M14 27 Q14 36 17.5 36 Q21 36 21 27 Z M27 27 Q27 32 29.2 32 Q31.4 32 31.4 27 Z" fill="currentColor"/>
    <path class="iw-ico-cut" d="M12 15 H36" fill="none" stroke-width="3.4" stroke-linecap="round"/>`),
  splat: svg(`<g fill="currentColor">${splatCore}</g><circle class="iw-ico-cut" cx="27" cy="27" r="3.2" stroke="none"/>`),
  shield: svg(`<path d="M32 5 L53 12.5 L53 29 C53 43.5 44 53 32 59 C20 53 11 43.5 11 29 L11 12.5 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
    <path class="iw-ico-cut" d="M21.5 31.5 L29 39 L43.5 23.5" fill="none" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  buoy: svg(`<circle cx="32" cy="32" r="21.5" fill="none" stroke="currentColor" stroke-width="13"/>
    <g class="iw-ico-cut" fill="none" stroke-width="13"><path d="M32 10.5 A21.5 21.5 0 0 1 44.6 14.6"/><path d="M53.5 32 A21.5 21.5 0 0 1 49.4 44.6"/><path d="M32 53.5 A21.5 21.5 0 0 1 19.4 49.4"/><path d="M10.5 32 A21.5 21.5 0 0 1 14.6 19.4"/></g>`),
  brush: svg(`<path d="M50.5 6.5 Q57.5 6.5 57.5 13.5 L36 35 L29 28 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
    <path d="M27 30 L34 37 L31 40 L24 33 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
    <path d="M22.5 35 L29 41.5 Q27.5 51.5 17 55.5 Q10 58 5.5 57.5 Q10 53 10.5 47 Q11.5 37 22.5 35 Z" fill="currentColor"/>
    <path class="iw-ico-cut" d="M46 13.5 L39.5 20" fill="none" stroke-width="3.2" stroke-linecap="round"/>`),
  stopwatch: svg(`<circle cx="32" cy="36" r="21" fill="currentColor"/><rect x="26" y="5" width="12" height="7" rx="2.5" fill="currentColor"/><path d="M32 12 V15" stroke="currentColor" stroke-width="5"/>
    <path class="iw-ico-cut" d="M32 36 L32 23 M32 36 L40.5 41" fill="none" stroke-width="4.6" stroke-linecap="round"/>`),
  wave: svg(`<path d="M4 50 Q10 22 34 14 Q52 9 59 22 Q48 18 42 24 Q37 30 43 36 Q49 41 58 38 Q55 52 36 56 Q18 59 4 50 Z" fill="currentColor"/>
    <path class="iw-ico-cut" d="M14 44 Q22 34 32 30" fill="none" stroke-width="3.4" stroke-linecap="round"/>`),
};
export const awardIcon = (id) => AWARD_ICONS[id] || AWARD_ICONS.star;

// ================================================================================== awards
export const AWARDS = {
  mvp: { label: 'MVP', metal: 'gold', icon: 'star', desc: 'Best all-round score on the winning team' },
  turf: { label: 'TURF KING', metal: 'gold', icon: 'crown', desc: 'Most turf inked in the match' },
  splats: { label: 'TOP SPLATTER', metal: 'silver', icon: 'splat', desc: 'Most splats in the match' },
  inker: { label: 'TOP INKER', metal: 'silver', icon: 'roller', desc: 'Most turf inked on their team' },
  untouchable: { label: 'UNTOUCHABLE', metal: 'bronze', icon: 'shield', desc: 'Never got splatted' },
  survivor: { label: 'SURVIVOR', metal: 'bronze', icon: 'buoy', desc: 'Splatted the fewest times' },
  pure: { label: 'PURE PAINTER', metal: 'bronze', icon: 'brush', desc: 'Top-3 turf without splatting anyone' },
};
const AWARD_ORDER = ['mvp', 'turf', 'splats', 'inker', 'untouchable', 'survivor', 'pure'];
export const MATCH_TAGS = {
  close: { id: 'close', label: 'PHOTO FINISH', icon: 'stopwatch' },
  landslide: { id: 'landslide', label: 'LANDSLIDE', icon: 'wave' },
};

/**
 * Derives awards honestly from the final stats only (no timeline data exists, so no "comeback" style awards).
 * players: [{ name, team, weapon, turf, splats, deaths, isSelf }] (ResultsData order). percents: 0..100 or 0..1.
 */
export function computeAwards(players = [], { win = true, percents = [50, 50] } = {}) {
  const P = players.map((p, i) => ({ i, team: p.team | 0, turf: Math.max(0, +p.turf || 0), splats: Math.max(0, +p.splats || 0), deaths: Math.max(0, +p.deaths || 0), isSelf: !!p.isSelf }));
  const by = P.map(() => []);
  const give = (p, id, value) => { if (!by[p.i].some((a) => a.id === id)) by[p.i].push({ id, ...AWARDS[id], value }); };
  const maxOf = (k, arr = P) => (arr.length ? Math.max(...arr.map((p) => p[k])) : 0);
  if (P.length) {
    // Turf King — most turf in the lobby (ties share the crown)
    const mt = maxOf('turf');
    const kings = mt > 0 ? P.filter((p) => p.turf === mt) : [];
    kings.forEach((p) => give(p, 'turf', `${fmtInt(p.turf)}p inked`));
    // Top Inker — best painter on each team that doesn't already hold the crown
    for (const t of [0, 1]) {
      const team = P.filter((p) => p.team === t);
      if (!team.length || team.some((p) => kings.includes(p))) continue;
      const m = maxOf('turf', team);
      if (m > 0) team.filter((p) => p.turf === m).forEach((p) => give(p, 'inker', `${fmtInt(p.turf)}p inked`));
    }
    // Top Splatter
    const ms = maxOf('splats');
    if (ms > 0) P.filter((p) => p.splats === ms).forEach((p) => give(p, 'splats', `${ms} splat${ms === 1 ? '' : 's'}`));
    // Untouchable (never splatted — only special when few managed it) / Survivor (unique fewest)
    const active = P.filter((p) => p.turf >= 30 || p.splats > 0);
    const zero = active.filter((p) => p.deaths === 0);
    if (zero.length && zero.length <= 3) zero.forEach((p) => give(p, 'untouchable', 'Never splatted'));
    else if (!zero.length && active.length) {
      const md = Math.min(...active.map((p) => p.deaths));
      const s = active.filter((p) => p.deaths === md);
      if (s.length === 1) give(s[0], 'survivor', `Splatted ${md}×`);
    }
    // Pure Painter — top-3 turf with zero splats
    [...P].sort((a, b) => b.turf - a.turf).slice(0, 3).filter((p) => p.splats === 0 && p.turf > 0).forEach((p) => give(p, 'pure', `${fmtInt(p.turf)}p · 0 splats`));
    // MVP — best normalised all-round score on the winning team
    const self = P.find((p) => p.isSelf);
    const selfTeam = self ? self.team : 0;
    const wt = win ? selfTeam : 1 - selfTeam;
    const mT = Math.max(1, mt), mS = Math.max(1, ms), mD = Math.max(1, maxOf('deaths'));
    const score = (p) => p.turf / mT + 0.55 * (p.splats / mS) - 0.3 * (p.deaths / mD);
    const winners = P.filter((p) => p.team === wt && (p.turf > 0 || p.splats > 0));
    if (winners.length) {
      const best = winners.reduce((b, p) => (score(p) > score(b) + 1e-9 || (Math.abs(score(p) - score(b)) < 1e-9 && p.turf > b.turf) ? p : b));
      give(best, 'mvp', 'Top all-round score');
    }
    for (const list of by) list.sort((x, y) => AWARD_ORDER.indexOf(x.id) - AWARD_ORDER.indexOf(y.id));
  }
  // match tags from the final coverage margin (percentage points)
  let [pa, pb] = (percents || [50, 50]).map((v) => +v || 0);
  if (pa <= 1.0001 && pb <= 1.0001) { pa *= 100; pb *= 100; }
  const margin = Math.abs(pa - pb);
  const match = [];
  if (margin < 3) match.push({ ...MATCH_TAGS.close, value: `${margin.toFixed(1)}% margin` });
  else if (margin >= 20) match.push({ ...MATCH_TAGS.landslide, value: `+${margin.toFixed(1)}%` });
  return { byPlayer: by, match };
}

/** Big stamped medal for the local player's awards. */
export function medalMarkup(aw, seed = 1) {
  return `<div class="iw-medal is-${aw.metal}" data-aw="${aw.id}" title="${aw.label} — ${aw.desc}">
    <span class="iw-medal__burst">${splatSVG({ seed: 60 + seed * 7, cls: 'iw-fself', r: 54, arms: 9, drops: 5 })}</span>
    <span class="iw-medal__ribbon"><i></i><i></i></span>
    <span class="iw-medal__disc"><span class="iw-medal__face">${awardIcon(aw.icon)}</span><i class="iw-medal__shine"></i></span>
    <span class="iw-medal__label">${aw.label}</span>
    <span class="iw-medal__val">${aw.value || ''}</span>
  </div>`;
}
/** Small award chip for the team tables. */
export function awardBadge(aw) {
  return h('span', { class: `iw-aw is-${aw.metal}`, 'data-aw': aw.id, title: `${aw.label} — ${aw.desc}`, html: awardIcon(aw.icon) });
}

// ================================================================================== ranks
export const RANK_TIERS = [
  { lv: 1, name: 'Fresh Recruit', cls: 'is-t0' },
  { lv: 5, name: 'Turf Scrapper', cls: 'is-t1' },
  { lv: 10, name: 'Ink Slinger', cls: 'is-t2' },
  { lv: 20, name: 'Splat Veteran', cls: 'is-t3' },
  { lv: 30, name: 'Tide Legend', cls: 'is-t4' },
];
export const rankTier = (level) => RANK_TIERS.reduce((acc, r, i) => (level >= r.lv ? i : acc), 0);
/** Shield emblem with one pip per tier (tier 0..4). Colour via CSS (--rk). */
export function rankEmblem(tier = 0) {
  const n = clamp(tier | 0, 0, 4) + 1;
  const pips = Array.from({ length: n }, (_, i) => {
    const x = 32 + (i - (n - 1) / 2) * 8.6;
    return `<path d="M${x} ${37.5 - 5.2} L${x + 4.3} ${37.5} L${x} ${37.5 + 5.2} L${x - 4.3} ${37.5} Z" fill="${K}"/>`;
  }).join('');
  return svg(`<path d="M32 4 L56 13.5 L56 33 C56 47.5 45.5 56 32 61 C18.5 56 8 47.5 8 33 L8 13.5 Z" fill="var(--rk)" stroke="${K}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M32 10.5 L50 17.8 L50 22 L14 22 L14 17.8 Z" fill="#fff" fill-opacity=".45"/>
    <path d="M18 26 L46 26" stroke="${K}" stroke-width="3" stroke-linecap="round" opacity=".25"/>${pips}`, '0 0 64 64', 'iw-rank');
}

// ================================================================================== DOM ink burst
let burstSeed = 7;
/** Spawns a short-lived ink splash (splat + flying droplets) at client coords inside `parent` (absolute, top-left at 0,0). */
export function inkBurst(parent, { x = 0, y = 0, color = 'var(--a)', count = 12, dist = 6, size = 1, splat = true, ring = false, life = 1100 } = {}) {
  if (!parent || !parent.isConnected) return null;
  const R = rng((burstSeed += 7919));
  const w = h('div', { class: 'iw-burst', style: { left: `${x.toFixed(1)}px`, top: `${y.toFixed(1)}px`, '--c': color, '--s': size } });
  if (splat) w.appendChild(h('i', { class: 'iw-burst__splat', html: splatSVG({ seed: (R() * 997) | 0, fill: 'currentColor', r: 50, arms: 9, drops: 0 }) }));
  if (ring) w.appendChild(h('i', { class: 'iw-burst__ring' }));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + (R() - 0.5) * 0.8;
    const d = dist * (0.5 + R() * 0.75);
    w.appendChild(h('i', { class: 'iw-burst__drop', style: {
      '--dx': `calc(var(--u) * ${(Math.cos(a) * d).toFixed(2)})`, '--dy': `calc(var(--u) * ${(Math.sin(a) * d).toFixed(2)})`,
      '--r': (size * (0.35 + R() * 0.6)).toFixed(2), '--t': `${(0.42 + R() * 0.3).toFixed(2)}s`,
    } }));
  }
  parent.appendChild(w);
  setTimeout(() => w.remove(), life);
  return w;
}

// ================================================================================== ink wipe (canvas)
/** Tongue hanging DOWN from an edge point (x, y): half-width w at the base, length L, round bulb radius b. Clockwise. */
function tongueDown(ctx, x, y, w, L, b) {
  const tip = y + L;
  ctx.moveTo(x + w, y - 3);
  ctx.bezierCurveTo(x + w * 0.32, y + L * 0.14, x + b * 0.85, tip - L * 0.55, x + b * 0.7, tip - b * 0.45);
  ctx.arc(x, tip - b * 0.2, b, -0.25, Math.PI + 0.25, false);
  ctx.bezierCurveTo(x - b * 0.85, tip - L * 0.55, x - w * 0.32, y + L * 0.14, x - w, y - 3);
  ctx.closePath();
}
/** Streak reaching UP from an edge point (x, y). Clockwise. */
function tongueUp(ctx, x, y, w, L, c) {
  const tip = y - L;
  ctx.moveTo(x - w, y + 3);
  ctx.bezierCurveTo(x - w * 0.3, y - L * 0.16, x - c, tip + L * 0.42, x - c, tip + c * 0.35);
  ctx.arc(x, tip + c * 0.35, c, Math.PI, TAU, false);
  ctx.bezierCurveTo(x + c, tip + L * 0.42, x + w * 0.3, y - L * 0.16, x + w, y + 3);
  ctx.closePath();
}
/** Tongue reaching sideways (dir = +1 right / -1 left) from an edge point, for the light sweep. */
function tongueSide(ctx, x, y, w, L, c, dir) {
  const tip = x + L * dir;
  ctx.moveTo(x - 3 * dir, y - w);
  ctx.bezierCurveTo(x + L * 0.16 * dir, y - w * 0.3, tip - L * 0.42 * dir, y - c, tip - c * 0.35 * dir, y - c);
  ctx.arc(tip - c * 0.35 * dir, y, c, -Math.PI / 2, Math.PI / 2, dir < 0);
  ctx.bezierCurveTo(tip - L * 0.42 * dir, y + c, x + L * 0.16 * dir, y + w * 0.3, x - 3 * dir, y + w);
  ctx.closePath();
}

export const WIPE = { mid: 380, total: 1000, revealAt: 500 };

export class InkWipe {
  constructor(host, { isFrozen } = {}) {
    this.host = host;
    this.cv = h('canvas', { class: 'iw-wipe__cv' });
    this.mark = h('div', { class: 'iw-wipe__mark' }, h('i', { class: 'iw-wipe__ring' }), h('span', { class: 'iw-wipe__squid', html: SQUID }));
    host.append(this.cv, this.mark);
    this.ctx = this.cv.getContext('2d');
    this.isFrozen = isFrozen || (() => false);
    this.timeScale = 1;
    this.r = null;
    this._frame = this._frame.bind(this);
    this._pat = null;
  }
  get busy() { return !!(this.r && this.r.mode !== 'light'); }
  get running() { return !!this.r; }

  _pattern() {
    if (this._pat) return this._pat;
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.arc(8, 8, 1.9, 0, TAU); g.fill();
    this._pat = this.ctx.createPattern(c, 'repeat');
    return this._pat;
  }

  run({ a = '#ff8a14', b = '#2f5bff', mode = 'full', dir = 1, onMid = null, onDone = null } = {}) {
    if (this.r) this._finish();                      // never lose a pending screen swap
    const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (this.cv.width !== cw || this.cv.height !== ch) { this.cv.width = cw; this.cv.height = ch; this._pat = null; }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = rng((Math.random() * 1e9) | 0);
    const r = this.r = {
      mode, dir: dir < 0 ? -1 : 1, a, b, aDark: shade(a, -0.4), bDark: shade(b, -0.36), aLight: shade(a, 0.35),
      onMid, onDone, t: 0, midDone: !onMid, W, H, R,
      dur: mode === 'light' ? 520 : mode === 'fade' ? 900 : WIPE.total, midAt: mode === 'light' ? 0 : WIPE.mid,
      ph: [[R() * TAU, R() * TAU, R() * TAU], [R() * TAU, R() * TAU, R() * TAU]],
    };
    if (mode === 'full') this._setupFull(r); else if (mode === 'light') this._setupLight(r);
    this.host.classList.add('is-run');
    this.host.dataset.mode = mode;
    this.mark.classList.remove('is-on');
    if (mode === 'full') { void this.mark.offsetWidth; this.mark.classList.add('is-on'); } // eslint-disable-line no-void
    this._last = performance.now();
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(this._frame);
    clearTimeout(this._safety);
    this._safety = setTimeout(() => { if (this.r === r) this._finish(); }, r.dur + 2600); // rAF starved (hidden tab)
    if (!r.midDone && r.midAt <= 0) { r.midDone = true; safeCall(r.onMid); }
  }

  _setupFull(r) {
    const { W, H, R } = r;
    const drips = (n, lenK) => Array.from({ length: n }, (_, i) => ({
      x: ((i + 0.15 + R() * 0.7) / n) * W, w: W * (0.012 + R() * 0.013), L: H * (0.05 + R() * 0.15) * lenK,
      d: R() * 0.35, wob: R() * TAU,
    })).map((d) => ({ ...d, b: d.w * (0.5 + R() * 0.22) }));
    r.dripsA = drips(10, 1); r.dripsB = drips(8, 1.25);
    r.streaksA = drips(8, 1.1); r.streaksB = drips(6, 0.9);
    r.drops = Array.from({ length: 30 }, () => ({
      x0: R() * W, p0: 0.06 + R() * 0.62, vx: (R() - 0.5) * 0.35, vy: 1.1 + R() * 1.5, r: H * (0.004 + R() * 0.01), c: R() < 0.72 ? 'a' : 'b',
    }));
    r.splats = Array.from({ length: 6 }, (_, i) => {
      const s = splatShape(0, 0, 1, { seed: (R() * 997) | 0, arms: 8 + ((R() * 4) | 0), drops: 5, armLen: 0.5 });
      return { x: W * (0.08 + ((i + R() * 0.8) / 6) * 0.84), y: H * (0.28 + R() * 0.62), s: H * (0.04 + R() * 0.07), rot: R() * TAU, p: new Path2D(s.core), drops: s.drops, c: R() < 0.6 ? 'a' : 'b', on: -1 };
    });
    r.residue = Array.from({ length: 12 }, () => ({ x: R() * W, y: H * (0.05 + R() * 0.85), r: H * (0.006 + R() * 0.014), on: -1 }));
  }

  _setupLight(r) {
    const { W, H, R } = r;
    const tongues = (n, lenK) => Array.from({ length: n }, (_, i) => ({ y: ((i + 0.2 + R() * 0.6) / n) * H, w: H * (0.014 + R() * 0.014), L: W * (0.03 + R() * 0.07) * lenK, wob: R() * TAU })).map((d) => ({ ...d, c: d.w * (0.5 + R() * 0.2) }));
    r.leadA = tongues(7, 1); r.leadB = tongues(6, 1.2); r.tailA = tongues(6, 1.3);
    r.drops = Array.from({ length: 16 }, () => ({ y0: R() * H, p0: 0.1 + R() * 0.6, vx: 1.6 + R() * 1.6, vy: (R() - 0.5) * 0.5, r: H * (0.004 + R() * 0.008), c: R() < 0.7 ? 'a' : 'b' }));
  }

  _frame(now) {
    const r = this.r;
    if (!r) return;
    this._raf = requestAnimationFrame(this._frame);
    let dt = Math.min(50, Math.max(0, now - this._last));
    this._last = now;
    if (this.isFrozen()) dt = 0;
    r.t += dt * this.timeScale;
    if (!r.midDone && r.t >= r.midAt) { r.midDone = true; safeCall(r.onMid); }
    if (r.t >= r.dur) { this._finish(); return; }
    if (this.r !== r) return; // onMid started another wipe
    try {
      if (r.mode === 'full') this._drawFull(r);
      else if (r.mode === 'light') this._drawLight(r);
      else this._drawFade(r);
    } catch (e) { console.error('[ui] wipe', e); this._finish(); }
  }

  _finish() {
    const r = this.r;
    if (!r) return;
    this.r = null;
    cancelAnimationFrame(this._raf);
    clearTimeout(this._safety);
    if (!r.midDone) { r.midDone = true; safeCall(r.onMid); }
    this.ctx.clearRect(0, 0, r.W + 2, r.H + 2);
    if (!this.r) { this.host.classList.remove('is-run'); this.mark.classList.remove('is-on'); }
    safeCall(r.onDone);
  }

  cancel() { if (this.r) this._finish(); }

  _edge(r, x, base, ph) {
    const k = x / r.W, t = r.t, H = r.H;
    return base + H * (0.021 * Math.sin(k * 6.3 + ph[0] + t * 0.0058) + 0.013 * Math.sin(k * 14.1 + ph[1] - t * 0.0087) + 0.006 * Math.sin(k * 29.7 + ph[2] + t * 0.0125));
  }

  /** Sheet whose visible edge is its bottom (covering phase). */
  _sheetDown(r, base, ph, drips, lenAt, fill, dark, pattern) {
    const ctx = this.ctx, W = r.W, step = Math.max(10, W / 120);
    const p = new Path2D();
    p.moveTo(-40, -60); p.lineTo(W + 40, -60);
    for (let x = W + 40; x > -40 - step; x -= step) p.lineTo(x, this._edge(r, x, base, ph));
    p.closePath();
    for (const d of drips) {
      const L = d.L * lenAt(d);
      if (L < 3) continue;
      tongueDown(p, d.x, this._edge(r, d.x, base, ph), d.w, L, d.b * (0.9 + 0.1 * Math.sin(r.t * 0.02 + d.wob)));
    }
    ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = dark; ctx.stroke(p);
    ctx.fillStyle = fill; ctx.fill(p);
    if (pattern) { ctx.globalAlpha = 0.13; ctx.fillStyle = this._pattern(); ctx.fill(p); ctx.globalAlpha = 1; }
    return p;
  }

  /** Sheet whose visible edge is its top (revealing phase). */
  _sheetUp(r, base, ph, streaks, lenAt, fill, dark, pattern) {
    const ctx = this.ctx, W = r.W, H = r.H, step = Math.max(10, W / 120);
    const p = new Path2D();
    p.moveTo(-40, H + 60);
    for (let x = -40; x < W + 40 + step; x += step) p.lineTo(x, this._edge(r, x, base, ph));
    p.lineTo(W + 40, H + 60);
    p.closePath();
    for (const d of streaks) {
      const L = d.L * lenAt(d);
      if (L < 3) continue;
      tongueUp(p, d.x, this._edge(r, d.x, base, ph), d.w * 0.8, L, d.b * 0.62);
    }
    ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = dark; ctx.stroke(p);
    ctx.fillStyle = fill; ctx.fill(p);
    if (pattern) { ctx.globalAlpha = 0.13; ctx.fillStyle = this._pattern(); ctx.fill(p); ctx.globalAlpha = 1; }
  }

  _gloss(r, base, ph, up) {
    // wet highlight running just inside the leading edge
    const ctx = this.ctx, W = r.W, H = r.H, step = Math.max(12, W / 100), off = (up ? 1 : -1) * H * 0.016;
    ctx.beginPath();
    for (let x = -20; x < W + 20 + step; x += step) { const y = this._edge(r, x, base, ph) + off; if (x <= -20) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = H * 0.007; ctx.lineCap = 'round'; ctx.stroke();
  }

  _drawFull(r) {
    const ctx = this.ctx, { W, H, t } = r;
    ctx.clearRect(0, 0, W + 2, H + 2);
    const COVER = WIPE.mid, REVEAL = WIPE.revealAt, REND = r.dur - 40;
    if (t <= COVER) {
      const p = clamp(t / COVER), e = easeInOutCubic(p);
      const baseA = lerp(-0.3 * H, 1.12 * H, e);
      const baseB = baseA + H * (0.03 + 0.06 * Math.sin(p * Math.PI));
      // splats landing just ahead of the pour
      for (const s of r.splats) {
        if (s.on < 0 && baseA + H * 0.34 >= s.y) s.on = t;
        if (s.on < 0) continue;
        const k = easeOutBack(clamp((t - s.on) / 110), 2.2);
        if (k <= 0) continue;
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.scale(s.s * k, s.s * k);
        ctx.fillStyle = s.c === 'a' ? r.a : r.b; ctx.fill(s.p);
        ctx.beginPath(); for (const d of s.drops) { ctx.moveTo(d.x + d.r, d.y); ctx.arc(d.x, d.y, d.r, 0, TAU); } ctx.fill();
        ctx.restore();
      }
      // droplets flung ahead of the edge
      for (const d of r.drops) {
        const t0 = d.p0 * COVER;
        if (t < t0) continue;
        const u = t - t0, sc = H / 900;
        const y0 = this._edge(r, d.x0, lerp(-0.3 * H, 1.12 * H, easeInOutCubic(d.p0)), r.ph[0]) + d.r;
        const x = d.x0 + d.vx * u * sc, y = y0 + d.vy * u * sc + 0.0016 * u * u * sc;
        if (y > H + 40) continue;
        const vy = d.vy + 0.0032 * u, ang = Math.atan2(vy, d.vx), st = 1 + Math.min(2.4, vy * 0.55);
        ctx.fillStyle = d.c === 'a' ? r.a : r.b;
        ctx.beginPath(); ctx.ellipse(x, y, d.r * st, d.r, ang, 0, TAU); ctx.fill();
      }
      const grow = (d) => smooth(d.d, d.d + 0.45, p) * (1 + 0.07 * Math.sin(t * 0.021 + d.wob));
      this._sheetDown(r, baseB, r.ph[1], r.dripsB, grow, r.b, r.bDark, false);
      this._sheetDown(r, baseA, r.ph[0], r.dripsA, grow, r.a, r.aDark, true);
      this._gloss(r, baseA, r.ph[0], false);
    } else if (t < REVEAL) {
      ctx.fillStyle = r.a; ctx.fillRect(0, 0, W + 2, H + 2);
      ctx.globalAlpha = 0.13; ctx.fillStyle = this._pattern(); ctx.fillRect(0, 0, W + 2, H + 2); ctx.globalAlpha = 1;
    } else {
      const q = clamp((t - REVEAL) / (REND - REVEAL)), e = easeInOutCubic(q);
      const topA = lerp(-0.16 * H, 1.2 * H, e);
      const topB = topA - H * (0.035 + 0.06 * Math.sin(q * Math.PI));
      const len = (d) => smooth(0, 0.14, q) * (1 - smooth(0.5, 1, q)) * (1 + 0.1 * Math.sin(t * 0.02 + d.wob));
      this._sheetUp(r, topB, r.ph[1], r.streaksB, len, r.b, r.bDark, false);
      this._sheetUp(r, topA, r.ph[0], r.streaksA, len, r.a, r.aDark, true);
      this._gloss(r, topA, r.ph[0], true);
      // residue droplets left behind as the sheet slides off
      ctx.fillStyle = r.a;
      for (const d of r.residue) {
        if (d.on < 0 && topA > d.y + H * 0.05) d.on = t;
        if (d.on < 0) continue;
        const k = 1 - smooth(0, 240, t - d.on);
        if (k <= 0.01) continue;
        ctx.beginPath(); ctx.arc(d.x, d.y + (t - d.on) * 0.05, d.r * k, 0, TAU); ctx.fill();
      }
    }
  }

  _drawLight(r) {
    // a quick diagonal ink swipe for sub-screen pushes (decorative; the swap is immediate)
    const ctx = this.ctx, { W, H, t, dir } = r;
    ctx.clearRect(0, 0, W + 2, H + 2);
    const p = clamp(t / (r.dur - 30)), e = easeInOutCubic(p);
    const bw = W * 0.12, skew = H * 0.28;
    const c = lerp(-0.25 * W - skew, 1.25 * W + skew, e);
    const cx = dir > 0 ? c : W - c;
    const edge = (y, off, ph) => cx + off + (y / H - 0.5) * skew * dir + H * (0.018 * Math.sin(y / H * 7 + ph[0] + t * 0.009) + 0.01 * Math.sin(y / H * 17 + ph[1] - t * 0.014));
    const band = (lead, trail, ph, fill, dark, tLead, tTail) => {
      const step = Math.max(10, H / 60);
      const pth = new Path2D();
      // leading side top→bottom, trailing side bottom→top (clockwise for dir>0; mirrored path keeps nonzero fill safe)
      pth.moveTo(edge(-40, lead, ph), -40);
      for (let y = -40; y < H + 40 + step; y += step) pth.lineTo(edge(y, lead, ph), y);
      for (let y = H + 40; y > -40 - step; y -= step) pth.lineTo(edge(y, trail, ph), y);
      pth.closePath();
      const k = Math.sin(p * Math.PI);
      const sub = new Path2D();
      for (const d of tLead || []) tongueSide(sub, edge(d.y, lead, ph), d.y, d.w, d.L * k, d.c, dir);
      for (const d of tTail || []) tongueSide(sub, edge(d.y, trail, ph), d.y, d.w * 0.8, d.L * k, d.c * 0.7, -dir);
      ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = dark;
      ctx.stroke(pth); ctx.stroke(sub);
      ctx.fillStyle = fill; ctx.fill(pth); ctx.fill(sub);
    };
    for (const d of r.drops) {
      const t0 = d.p0 * r.dur;
      if (t < t0) continue;
      const u = t - t0, sc = W / 1600;
      const x = edge(d.y0, (bw / 2 + W * 0.02) * dir, r.ph[0]) + d.vx * u * sc * dir, y = d.y0 + d.vy * u * sc + 0.0012 * u * u * sc;
      ctx.fillStyle = d.c === 'a' ? r.a : r.b;
      ctx.beginPath(); ctx.ellipse(x, y, d.r * 2.2, d.r, 0, 0, TAU); ctx.fill();
    }
    band((bw / 2 + W * 0.018) * dir, (-bw / 2 + W * 0.018) * dir, r.ph[1], r.b, r.bDark, r.leadB, null);
    band((bw / 2) * dir, (-bw / 2) * dir, r.ph[0], r.a, r.aDark, r.leadA, r.tailA);
  }

  _drawFade(r) {
    const ctx = this.ctx, { W, H, t } = r;
    ctx.clearRect(0, 0, W + 2, H + 2);
    const a = t < 300 ? t / 300 : t < 500 ? 1 : 1 - (t - 500) / (r.dur - 520);
    ctx.globalAlpha = clamp(a); ctx.fillStyle = r.a; ctx.fillRect(0, 0, W + 2, H + 2); ctx.globalAlpha = 1;
  }
}

// ================================================================================== settings previews
// Every preview returns { el, set(value, settings), tick(dt) } and lives inside .iw-prev__stage (16:9 box).
const MOUSE_RAD_PER_PX = 0.0021;   // src/game/player.js look scale
const PAD_YAW_RATE = 3.4;          // rad/s at full stick × padSensitivity

function frameSVG(inner, cls = '') {
  return `<svg class="iw-pvsvg ${cls}" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs><linearGradient id="pvsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6cc6f2"/><stop offset=".55" stop-color="#bfe8ff"/><stop offset=".56" stop-color="#e9dcc3"/><stop offset="1" stop-color="#d6c6a6"/></linearGradient></defs>
    <rect x="1" y="1" width="318" height="178" rx="14" fill="url(#pvsky)"/>${inner}
    <rect x="1" y="1" width="318" height="178" rx="14" fill="none" stroke="${K}" stroke-width="3"/></svg>`;
}
const skyline = (w, seed) => {
  const R = rng(seed); let x = 0, out = '';
  while (x < w) {
    const bw = 14 + R() * 26, bh = 18 + R() * 46;
    out += `<rect x="${x.toFixed(1)}" y="${(99 - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${R() < 0.5 ? '#9fb6d8' : '#b7c9e4'}"/>`;
    if (R() < 0.35) out += `<rect x="${(x + bw * 0.3).toFixed(1)}" y="${(99 - bh - 10).toFixed(1)}" width="3" height="10" fill="#9fb6d8"/>`;
    x += bw + 4 + R() * 16;
  }
  return out;
};

function previewLook(ctx, pad) {
  const W = 960;
  const pano = `<svg class="iw-pv-pano" viewBox="0 0 ${W} 180" preserveAspectRatio="none" aria-hidden="true">
    <rect width="${W}" height="100" fill="#8fd3f5"/>${skyline(W, 17)}
    <rect y="99" width="${W}" height="81" fill="#e6d8bd"/>
    ${Array.from({ length: 24 }, (_, i) => `<path d="M${i * 40} 99 L${i * 40 - 60} 180" stroke="#cdbb98" stroke-width="2"/>`).join('')}
    ${Array.from({ length: 9 }, (_, i) => { const x = 60 + i * 107; return `<path class="${i % 2 ? 'iw-fb' : 'iw-fa'}" d="M${x} 128 q18 -12 34 0 q14 10 -4 18 q-16 8 -30 -2 q-10 -8 0 -16z"/>`; }).join('')}
    ${Array.from({ length: 6 }, (_, i) => { const x = 40 + i * 160; return `<rect x="${x}" y="84" width="46" height="34" rx="6" fill="#fff7e8" stroke="#d9cbb0" stroke-width="3"/>`; }).join('')}
  </svg>`;
  const screen = h('div', { class: 'iw-pv-screen', html: pano + `<i class="iw-pv-xhair"></i>` });
  const inputEl = h('div', { class: 'iw-pv-input', html: pad ? padGlyph('RS') : mouseGlyph('M') });
  const stat = h('div', { class: 'iw-pv-stat' });
  const el = h('div', { class: 'iw-pv iw-pv--look' }, screen, h('div', { class: 'iw-pv-row' }, inputEl, stat));
  const panoEl = screen.firstElementChild;
  let v = +ctx.value || 1, ph = 0, shown = v;
  const set = (nv) => {
    v = +nv || 1;
    if (pad) stat.innerHTML = `Full-stick 360° turn in <b>${(TAU / (PAD_YAW_RATE * v)).toFixed(2)} s</b>`;
    else stat.innerHTML = `<b>${fmtInt(TAU / (MOUSE_RAD_PER_PX * v))} px</b> of mouse travel per 360° turn`;
  };
  set(v);
  return {
    el, set,
    tick: (dt) => {
      ph += dt;
      shown += (v - shown) * (1 - Math.exp(-dt * 10));
      const s = Math.sin(ph * TAU / 2.2);
      inputEl.style.transform = `translateX(${(s * 16).toFixed(1)}px)`;
      // same hand motion → view pans proportionally to sensitivity (≈ 16 % of the strip per 1.0×)
      panoEl.style.transform = `translateX(${(-33.333 - s * 5.2 * shown).toFixed(2)}%)`;
    },
  };
}

function previewInvert(ctx) {
  const el = h('div', { class: 'iw-pv iw-pv--invert', html: `
    <div class="iw-pv-inv__in">${mouseGlyph('M')}<i class="iw-pv-inv__arrow">${GLYPHS.next}</i></div>
    <div class="iw-pv-inv__eq">${GLYPHS.next}</div>
    ${frameSVG(`<g class="iw-pv-inv__view"><rect x="-20" y="96" width="360" height="140" fill="#e6d8bd"/><rect x="-20" y="-60" width="360" height="156" fill="#8fd3f5"/>
      <circle cx="250" cy="40" r="16" fill="#fff6c8"/>${skyline(340, 5).replace(/<rect x="/g, '<rect transform="translate(-10 -3)" x="')}</g>
      <g transform="translate(160 90)"><circle r="11" fill="none" stroke="#fff" stroke-width="4"/><circle r="11" fill="none" stroke="${K}" stroke-width="1.5"/><circle r="2.6" fill="#fff" stroke="${K}" stroke-width="1.2"/></g>`, 'iw-pv-inv__screen')}
    <div class="iw-pv-cap"></div>` });
  const cap = el.querySelector('.iw-pv-cap');
  const set = (v) => { el.classList.toggle('is-on', !!v); cap.innerHTML = v ? 'Push up <b>→ look DOWN</b>' : 'Push up <b>→ look UP</b>'; };
  set(ctx.value);
  return { el, set };
}

function previewFov(ctx) {
  const T = [[-58, 118], [-46, 72], [-35, 128], [-20, 96], [-4, 140], [12, 110], [27, 78], [39, 132], [49, 100], [61, 60]];
  const cx = 160, cy = 172, R = 158;
  const pos = ([a, d]) => [cx + Math.sin(a * Math.PI / 180) * d, cy - Math.cos(a * Math.PI / 180) * d];
  const blocks = [[36, 40, 34, 22], [238, 36, 40, 26], [120, 64, 30, 20], [72, 118, 26, 26], [226, 114, 30, 22]]
    .map(([x, y, w, hh]) => `<rect x="${x}" y="${y + 4}" width="${w}" height="${hh}" rx="5" fill="#cdbd9f"/><rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="5" fill="#fffaf0" stroke="#cdbd9f" stroke-width="2"/>`).join('');
  const wedge = (deg) => {
    const hh = (deg / 2) * Math.PI / 180;
    const x1 = cx - Math.sin(hh) * R, y1 = cy - Math.cos(hh) * R, x2 = cx + Math.sin(hh) * R;
    return `M${cx} ${cy} L${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y1.toFixed(1)} Z`;
  };
  const el = h('div', { class: 'iw-pv iw-pv--fov', html: `<svg class="iw-pvsvg" viewBox="0 0 320 180" aria-hidden="true">
      <rect x="1" y="1" width="318" height="178" rx="14" fill="#efe4cf"/>
      <g stroke="#dccdb0" stroke-width="2">${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 40} 0 V180"/>`).join('')}${Array.from({ length: 5 }, (_, i) => `<path d="M0 ${i * 40} H320"/>`).join('')}</g>
      ${blocks}
      <path class="iw-pv-fov__ghost" d="${wedge(82)}"/>
      <path class="iw-pv-fov__wedge" d="${wedge(+ctx.value || 82)}"/>
      ${T.map((t) => { const [x, y] = pos(t); return `<g class="iw-pv-fov__t" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="10" class="iw-pv-fov__halo"/><circle r="6.5" class="iw-fb" stroke="${K}" stroke-width="2.5"/><circle cx="-1.8" cy="-1" r="1.4" fill="#fff"/><circle cx="1.8" cy="-1" r="1.4" fill="#fff"/></g>`; }).join('')}
      <g transform="translate(${cx - 14} ${cy - 30}) scale(.44)" style="color:var(--a)">${SQUID.replace('class="iw-ico iw-squid"', 'x="0" y="0" width="64" height="64"')}</g>
      <rect x="1" y="1" width="318" height="178" rx="14" fill="none" stroke="${K}" stroke-width="3"/>
    </svg><div class="iw-pv-cap"></div>` });
  const wedgeEl = el.querySelector('.iw-pv-fov__wedge');
  const tEls = [...el.querySelectorAll('.iw-pv-fov__t')];
  const cap = el.querySelector('.iw-pv-cap');
  let target = +ctx.value || 82, cur = target, lastN = -1;
  const apply = () => {
    wedgeEl.setAttribute('d', wedge(cur));
    let n = 0;
    tEls.forEach((g, i) => { const inside = Math.abs(T[i][0]) <= cur / 2 && T[i][1] <= R; g.classList.toggle('is-in', inside); if (inside) n++; });
    if (n !== lastN) { lastN = n; cap.innerHTML = `<b>${n} of ${T.length}</b> squidkids in view`; }
  };
  apply();
  return {
    el,
    set: (v) => { target = +v || 82; },
    tick: (dt) => { if (Math.abs(target - cur) > 0.05) { cur += (target - cur) * (1 - Math.exp(-dt * 14)); apply(); } },
  };
}

function previewQuality(ctx) {
  const tiers = [['low', 'LOW'], ['medium', 'MED'], ['high', 'HIGH'], ['ultra', 'ULTRA']];
  const ladder = h('div', { class: 'iw-pv-ladder' }, tiers.map(([id, lab], i) => h('span', { class: 'iw-pv-ladder__col', 'data-q': id, style: { '--h': (0.3 + i * 0.233).toFixed(3) } }, h('i'), h('b', null, lab))));
  const chips = h('div', { class: 'iw-pv-chips' });
  const el = h('div', { class: 'iw-pv iw-pv--quality' }, ladder, chips);
  const Q = ctx.qualityTable || {};
  const set = (v) => {
    const q = Q[v] || Q.high || {};
    ladder.querySelectorAll('.iw-pv-ladder__col').forEach((c) => c.classList.toggle('is-on', c.dataset.q === v));
    const rows = [
      ['Pixel density', `up to ${(+q.pixelRatio || 1).toFixed(q.pixelRatio % 1 ? 2 : 1).replace(/0$/, '')}×`],
      ['Shadow map', `${q.shadowSize || 0}px`],
      ['Anti-aliasing', q.msaa ? `${q.msaa}× MSAA` : 'Off'],
      ['Ink detail', `${Math.round((q.paintAtlas || 2048) / 1024)}K atlas`],
      ['Ambient occlusion', q.ao ? 'On' : 'Off'],
      ['Particles', `${Math.round((q.particles ?? 1) * 100)}%`],
    ];
    chips.innerHTML = '';
    rows.forEach(([k, val], i) => chips.appendChild(h('span', { class: 'iw-pv-chip' + (/Off|0%/.test(val) ? ' is-off' : ''), style: { '--i': i } }, h('small', null, k), h('b', null, val))));
  };
  set(ctx.value);
  return { el, set };
}

function previewShadows(ctx) {
  const el = h('div', { class: 'iw-pv iw-pv--shadow', html: frameSVG(`
    <circle cx="262" cy="34" r="17" fill="#fff6c8"/><circle cx="262" cy="34" r="27" fill="#fff6c8" opacity=".35"/>
    <path class="iw-pv-shadow" d="M104 150 L154 150 L228 176 L178 176 Z" fill="#000" fill-opacity=".24"/>
    <path class="iw-pv-shadow" d="M156 116 L182 116 L214 128 L190 128 Z" fill="#000" fill-opacity=".2"/>
    <rect x="104" y="96" width="50" height="54" rx="6" fill="#e9dfcb" stroke="#bfae8e" stroke-width="3"/><rect x="104" y="92" width="50" height="18" rx="6" fill="#fffaf0" stroke="#bfae8e" stroke-width="3"/>
    <g transform="translate(160 74) scale(.5)" style="color:var(--a)">${SQUID.replace('class="iw-ico iw-squid"', 'x="0" y="0" width="64" height="64"')}</g>
    <path class="iw-fa" d="M60 150 q20 -9 40 0 q10 6 -6 12 q-20 7 -34 -2 q-8 -6 0 -10z"/>`) + '<div class="iw-pv-cap"></div>' });
  const cap = el.querySelector('.iw-pv-cap');
  const set = (v) => { el.classList.toggle('is-on', !!v); cap.innerHTML = v ? 'Soft sun shadows <b>ON</b>' : 'Shadows <b>OFF</b> — faster on older machines'; };
  set(ctx.value);
  return { el, set };
}

function previewBloom(ctx) {
  const s = splatShape(160, 92, 46, { seed: 21, arms: 9, drops: 6, armLen: 0.5 });
  const splat = `<path d="${s.core}"/>${s.drops.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="${d.r}"/>`).join('')}`;
  const el = h('div', { class: 'iw-pv iw-pv--bloom', html: `<svg class="iw-pvsvg" viewBox="0 0 320 180" aria-hidden="true">
      <defs><filter id="pvbl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter></defs>
      <rect x="1" y="1" width="318" height="178" rx="14" fill="#1b1630"/>
      <g class="iw-pv-bloom__glow iw-fa" filter="url(#pvbl)">${splat}</g>
      <g class="iw-fa">${splat}</g>
      <g transform="translate(136 66) scale(.75)" style="color:#fff">${SPECIAL_ICONS.slam.replace('class="iw-ico "', 'x="0" y="0" width="64" height="64"')}</g>
      <rect x="1" y="1" width="318" height="178" rx="14" fill="none" stroke="${K}" stroke-width="3"/></svg><div class="iw-pv-cap"></div>` });
  const cap = el.querySelector('.iw-pv-cap');
  const set = (v) => { el.classList.toggle('is-on', !!v); cap.innerHTML = v ? 'Bright ink and specials <b>glow</b>' : 'Glow <b>OFF</b>'; };
  set(ctx.value);
  return { el, set };
}

function hudFrame(inner) {
  return frameSVG(`<rect x="40" y="118" width="240" height="70" fill="#efe4cf"/>
    <path class="iw-fa" d="M70 140 q30 -14 60 0 q16 9 -8 18 q-30 10 -52 -2 q-12 -8 0 -16z"/><path class="iw-fb" d="M200 132 q26 -10 50 0 q12 7 -6 14 q-24 8 -44 -2 q-10 -6 0 -12z"/>
    <g transform="translate(145 92) scale(.46)" style="color:var(--a)">${SQUID.replace('class="iw-ico iw-squid"', 'x="0" y="0" width="64" height="64"')}</g>
    <g transform="translate(160 72)"><circle r="7" fill="none" stroke="#fff" stroke-width="3"/></g>
    <rect x="128" y="10" width="64" height="16" rx="8" fill="${K}"/><text x="160" y="22" text-anchor="middle" font-family="Titan One, sans-serif" font-size="11" fill="#fff">2:47</text>${inner}`);
}
function previewFps(ctx) {
  const el = h('div', { class: 'iw-pv iw-pv--fps', html: hudFrame(`<g class="iw-pv-pop"><rect x="12" y="10" width="58" height="18" rx="6" fill="${K}"/><text x="41" y="23" text-anchor="middle" font-family="Rubik, sans-serif" font-weight="800" font-size="10.5" fill="#7dffa8">60 FPS</text></g>`) + '<div class="iw-pv-cap"></div>' });
  const cap = el.querySelector('.iw-pv-cap');
  const set = (v) => { el.classList.toggle('is-on', !!v); cap.innerHTML = v ? 'Frame counter <b>shown</b> in matches' : 'Frame counter <b>hidden</b>'; };
  set(ctx.value);
  return { el, set };
}
function previewMinimap(ctx) {
  const el = h('div', { class: 'iw-pv iw-pv--map', html: hudFrame(`<g class="iw-pv-pop"><rect x="228" y="100" width="80" height="66" rx="10" fill="${K}"/><rect x="233" y="105" width="70" height="56" rx="7" fill="#e9e0cd"/>
      <path class="iw-fa" d="M238 118 q10 -6 20 0 q6 5 -4 10 q-10 4 -16 -2z M244 140 q9 -5 16 2 q4 6 -6 8 q-9 1 -10 -10z"/><path class="iw-fb" d="M280 112 q9 -4 16 2 q4 6 -6 9 q-9 2 -10 -11z M276 140 q10 -6 20 1 q5 6 -6 10 q-11 2 -14 -11z"/>
      <circle cx="252" cy="132" r="4" fill="#fff" stroke="${K}" stroke-width="2"/></g>`) + '<div class="iw-pv-cap"></div>' });
  const cap = el.querySelector('.iw-pv-cap');
  const set = (v) => { el.classList.toggle('is-on', !!v); cap.innerHTML = v ? 'Turf minimap <b>in the corner</b>' : 'Minimap <b>hidden</b> — hold TAB for the big map'; };
  set(ctx.value);
  return { el, set };
}

function previewShake(ctx) {
  const el = h('div', { class: 'iw-pv iw-pv--shake', html: `<div class="iw-pv-shake__frame">${hudFrame(`<g transform="translate(212 112)"><g class="iw-pv-boom"><path class="iw-fb" d="${splatShape(0, 0, 22, { seed: 9, arms: 9, drops: 0 }).core}"/><text y="5" text-anchor="middle" font-family="Titan One, sans-serif" font-size="13" fill="#fff" stroke="${K}" stroke-width="3" paint-order="stroke">BOOM</text></g></g>`)}</div><div class="iw-pv-cap"></div>` });
  const frame = el.querySelector('.iw-pv-shake__frame');
  const boom = el.querySelector('.iw-pv-boom');
  const cap = el.querySelector('.iw-pv-cap');
  let v = +ctx.value, t = 0.6;
  const set = (nv) => { v = clamp(+nv || 0); cap.innerHTML = v <= 0 ? 'Screen shake <b>OFF</b>' : `Shake strength <b>${Math.round(v * 100)}%</b>`; };
  set(v);
  return {
    el, set,
    tick: (dt) => {
      t -= dt;
      if (t > 0) return;
      t = 1.7;
      if (boom.animate) boom.animate([{ opacity: 0, scale: 0.2 }, { opacity: 1, scale: 1.15, offset: 0.2 }, { opacity: 1, scale: 1, offset: 0.35 }, { opacity: 0, scale: 1.1 }], { duration: 900, easing: 'ease-out' });
      if (v > 0 && frame.animate) {
        const a = 9 * v, kf = [];
        for (let i = 0; i <= 8; i++) { const d = (1 - i / 8) * a; kf.push({ transform: `translate(${((i % 2 ? 1 : -1) * d * (0.6 + ((i * 7) % 5) / 10)).toFixed(1)}px, ${((i % 3 === 1 ? -1 : 1) * d * 0.6).toFixed(1)}px) rotate(${((i % 2 ? -1 : 1) * d * 0.12).toFixed(2)}deg)` }); }
        frame.animate(kf, { duration: 420, easing: 'linear' });
      }
    },
  };
}

function previewAudio(ctx, key) {
  const N = 18;
  const bars = Array.from({ length: N }, () => h('i'));
  const meter = h('div', { class: 'iw-pv-meter' }, bars);
  const icon = h('div', { class: 'iw-pv-audio__icon', html: GLYPHS.speaker });
  const cap = h('div', { class: 'iw-pv-cap' });
  const el = h('div', { class: 'iw-pv iw-pv--audio' }, h('div', { class: 'iw-pv-audio__box' }, icon, meter), cap);
  const R = rng(key.length * 97 + 5);
  const seeds = bars.map(() => [R() * TAU, 2 + R() * 5, 0.4 + R() * 0.6]);
  let v = +ctx.value, s = ctx.settings || {}, t = 0, shown = 0;
  const eff = () => (key === 'master' ? v : v * (s.master ?? 1));
  const set = (nv, ss) => {
    v = clamp(+nv || 0); if (ss) s = ss;
    const e = eff();
    cap.innerHTML = key === 'master' ? `Overall output <b>${Math.round(v * 100)}%</b>` : `Heard at <b>${Math.round(e * 100)}%</b> after master volume`;
    el.classList.toggle('is-mute', e <= 0.001);
  };
  set(v);
  return {
    el, set,
    tick: (dt) => {
      t += dt;
      shown += (eff() - shown) * (1 - Math.exp(-dt * 8));
      const beat = key === 'sfx' ? Math.pow(Math.max(0, Math.sin(t * 5.1)), 6) : 0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2.4)), 3);
      for (let i = 0; i < N; i++) {
        const [p, f, a] = seeds[i];
        const x = i / (N - 1);
        const spectrum = key === 'music' ? 1 - x * 0.55 : key === 'sfx' ? 0.35 + 0.65 * Math.sin(x * Math.PI) : 0.8 - x * 0.3;
        const lvl = clamp(shown * spectrum * a * (0.45 + 0.55 * Math.abs(Math.sin(t * f + p))) * (0.5 + 0.8 * beat) * 1.25, 0.02, 1);
        bars[i].style.transform = `scaleY(${lvl.toFixed(3)})`;
      }
    },
  };
}

function previewAimAssist(ctx) {
  // a crosshair sweeps past a rival; the assist bends its path onto the target (strength = the slider)
  const el = h('div', { class: 'iw-pv iw-pv--aim', html: frameSVG(`
    <g transform="translate(160 104)"><ellipse cx="0" cy="34" rx="30" ry="7" fill="#000" opacity=".16"/>
      <g transform="translate(-22 -26) scale(.7)" style="color:var(--b)">${SQUID.replace('class="iw-ico iw-squid"', 'x="0" y="0" width="64" height="64"')}</g></g>
    <path class="iw-pv-aim__trail" d="M20 90 L300 90" fill="none"/>
    <g class="iw-pv-aim__x"><circle r="13" fill="none" stroke="#fff" stroke-width="4"/><circle r="13" fill="none" stroke="${K}" stroke-width="1.6"/><circle r="3" fill="#fff" stroke="${K}" stroke-width="1.4"/>
      <path d="M0 -21 V-15 M0 21 V15 M-21 0 H-15 M21 0 H15" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></g>`) + '<div class="iw-pv-cap"></div>' });
  const xEl = el.querySelector('.iw-pv-aim__x'), trail = el.querySelector('.iw-pv-aim__trail'), cap = el.querySelector('.iw-pv-cap');
  let v = clamp(+ctx.value || 0), t = 0;
  const set = (nv) => { v = clamp(+nv || 0); cap.innerHTML = v <= 0.001 ? 'Aim assist <b>OFF</b>' : `Pull strength <b>${Math.round(v * 100)}%</b>`; };
  set(v);
  return {
    el, set,
    tick: (dt) => {
      t = (t + dt / 2.6) % 1;
      // raw sweep left → right; assisted path eases toward the target centre (160, 100) as it passes
      const x0 = 30 + t * 260, near = Math.exp(-Math.pow((x0 - 160) / 60, 2));
      const x = x0 + (160 - x0) * near * v * 0.55, y = 64 + (100 - 64) * near * v;
      xEl.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      if (t < 0.02) trail.setAttribute('d', `M${x.toFixed(1)} ${y.toFixed(1)}`);
      else trail.setAttribute('d', `${trail.getAttribute('d')} L${x.toFixed(1)} ${y.toFixed(1)}`);
    },
  };
}

function previewAimMouse(ctx) {
  const el = h('div', { class: 'iw-pv iw-pv--aimm', html: `<div class="iw-pv-aimm__row"><span class="iw-pv-aimm__dev is-pad">${GLYPHS.gamepad}<b>ASSIST</b></span><span class="iw-pv-aimm__dev is-mouse">${mouseGlyph('M')}<b>ASSIST</b></span></div><div class="iw-pv-cap"></div>` });
  const cap = el.querySelector('.iw-pv-cap');
  const set = (v) => { el.classList.toggle('is-on', !!v); cap.innerHTML = v ? 'Assist on <b>controller and mouse</b> (lighter on mouse)' : 'Assist on <b>controller only</b>'; };
  set(ctx.value);
  return { el, set };
}

function previewRumble(ctx) {
  const el = h('div', { class: 'iw-pv iw-pv--rumble', html: `<div class="iw-pv-rumble__pad">${GLYPHS.gamepad}<i class="l"></i><i class="r"></i></div><div class="iw-pv-cap"></div>` });
  const pad = el.querySelector('.iw-pv-rumble__pad'), cap = el.querySelector('.iw-pv-cap');
  let v = clamp(+ctx.value || 0), t = 0.4;
  const set = (nv) => { v = clamp(+nv || 0); cap.innerHTML = v <= 0 ? 'Vibration <b>OFF</b>' : `Rumble strength <b>${Math.round(v * 100)}%</b>`; el.classList.toggle('is-off', v <= 0); };
  set(v);
  return {
    el, set,
    tick: (dt) => {
      t -= dt;
      if (t > 0) return;
      t = 1.5;
      if (v > 0 && pad.animate) {
        const a = 7 * v, kf = [];
        for (let i = 0; i <= 10; i++) { const d = (1 - i / 10) * a; kf.push({ transform: `translate(${((i % 2 ? 1 : -1) * d).toFixed(1)}px, ${((i % 3 === 1 ? -1 : 1) * d * 0.35).toFixed(1)}px) rotate(${((i % 2 ? -1 : 1) * d * 0.5).toFixed(2)}deg)` }); }
        pad.animate(kf, { duration: 520, easing: 'linear' });
        el.classList.remove('is-buzz'); void el.offsetWidth; el.classList.add('is-buzz'); // eslint-disable-line no-void
      }
    },
  };
}

function previewColorblind(ctx) {
  const pals = ctx.palettes || [];
  const cb = ctx.cbPalette || { a: '#ffd21a', b: '#2a52ff' };
  const pair = (a, b) => `<span class="iw-pv-pair"><i style="background:${a}"></i><i style="background:${b}"></i></span>`;
  const el = h('div', { class: 'iw-pv iw-pv--cb', html: `
    <div class="iw-pv-pal iw-pv-pal--std"><small>STANDARD INKS · rotate each match</small><div class="iw-pv-pal__row">${pals.map((p) => pair(p.a, p.b)).join('')}</div><i class="iw-pv-pal__check">${GLYPHS.check}</i></div>
    <div class="iw-pv-pal iw-pv-pal--cb"><small>COLORBLIND-SAFE · always</small><div class="iw-pv-pal__row">${pair(cb.a, cb.b)}<span class="iw-pv-pal__name">${(cb.names || ['Sun', 'Sea']).join(' vs ')}</span></div><i class="iw-pv-pal__check">${GLYPHS.check}</i></div>` });
  const set = (v) => el.classList.toggle('is-on', !!v);
  set(ctx.value);
  return { el, set };
}

function previewDifficulty(ctx) {
  const diffs = Object.values(ctx.diffs || {});
  const info = ctx.diffInfo || {};
  const el = h('div', { class: 'iw-pv iw-pv--diff' },
    h('div', { class: 'iw-pv-bots' }, diffs.map((d, i) => h('span', { class: 'iw-pv-bot', 'data-d': d.id, style: { '--i': i } },
      h('i', { html: GLYPHS.bot }), h('span', { class: 'iw-pips' }, Array.from({ length: 3 }, (_, k) => h('i', { class: k < (info[d.id]?.pips || i + 1) ? 'on' : '' }))), h('b', null, d.name)))),
    h('div', { class: 'iw-pv-cap' }));
  const cap = el.querySelector('.iw-pv-cap');
  const set = (v) => { el.querySelectorAll('.iw-pv-bot').forEach((b) => b.classList.toggle('is-on', b.dataset.d === v)); cap.textContent = info[v]?.text || ''; };
  set(ctx.value);
  return { el, set };
}

function previewLength(ctx) {
  const el = h('div', { class: 'iw-pv iw-pv--len', html: `<div class="iw-pv-len__box"><svg class="iw-pv-watch" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="64" r="44" fill="${K}"/><rect x="50" y="6" width="20" height="12" rx="4" fill="${K}"/>
      <circle cx="60" cy="64" r="36" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="9"/>
      <circle class="iw-pv-watch__arc" cx="60" cy="64" r="36" fill="none" stroke="var(--a)" stroke-width="9" stroke-linecap="round" transform="rotate(-90 60 64)" pathLength="100" stroke-dasharray="100 100"/>
    </svg><div class="iw-pv-len__num iw-display"></div></div><div class="iw-pv-cap"></div>` });
  const arc = el.querySelector('.iw-pv-watch__arc'), num = el.querySelector('.iw-pv-len__num'), cap = el.querySelector('.iw-pv-cap');
  const max = Math.max(...(ctx.durations || [90, 180]));
  const set = (v) => {
    v = +v || 180;
    num.textContent = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
    arc.setAttribute('stroke-dasharray', `${((v / max) * 100).toFixed(1)} 100`);
    cap.innerHTML = v < 120 ? 'A quick <b>sprint</b> — every second counts' : 'The full <b>turf war</b> — room for comebacks';
    num.classList.remove('is-pop'); void num.offsetWidth; num.classList.add('is-pop'); // eslint-disable-line no-void
  };
  set(ctx.value);
  return { el, set };
}

function previewLink() {
  const el = h('div', { class: 'iw-pv iw-pv--link', html: `<div class="iw-pv-link__art"><i>${GLYPHS.keyboard}</i><i>${GLYPHS.gamepad}</i></div>
    <div class="iw-pv-link__keys">${keycap('W')}${keycap('A')}${keycap('S')}${keycap('D')}<em>+</em>${mouseGlyph('L')}<em>·</em>${padGlyph('LS')}${padGlyph('RT')}</div>
    <div class="iw-pv-cap">Every binding for <b>keyboard, mouse and controller</b></div>` });
  return { el, set() {} };
}

function previewTab(ctx) {
  const t = ctx.tab || {};
  const el = h('div', { class: 'iw-pv iw-pv--tab', html: `<div class="iw-pv-tab__icon">${GLYPHS[t.icon] || GLYPHS.gear}</div>
    <div class="iw-pv-tab__list">${(t.rows || []).map((r) => `<span>${r.label}</span>`).join('')}</div>` });
  return { el, set() {} };
}
function previewReset() {
  const el = h('div', { class: 'iw-pv iw-pv--tab', html: `<div class="iw-pv-tab__icon iw-pv-tab__icon--reset">${GLYPHS.reset}</div>
    <div class="iw-pv-cap">Press twice to restore <b>every setting</b> on every tab</div>` });
  return { el, set() {} };
}

/** ctx: { value, settings, qualityTable, palettes, cbPalette, diffs, diffInfo, durations, tab } */
export function createPreview(key, ctx = {}) {
  switch (key) {
    case 'sensitivity': return previewLook(ctx, false);
    case 'padSensitivity': return previewLook(ctx, true);
    case 'invertY': return previewInvert(ctx);
    case 'quality': return previewQuality(ctx);
    case 'fov': return previewFov(ctx);
    case 'shadows': return previewShadows(ctx);
    case 'bloom': return previewBloom(ctx);
    case 'showFps': return previewFps(ctx);
    case 'minimap': return previewMinimap(ctx);
    case 'cameraShake': return previewShake(ctx);
    case 'aimAssist': return previewAimAssist(ctx);
    case 'aimAssistMouse': return previewAimMouse(ctx);
    case 'rumble': return previewRumble(ctx);
    case 'master': case 'music': case 'sfx': return previewAudio(ctx, key);
    case 'colorblind': return previewColorblind(ctx);
    case 'difficulty': return previewDifficulty(ctx);
    case 'matchLength': return previewLength(ctx);
    case '_howto': return previewLink(ctx);
    case '_reset': return previewReset(ctx);
    default: return previewTab(ctx);
  }
}

// ================================================================================== JS-driven ink reveals (clip-path)
// Both generators return a `path('…')`-ready string in the element's own px space. The command structure only depends
// on the seed, so successive frames differ only in coordinates (cheap to rebuild every frame; no layout reads).
const f1 = (v) => Math.round(v * 10) / 10;
function curveThrough(pts) {
  let d = `L${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d;
}
/** Seeded wavy, drippy leading edge: [[dx (fraction of W), y (0..1)]…] with a few ink tongues pushing ahead. */
export function sweepEdge(seed = 1, rows = 26) {
  const R = rng(seed * 7919 + 13);
  const ph = [R() * TAU, R() * TAU, R() * TAU];
  const tongues = Array.from({ length: 3 + ((R() * 3) | 0) }, () => ({ y: 0.08 + R() * 0.84, w: 0.03 + R() * 0.045, L: 0.05 + R() * 0.08 }));
  const pts = [];
  for (let i = 0; i <= rows; i++) {
    const y = -0.04 + (i / rows) * 1.08;
    let x = 0.024 * Math.sin(y * 6.3 + ph[0]) + 0.014 * Math.sin(y * 14.1 + ph[1]) + 0.007 * Math.sin(y * 29 + ph[2]);
    for (const t of tongues) { const d = (y - t.y) / t.w; x += t.L * Math.exp(-d * d * 1.5); }
    pts.push([x, y]);
  }
  return pts;
}
/** clip-path for a sweep that covers fraction f (0 = nothing, 1 = all) of a W×H box, travelling right (dir 1) or left (-1). */
export function sweepClip(edge, W, H, f, dir = 1) {
  const reach = 0.22 * W, far = W * 0.5 + 40;
  const base = -reach + f * (W + reach * 2);
  const pts = edge.map(([x, y]) => [dir > 0 ? base + x * W : W - base - x * W, y * H]);
  const bx = dir > 0 ? -far : W + far;
  return `path('M${f1(bx)} ${f1(-0.04 * H - 20)}${curveThrough(pts)}L${f1(bx)} ${f1(1.04 * H + 20)}Z')`;
}
/** clip-path for an ink splat of radius r centred on (x, y) (arms reach ≈ 1.5 r, valleys ≈ 0.8 r). */
export function splatClip(x, y, r, seed = 3) {
  return `path('${splatShape(x, y, Math.max(0.01, r), { seed, arms: 9, armLen: 0.5, drops: 0 }).core}')`;
}
/** Radius a splat centred on (x, y) needs before its valleys clear every corner of a W×H box. */
export function splatCover(x, y, W, H) {
  return Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y)) / 0.74;
}

// ================================================================================== locker swatches / fallback art
/** Skin tone swatch: a glossy round cheek-blob with soft shading. */
export function skinSwatch(hex) {
  const id = 'sk' + ((burstSeed += 31) % 1e6);
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="${id}" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="${shade(hex, 0.28)}"/><stop offset=".55" stop-color="${hex}"/><stop offset="1" stop-color="${shade(hex, -0.34)}"/></radialGradient></defs>
    <circle cx="32" cy="33" r="25" fill="url(#${id})" stroke="${K}" stroke-width="3"/>
    <ellipse cx="22" cy="40" rx="6" ry="3.4" fill="#ff7a8a" opacity=".32"/><ellipse cx="42" cy="40" rx="6" ry="3.4" fill="#ff7a8a" opacity=".32"/>
    <ellipse cx="24" cy="22" rx="7" ry="4.2" fill="#fff" opacity=".45" transform="rotate(-24 24 22)"/></svg>`;
}
/** Eye colour swatch: almond eye with a two-tone iris (matches the in-game iris gradient). */
export function irisSwatch(pair) {
  const [a, b] = Array.isArray(pair) ? pair : [pair, pair];
  const id = 'ir' + ((burstSeed += 31) % 1e6);
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="${id}" cx=".5" cy=".35" r=".65"><stop offset="0" stop-color="${a}"/><stop offset=".7" stop-color="${b}"/><stop offset="1" stop-color="${shade(b, -0.45)}"/></radialGradient></defs>
    <path d="M5 32 Q32 8 59 32 Q32 56 5 32 Z" fill="#fff" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="32" cy="32" r="13.5" fill="url(#${id})" stroke="${K}" stroke-width="2.5"/>
    <circle cx="32" cy="32" r="5.2" fill="${K}"/><circle cx="36.5" cy="27" r="3.4" fill="#fff"/><circle cx="27.5" cy="36.5" r="1.6" fill="#fff" opacity=".8"/></svg>`;
}
/** Outfit icon (fallback when no 3D portrait): tee + shorts + sneakers in the outfit's colours; team trims use --a. */
export function outfitIcon(o = {}) {
  const shirt = o.shirt || '#f4f2ec', shorts = o.shorts || '#27304a', shoe = o.shoe || '#272b34', sole = o.sole || '#f4f2ec', sock = o.sock || '#f7f7f4';
  const p = o.pattern | 0;
  const ol = `stroke="${K}" stroke-width="2.6" stroke-linejoin="round"`;
  const tee = 'M22 6 L13 9.5 L6 19 L12.5 23.5 L16 20 L16 38 L40 38 L40 20 L43.5 23.5 L50 19 L43 9.5 L34 6 Q31.5 11 28 11 Q24.5 11 22 6 Z';
  let deco = '';
  if (p === 0) deco = `<path d="M22 6 Q25 11.5 28 11.5 Q31 11.5 34 6" fill="none" stroke="var(--a)" stroke-width="2.4"/><circle cx="28" cy="21" r="5" class="iw-fa" ${ol} stroke-width="1.8"/>`;
  else if (p === 1) deco = `<path d="M16 17 L40 17 M16 20.5 L40 20.5" stroke="var(--a)" stroke-width="1.7"/>`;
  else if (p === 2) deco = `<path d="M13 9.5 L22 6 L20 20 L16 20 Z M43 9.5 L34 6 L36 20 L40 20 Z" fill="${shade(shirt, -0.3)}"/><path d="M16 26 L19 26 L19 38 L16 38 Z M40 26 L37 26 L37 38 L40 38 Z" fill="var(--a)"/>`;
  else deco = `<path d="M17 16 L28 22 L39 16" fill="none" stroke="var(--a)" stroke-width="2.6" stroke-linejoin="round"/><path d="M16 34.5 L40 34.5" stroke="var(--a)" stroke-width="2"/>`;
  const stripe = p === 1 || p === 2 ? `<path d="M18.5 40 L18.5 49 M37.5 40 L37.5 49" stroke="var(--a)" stroke-width="2"/>` : '';
  return `<svg viewBox="0 0 56 64" aria-hidden="true">
    <path d="${tee}" fill="${shirt}" ${ol}/>${deco}<path d="${tee}" fill="none" ${ol}/>
    <path d="M16.5 38 L39.5 38 L41 50.5 L30.5 50.5 L28 44 L25.5 50.5 L15 50.5 Z" fill="${shorts}" ${ol}/>${stripe}
    <rect x="18" y="51" width="6" height="4" fill="${sock}" ${ol} stroke-width="2"/><rect x="32" y="51" width="6" height="4" fill="${sock}" ${ol} stroke-width="2"/>
    <path d="M12 55 Q12 52 16 52 L24.5 52 L25 59 L12 59 Z" fill="${shoe}" ${ol}/><path d="M31 52 L40 52 Q44 52 44 55 L44 59 L31 59 Z" fill="${shoe}" ${ol}/>
    <path d="M11.5 59 L25.5 59 M30.5 59 L44.5 59" stroke="${sole}" stroke-width="3" stroke-linecap="round"/></svg>`;
}

// small re-exports used by menus.js
export { WEAPON_ICONS, SPLAT_ICON };
