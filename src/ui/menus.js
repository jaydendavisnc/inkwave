// INKWAVE — front-end menus (contract: docs/CONTRACTS.md §3).
//   const menus = new Menus(rootEl, api);
//   menus.show(screen) · menus.current · menus.setLoading(p, label) · menus.showResults(data)
//   menus.update(dt) · menus.handleKey(e) → bool · menus.nav(dir) → bool
// Additive extras (optional for the engine): menus.setAccent(a, b), menus.setInputMode('kbm'|'pad'),
// nav('tab_prev'|'tab_next') for LB/RB tab switching, menus.timeScale (debug slow-motion for JS-driven motion).
import {
  h, clamp, Spring, colorVars, toHex, splatSVG, fmtInt, fmtTime, pct, safeCall, restartAnim,
  prefersReducedMotion, easeOutCubic, easeInOutCubic, esc,
} from './ui-util.js';
import {
  WEAPON_ICONS, SUB_ICONS, SQUID, GLYPHS, SPLAT_ICON, DEATH_ICON, keycap, mouseGlyph, padGlyph,
  richText, logoMarkup, mapThumb, RULE_ART, weaponIcon, specialIcon,
} from './ui-icons.js';
import {
  GAME_TITLE, GAME_SUBTITLE, VERSION, WEAPONS, WEAPON_ORDER, SPECIALS, SUB, MAPS, DIFFICULTY, MATCH, QUALITY,
  DEFAULT_SETTINGS, TEAM_PALETTES, COLORBLIND_PALETTE, PROGRESSION, BOT_NAMES, TEAM_NAMES,
} from '../config.js';
import * as LOOK from '../game/character-style.js';
import { G } from '../core/ctx.js';
import {
  computeAwards, medalMarkup, awardBadge, awardIcon, rankEmblem, rankTier, RANK_TIERS, inkBurst, InkWipe, createPreview,
  sweepEdge, sweepClip, splatClip, splatCover, skinSwatch, irisSwatch, outfitIcon,
} from './menu-art.js';

const SCREENS = ['loading', 'title', 'main', 'loadout', 'setup', 'locker', 'settings', 'howto', 'credits', 'pause', 'results'];
// Transitions that get the full-screen ink wipe (the rest use staggered pop-ins).
const WIPES = new Set(['loading>title', 'title>main', 'results>main', 'pause>main', 'results>null', 'pause>title']);
// Pushes/pops between these get the light ink swipe (decorative — the swap itself is immediate).
const LIGHT = new Set(['main', 'loadout', 'setup', 'locker', 'settings', 'howto', 'credits', 'pause']);
// Stage art rendered from the real game by tools/stage-shots.mjs: <id>-<day|dusk>[-sm].webp (resolved against this
// module so the UI lab in tools/ finds them too). Missing art falls back to the layout thumbnail.
const STAGE_DIR = new URL('../../assets/stages/', import.meta.url).href;
const stageArt = (id, time, small) => `${STAGE_DIR}${id}-${time === 'dusk' ? 'dusk' : 'day'}${small ? '-sm' : ''}.webp`;
const TIME_INFO = {
  day: { label: 'DAY', text: 'Bright sun, crisp shadows.' },
  dusk: { label: 'DUSK', text: 'Low sun, long shadows, harbour lights.' },
};

const TIPS = [
  'Swim in your own ink to zip around and refill your tank.',
  'Hold [SHIFT] to dive into your ink — you are nearly invisible while swimming.',
  'Enemy ink slows you down and chips away at your health. Paint over it!',
  'Swim up any wall you have inked to reach high ground.',
  'Only turf counts when time runs out. Splats just buy you space.',
  'Your special gauge fills as you ink. Press [F] when it glows!',
  'A Splat Bomb costs most of your tank — throw it where it claims the most turf.',
  'Chargers splat in one fully-charged shot. Keep moving and use cover.',
  'Rollers paint huge stripes. Flick the roller to splash foes at range.',
  'Low on ink? Dive in, refill, then push again.',
  'Hold [TAB] to open the big map and spot unpainted turf.',
];
const DIFF_INFO = {
  easy: { pips: 1, text: 'Relaxed bots with shaky aim. Great for learning the ropes.' },
  normal: { pips: 2, text: 'Balanced bots that push turf and fight back.' },
  hard: { pips: 3, text: 'Sharp, aggressive bots that punish mistakes. Bring your A-game.' },
};
const STAT_LABELS = [['range', 'Range'], ['damage', 'Damage'], ['rate', 'Fire rate'], ['mobility', 'Mobility'], ['paint', 'Ink coverage']];
const KIND_LABEL = { shooter: 'Shooter', roller: 'Roller', charger: 'Charger', blaster: 'Blaster', dualies: 'Dualies', slosher: 'Slosher', splatling: 'Splatling' };
const STAT_ICONS = { range: GLYPHS.target, damage: GLYPHS.bolt, rate: GLYPHS.clock, mobility: GLYPHS.feather, paint: GLYPHS.drop };
const LOCKER_TABS = [
  { id: 'kids', label: 'SQUIDKIDS', icon: 'users', sections: ['_presets'] },
  { id: 'hair', label: 'HAIR', icon: 'hair', sections: ['hair', 'hat'] },
  { id: 'face', label: 'FACE', icon: 'eye', sections: ['eyes', 'brows', 'skin'] },
  { id: 'outfit', label: 'OUTFIT', icon: 'shirt', sections: ['outfit'] },
];
const MENU_DESC = {
  play: 'Pick a stage, day or dusk, and jump into a 4 v 4 Turf War',
  loadout: 'Choose your weapon: stats, sub and special for every kind',
  locker: 'Choose your squidkid — tentacles, headgear, eyes, skin and outfit',
  settings: 'Controls, video, audio and gameplay options',
  howto: 'The rules in 30 seconds, plus every control',
  credits: 'The squidkids and code behind INKWAVE',
};

const pctFmt = (v) => Math.round(v * 100) + '%';
const SETTINGS_TABS = [
  { id: 'controls', label: 'Controls', icon: 'gamepad', rows: [
    { key: 'sensitivity', label: 'Mouse sensitivity', type: 'slider', min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + '×', help: 'How far the camera turns for each bit of mouse movement.' },
    { key: 'padSensitivity', label: 'Controller sensitivity', type: 'slider', min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + '×', help: 'Camera turn speed with the right stick.' },
    { key: 'invertY', label: 'Invert vertical look', type: 'toggle', help: 'Push up to look down, like a flight stick.' },
    { key: 'aimAssist', label: 'Aim assist (controller)', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pctFmt, help: 'Gently slows and steers your aim onto nearby rivals when you play with a controller.' },
    { key: 'aimAssistMouse', label: 'Aim assist for mouse', type: 'toggle', help: 'Also apply a lighter aim assist when aiming with a mouse. Off by default.' },
    { key: '_howto', label: 'Controls reference', type: 'link', help: 'Every keyboard, mouse and controller binding in one place.' },
  ] },
  { id: 'video', label: 'Video', icon: 'monitor', rows: [
    { key: 'quality', label: 'Graphics quality', type: 'seg', options: [['low', 'Low'], ['medium', 'Med'], ['high', 'High'], ['ultra', 'Ultra']], help: 'Resolution scale, shadow detail, anti-aliasing and particle counts.' },
    { key: 'fov', label: 'Field of view', type: 'slider', min: 65, max: 100, step: 1, fmt: (v) => Math.round(v) + '°', help: 'Wider shows more of the turf around you.' },
    { key: 'shadows', label: 'Shadows', type: 'toggle', help: 'Soft sun shadows. Turn off for extra speed on older machines.' },
    { key: 'bloom', label: 'Bloom glow', type: 'toggle', help: 'A soft glow around bright ink and specials.' },
    { key: 'showFps', label: 'Show FPS counter', type: 'toggle', help: 'Displays frames per second in the corner during matches.' },
    { key: 'fullscreen', label: 'Fullscreen matches', type: 'toggle', help: 'Matches go fullscreen, so Esc opens and closes the pause menu without letting go of the mouse. Hold Esc to leave fullscreen.' },
  ] },
  { id: 'audio', label: 'Audio', icon: 'speaker', rows: [
    { key: 'master', label: 'Master volume', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pctFmt, help: 'Overall loudness of everything.' },
    { key: 'music', label: 'Music', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pctFmt, help: 'Menu and battle soundtrack.' },
    { key: 'sfx', label: 'Sound effects', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pctFmt, help: 'Weapons, splats, voices and menu sounds.' },
  ] },
  { id: 'gameplay', label: 'Gameplay', icon: 'swords', rows: [
    { key: 'cameraShake', label: 'Camera shake', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pctFmt, help: 'Screen shake from explosions, slams and hits.' },
    { key: 'rumble', label: 'Vibration', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pctFmt, help: 'Controller rumble for hits, splats, bombs and specials. Only while you play with a controller.' },
    { key: 'colorblind', label: 'Colorblind-safe inks', type: 'toggle', help: 'Always use high-contrast yellow vs. blue team inks.' },
    { key: 'minimap', label: 'Minimap', type: 'toggle', help: 'Show the turf minimap in the corner during matches.' },
    { key: 'difficulty', label: 'Default bot skill', type: 'seg', options: null, help: 'Starting difficulty for new matches.' },
    { key: 'matchLength', label: 'Default match length', type: 'seg', options: null, help: 'How long each Turf War lasts.' },
  ] },
];
const TAB_BLURB = {
  controls: 'Look speed, invert, aim assist and the full control reference.',
  video: 'Quality tier, field of view and screen effects.',
  audio: 'Master, music and sound-effect levels.',
  gameplay: 'Shake, vibration, colour-safe inks, minimap and match defaults.',
};

const durLabel = (s) => (s < 120 ? `${s} SEC` : `${Math.round(s / 60)} MIN`);
// FNV-1a — the Character's style seed (character.js hashStr) so an unsaved look resolves identically here
const fnv = (str) => { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };

export class Menus {
  constructor(rootEl, api = {}) {
    this.root = rootEl || document.body;
    this.api = api || {};
    this.el = h('div', { class: 'iw-ui', 'data-screen': '' });
    this.layer = h('div', { class: 'iw-ui__layer' });
    this.cursorEl = h('div', { class: 'iw-cursor' }, h('i', { class: 'iw-cursor__ring' }), h('i', { class: 'iw-cursor__glow' }));
    this.wipeEl = h('div', { class: 'iw-wipe', 'aria-hidden': 'true' });
    this.el.append(this.layer, this.cursorEl, this.wipeEl);
    this.root.appendChild(this.el);
    this.wipe = new InkWipe(this.wipeEl, { isFrozen: () => this._frozen() });

    this.current = null;
    this.timeScale = 1;
    this._scr = null;
    this._stack = [];
    this._focus = null;
    this._focusMem = {};
    this._binds = new WeakMap();
    this._modal = null;
    this._loading = { target: 0, shown: 0, label: 'Mixing the ink…' };
    this._results = null;
    this._resultsDirty = false;
    this._input = 'kbm';
    this._lastMove = 0;
    this._shownAt = 0;
    this._extTick = 0;
    this._sfxAt = {};
    this._swapToken = 0;
    this._setup = null;
    this._accentExternal = false;
    this._cur = { x: new Spring(0, 560, 34), y: new Spring(0, 560, 34), w: new Spring(0, 560, 34), h: new Spring(0, 560, 34), on: false, r: '' };

    this._applyAccent();
    this.el.addEventListener('pointermove', () => {
      this._lastMove = performance.now();
      if (this._input !== 'kbm') this.setInputMode('kbm');
    }, { passive: true });
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());

    this._lastT = performance.now();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  // ================================================================ public API
  show(name = null, opts = {}) {
    if (name === undefined) name = null;
    if (name && !SCREENS.includes(name)) { console.warn('[menus] unknown screen', name); return; }
    const prev = this.current;
    const force = opts.force || (name === 'results' && this._resultsDirty);
    if (name === prev && !force) return;
    if (opts.pop) this._stack.pop();
    else if (opts.push && name) this._stack.push(name);
    else this._stack = name ? [name] : [];
    if (prev && this._focus && this._focus.dataset.id) this._focusMem[prev] = this._focus.dataset.id;
    this.current = name;
    this._shownAt = performance.now();
    const token = ++this._swapToken;
    const swap = () => {
      if (token !== this._swapToken) return;
      this._swap(name, opts);
      safeCall(() => this.api.onScreenChange && this.api.onScreenChange(name));
    };
    const wipe = opts.wipe ?? WIPES.has(`${prev}>${name}`);
    if (wipe && prev !== null && !prefersReducedMotion()) this._runWipe(swap);
    else {
      swap();
      if (prev && name && prev !== name && LIGHT.has(prev) && LIGHT.has(name) && opts.light !== false && !this.wipe.busy && !prefersReducedMotion()) {
        this._runWipe(null, 'light', opts.back ? -1 : 1);
      }
    }
  }

  setLoading(p, label) {
    this._loading.target = clamp(+p || 0, 0, 1);
    if (label != null) this._loading.label = String(label);
    if (this.current === 'loading' && this._scr && this._scr.setLabel) this._scr.setLabel(this._loading.label);
  }

  showResults(data) {
    this._results = data || null;
    this._resultsDirty = true;
  }

  update(dt) {
    this._extTick = performance.now();
    this._tick(clamp(+dt || 0, 0, 0.1));
  }

  handleKey(e) {
    if (!this.current || !e) return false;
    const ae = document.activeElement;
    const typing = ae && ae.tagName === 'INPUT' && this.el.contains(ae);
    if (typing) {
      if (e.key === 'Enter' || e.key === 'NumpadEnter') { e.preventDefault(); ae.blur(); return true; }
      if (e.key === 'Escape') { e.preventDefault(); ae.value = ae.dataset.orig || ae.value; ae.dataset.cancel = '1'; ae.blur(); return true; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab') { e.preventDefault(); ae.blur(); this.setInputMode('kbm'); return this._nav(e.key === 'ArrowUp' ? 'up' : 'down'); }
      return true; // let the character reach the input, but tell the engine it's ours
    }
    if (this.current === 'loading') return false;
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'OS'].includes(e.key)) return false;
    this.setInputMode('kbm');
    if (this.current === 'title') {
      if (e.repeat) return true;
      e.preventDefault();
      this._titleGo();
      return true;
    }
    const byCode = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      Enter: 'accept', NumpadEnter: 'accept', Space: 'accept', Escape: 'back', Backspace: 'back',
      KeyQ: 'tab_prev', KeyE: 'tab_next', PageUp: 'tab_prev', PageDown: 'tab_next', Tab: e.shiftKey ? 'tab_prev' : 'tab_next', KeyR: 'alt',
    };
    const byKey = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'accept', ' ': 'accept', Escape: 'back', Backspace: 'back' };
    const dir = byCode[e.code] || byKey[e.key];
    if (!dir) return false;
    e.preventDefault();
    if (e.repeat && (dir === 'accept' || dir === 'back' || dir === 'tab_prev' || dir === 'tab_next' || dir === 'alt')) {
      if (dir === 'accept' && this._scr && this._scr.onHold) this._scr.onHold();
      return true;
    }
    this._nav(dir);
    return true;
  }

  nav(dir) {
    if (!this.current) return false;
    this.setInputMode('pad');
    const ae = document.activeElement;
    if (ae && ae.tagName === 'INPUT' && this.el.contains(ae)) {
      if (dir === 'back') { ae.value = ae.dataset.orig || ae.value; ae.dataset.cancel = '1'; }
      ae.blur();
      if (dir === 'accept' || dir === 'back') return true;
    }
    if (this.current === 'loading') return false;
    if (this.current === 'title') { if (dir === 'accept' || dir === 'back') this._titleGo(); return true; }
    return this._nav(dir);
  }

  /** Optional: menu accent inks (e.g. the attract-mode palette). Defaults to the first team palette / colorblind palette. */
  setAccent(a, b) {
    this._accentExternal = true;
    colorVars(this.el, 'a', toHex(a));
    colorVars(this.el, 'b', toHex(b));
  }

  setInputMode(mode) {
    if (mode !== 'kbm' && mode !== 'pad') return;
    if (this._input === mode) return;
    this._input = mode;
    this.el.classList.toggle('is-pad', mode === 'pad');
    if (this._scr && this._scr.onInputMode) this._scr.onInputMode(mode);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this.wipe.cancel();
    this.el.remove();
  }

  // ================================================================ internals: loop / sound / accent
  _loop(t) {
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.1, (t - this._lastT) / 1000);
    this._lastT = t;
    if (t - this._extTick < 80) return; // engine is driving update()
    if (!this.current && !this._scr) return;
    this._tick(dt);
  }

  /** The UI lab freezes every animation by tagging the root; JS-driven motion honours it too. */
  _frozen() { return this.root.classList.contains('iw-lab-freeze'); }

  _tick(dt) {
    dt = this._frozen() ? 0 : dt * (this.timeScale > 0 ? this.timeScale : 1);
    this.wipe.timeScale = this.timeScale > 0 ? this.timeScale : 1;
    const L = this._loading;
    L.shown += (L.target - L.shown) * (1 - Math.exp(-dt * 6));
    if (Math.abs(L.target - L.shown) < 0.001) L.shown = L.target;
    // layout reads (cursor) first, then the screen's style writes — no forced reflow between them
    this._updateCursor(dt);
    if (this._scr && this._scr.tick) this._scr.tick(dt);
  }

  _sfx(name, minGap = 0.03) {
    const t = performance.now() / 1000;
    if (t - (this._sfxAt[name] || 0) < minGap) return;
    this._sfxAt[name] = t;
    try { this.api.playSound && this.api.playSound(name); } catch (e) { /* audio is optional */ }
  }

  _settings() {
    let s = null;
    try { s = this.api.getSettings && this.api.getSettings(); } catch (e) { s = null; }
    return { ...DEFAULT_SETTINGS, ...(s || {}) };
  }
  _setSetting(key, value) {
    safeCall(() => this.api.setSettings && this.api.setSettings({ [key]: value }));
    if (key === 'colorblind' && !this._accentExternal) this._applyAccent();
    if (this._scr && this._scr.onSetting) safeCall(() => this._scr.onSetting(key, value));
  }
  _profile() {
    let p = null;
    try { p = this.api.getProfile && this.api.getProfile(); } catch (e) { p = null; }
    p = { name: 'Player', level: 1, xp: 0, wins: 0, played: 0, ...(p || {}) };
    if (!p.xpToNext) p.xpToNext = PROGRESSION.xpForLevel(p.level);
    if (p.played == null) p.played = p.matches ?? (p.wins + (p.losses || 0));
    return p;
  }
  _loadout() {
    let l = null;
    try { l = this.api.getLoadout && this.api.getLoadout(); } catch (e) { l = null; }
    const w = (l && l.weapon) || 'shooter';
    return { weapon: this._weapons()[w] ? w : 'shooter' };
  }
  _weapons() { return this.api.weapons || WEAPONS; }
  _weaponOrder() { return this.api.weaponOrder || WEAPON_ORDER; }
  _specials() { return this.api.specials || SPECIALS; }
  _sub() { return this.api.sub || SUB.bomb; }
  _maps() { return this.api.maps || MAPS; }
  _diffs() { return this.api.difficulties || DIFFICULTY; }
  _version() { return this.api.version || VERSION; }

  _applyAccent() {
    if (this._accentExternal) return;
    const s = this._settings();
    const pal = s.colorblind ? COLORBLIND_PALETTE : TEAM_PALETTES[0];
    colorVars(this.el, 'a', pal.a);
    colorVars(this.el, 'b', pal.b);
  }
  _accent() {
    const st = this.el.style;
    return [st.getPropertyValue('--a').trim() || TEAM_PALETTES[0].a, st.getPropertyValue('--b').trim() || TEAM_PALETTES[0].b];
  }
  /** Team names for an accent pair (palette lookup; used where no match data exists). */
  _accentNames() {
    const [a] = this._accent();
    const all = [...TEAM_PALETTES, COLORBLIND_PALETTE];
    const p = all.find((x) => x.a.toLowerCase() === a.toLowerCase());
    return (p && p.names) || TEAM_NAMES;
  }

  // ================================================================ screen swapping / transitions
  _swap(name, opts) {
    const old = this._scr;
    if (old) {
      safeCall(() => old.destroy && old.destroy());
      old.el.classList.add('is-leaving');
      if (opts.back) old.el.classList.add('is-back');
      const oe = old.el;
      setTimeout(() => oe.remove(), opts.instantLeave ? 0 : 340);
    }
    this._modal = null;
    this._setFocus(null);
    this.el.classList.toggle('is-active', !!name);
    this.el.dataset.screen = name || '';
    this.el.classList.toggle('is-ingame', this._stack[0] === 'pause');
    if (!name) { this._scr = null; return; }
    if (name === 'results') this._resultsDirty = false;
    const scr = this['_scr_' + name](opts);
    scr.name = name;
    this._scr = scr;
    if (opts.back) scr.el.classList.add('is-back');
    if (this._stack[0] === 'pause' && name !== 'pause') scr.el.prepend(h('div', { class: 'iw-dimbg' }));
    let i = 0;
    scr.el.querySelectorAll('.iw-in').forEach((n) => { if (!n.style.getPropertyValue('--i')) n.style.setProperty('--i', i++); });
    this.layer.appendChild(scr.el);
    const memId = opts.back ? this._focusMem[name] : null;
    let f = memId ? scr.el.querySelector(`[data-id="${CSS.escape(memId)}"]`) : null;
    if (!f && scr.initial) f = typeof scr.initial === 'string' ? scr.el.querySelector(scr.initial) : typeof scr.initial === 'function' ? scr.initial() : scr.initial;
    if (!f) f = scr.el.querySelector('[data-nav]');
    if (f) this._setFocus(f, { snap: true });
    if (scr.afterMount) scr.afterMount();
  }

  /** mode: 'full' (organic ink pour; mid ≈ 380 ms, clear ≈ 1000 ms) · 'light' (quick swipe) · reduced motion → 'fade'. */
  _runWipe(mid, mode, dir = 1) {
    const [a, b] = this._accent();
    const m = mode || (prefersReducedMotion() ? 'fade' : 'full');
    this.wipe.run({ a, b, mode: m, dir, onMid: mid || null });
  }

  _go(name, opts = {}) { this.show(name, { ...opts, push: true }); }

  _back() {
    if (this._modal) { this._closeModal(); return; }
    if (performance.now() - this._shownAt < 200) return; // swallow the key that opened this screen
    const s = this._scr;
    if (s && s.onBack) { s.onBack(); return; }
    if (this._stack.length > 1) {
      this._sfx('ui_back');
      this.show(this._stack[this._stack.length - 2], { pop: true, back: true });
    } else if (['loadout', 'setup', 'locker', 'settings', 'howto', 'credits'].includes(this.current)) {
      this._sfx('ui_back'); // opened directly by the engine: fall back to the main menu
      this.show('main', { back: true });
    }
  }

  _titleGo() {
    if (this.current !== 'title' || this._leavingTitle) return;
    if (performance.now() - this._shownAt < 350) return;
    this._leavingTitle = true;
    this._sfx('ui_confirm');
    this._sfx('splat_small');
    if (this._scr) this._scr.el.classList.add('is-go');
    setTimeout(() => { this._leavingTitle = false; this.show('main', { wipe: true }); }, 200);
  }

  // ================================================================ focus + navigation
  _bind(el, opts = {}) {
    el.dataset.nav = opts.type || 'button';
    if (opts.id) el.dataset.id = opts.id;
    if (el.tagName === 'BUTTON') { el.type = 'button'; el.tabIndex = -1; el.addEventListener('mousedown', (e) => e.preventDefault()); }
    this._binds.set(el, opts);
    el.addEventListener('pointerenter', () => {
      if (performance.now() - this._lastMove < 150 && !(this._modal && !this._modal.contains(el))) this._setFocus(el, { sound: true });
    });
    if (opts.accept && opts.click !== false) {
      el.addEventListener('click', (e) => {
        if (this._modal && !this._modal.contains(el)) return;
        if (e.target.closest('.iw-noclick')) return;
        this._setFocus(el);
        opts.accept('mouse');
      });
    }
    return el;
  }

  /** Pointer micro-interactions: ink origin (--mx/--my, % of the box), 3D tilt (--rx/--ry) + parallax (--px/--py), press squash. */
  _fx(el, { tilt = 0, press = true } = {}) {
    let r = null;
    const st = el.style;
    const move = (e) => {
      if (!r) r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = clamp((e.clientX - r.left) / r.width), y = clamp((e.clientY - r.top) / r.height);
      st.setProperty('--mx', (x * 100).toFixed(1) + '%');
      st.setProperty('--my', (y * 100).toFixed(1) + '%');
      if (tilt) {
        st.setProperty('--rx', ((0.5 - y) * tilt).toFixed(2) + 'deg');
        st.setProperty('--ry', ((x - 0.5) * tilt).toFixed(2) + 'deg');
        st.setProperty('--px', (x - 0.5).toFixed(3));
        st.setProperty('--py', (y - 0.5).toFixed(3));
      }
    };
    el.addEventListener('pointerenter', (e) => { r = el.getBoundingClientRect(); el.classList.add('is-hover'); move(e); }, { passive: true });
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerleave', () => {
      r = null;
      el.classList.remove('is-hover', 'is-down');
      if (tilt) { st.setProperty('--rx', '0deg'); st.setProperty('--ry', '0deg'); st.setProperty('--px', '0'); st.setProperty('--py', '0'); }
    }, { passive: true });
    if (press) {
      el.addEventListener('pointerdown', (e) => { if (e.button === 0) el.classList.add('is-down'); }, { passive: true });
      const up = () => el.classList.remove('is-down');
      el.addEventListener('pointerup', up, { passive: true });
      el.addEventListener('pointercancel', up, { passive: true });
    }
    return el;
  }

  /** Ink splash centred on an element (client coords → the screen layer). */
  _burstAt(el, opts = {}) {
    if (!el || !this._scr || prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    inkBurst(this._scr.el, { x: r.left + r.width / 2, y: r.top + r.height / 2, color: 'var(--a)', ...opts });
  }

  _setFocus(el, { sound = false, snap = false } = {}) {
    if (el === this._focus) return;
    if (this._focus) this._focus.classList.remove('is-focus');
    this._focus = el;
    if (!el) return;
    el.classList.add('is-focus');
    if (sound) this._sfx('ui_hover', 0.035);
    if (snap || !this._cur.on) this._cur.snapNext = true;
    const cs = getComputedStyle(el);
    this._cur.r = cs.borderTopLeftRadius;
    if (this._scr && this._scr.onFocus) this._scr.onFocus(el);
  }

  _candidates() {
    const root = this._modal || (this._scr && this._scr.el);
    if (!root) return [];
    return [...root.querySelectorAll('[data-nav]')].filter((e) => !e.disabled && e.offsetParent !== null && !e.closest('.is-leaving'));
  }

  _nav(dir) {
    const s = this._scr;
    if (!s) return false;
    if (this._starting) return true; // launching a match: ignore input under the wipe
    if (s.onNav && s.onNav(dir)) return true;
    if (dir === 'back') { this._back(); return true; }
    if (dir === 'tab_prev' || dir === 'tab_next') return true;
    if (dir !== 'accept' && dir !== 'up' && dir !== 'down' && dir !== 'left' && dir !== 'right') return true; // 'alt' etc. unused here
    const f = this._focus && this._focus.isConnected ? this._focus : null;
    const b = f ? this._binds.get(f) : null;
    if (dir === 'accept') {
      if (b && b.accept) { this._press(f); b.accept('key'); }
      return true;
    }
    if ((dir === 'left' || dir === 'right') && b && b.adjust) { b.adjust(dir === 'left' ? -1 : 1); return true; }
    const next = this._spatial(f, dir);
    if (next) this._moveFocus(next, dir);
    else if (f) this._bump(f, dir);
    return true;
  }

  /** Keyboard / pad focus move: ink floods in from the side we arrived from; screens see `_navFocus` in onFocus. */
  _moveFocus(next, dir) {
    if (!next) return false;
    next.style.setProperty('--mx', dir === 'left' ? '100%' : dir === 'right' ? '0%' : '50%');
    next.style.setProperty('--my', dir === 'up' ? '100%' : dir === 'down' ? '0%' : '50%');
    this._navFocus = true;
    try { this._setFocus(next, { sound: true }); } finally { this._navFocus = false; }
    return true;
  }
  _bump(el, dir) { if (el) restartAnim(el, dir === 'up' || dir === 'down' ? 'is-bump-v' : 'is-bump-h'); }

  /** Explicit focus graph for screens whose layout makes spatial nav ambiguous: map el → { up, down, left, right }
   *  (element, function → element, or null = edge bump). Directions not listed fall through to the default nav. */
  _graphNav(graph, dir) {
    if (dir !== 'up' && dir !== 'down' && dir !== 'left' && dir !== 'right') return false;
    const f = this._focus, g = f && graph.get(f);
    if (!g || !(dir in g)) return false;
    let t = g[dir];
    if (typeof t === 'function') t = t();
    if (t && t.isConnected && t !== f) this._moveFocus(t, dir);
    else this._bump(f, dir);
    return true;
  }

  _press(el) { if (el) restartAnim(el, 'is-press'); }

  _spatial(from, dir) {
    const cands = this._candidates();
    if (!cands.length) return null;
    if (!from || !cands.includes(from)) return cands[0];
    const fr = from.getBoundingClientRect();
    const fcx = fr.left + fr.width / 2, fcy = fr.top + fr.height / 2;
    let best = null, bestScore = Infinity;
    for (const c of cands) {
      if (c === from) continue;
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let primary, ortho;
      if (dir === 'down' || dir === 'up') {
        primary = dir === 'down' ? cy - fcy : fcy - cy;
        if (primary < Math.min(fr.height, r.height) * 0.3) continue;
        ortho = Math.max(0, Math.max(fr.left, r.left) - Math.min(fr.right, r.right));
      } else {
        primary = dir === 'right' ? cx - fcx : fcx - cx;
        if (primary < Math.min(fr.width, r.width) * 0.3) continue;
        ortho = Math.max(0, Math.max(fr.top, r.top) - Math.min(fr.bottom, r.bottom));
      }
      const score = primary + ortho * 3 + Math.abs(dir === 'down' || dir === 'up' ? cx - fcx : cy - fcy) * 0.15;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    if (!best && this._scr && this._scr.wrap && (dir === 'down' || dir === 'up')) {
      let ext = null, ev = dir === 'down' ? Infinity : -Infinity;
      for (const c of cands) {
        const r = c.getBoundingClientRect();
        const overl = Math.min(fr.right, r.right) - Math.max(fr.left, r.left);
        if (overl <= 0) continue;
        const cy = r.top + r.height / 2;
        if (dir === 'down' ? cy < ev : cy > ev) { ev = cy; ext = c; }
      }
      if (ext && ext !== from) best = ext;
    }
    return best;
  }

  _updateCursor(dt) {
    const C = this._cur, f = this._focus;
    // hide while the focused element is still popping in (staggered entrance keeps it transparent);
    // elements with their own focus ring (tilting cards) opt out with data-cur="own"
    const want = !!(f && f.isConnected && !(this._scr && this._scr.noCursor) && f.dataset.cur !== 'own' && !f.closest('.is-leaving') && parseFloat(getComputedStyle(f).opacity) > 0.6);
    if (!want) {
      if (C.on) { this.cursorEl.classList.remove('is-on'); C.on = false; }
      C.snapNext = true;
      return;
    }
    const r = f.getBoundingClientRect();
    const pad = f.dataset.curPad != null ? +f.dataset.curPad : 7;
    const tx = r.left - pad, ty = r.top - pad, tw = r.width + pad * 2, th = r.height + pad * 2;
    C.x.target = tx; C.y.target = ty; C.w.target = tw; C.h.target = th;
    if (C.snapNext || !C.on) { C.x.snap(tx); C.y.snap(ty); C.w.snap(tw); C.h.snap(th); C.snapNext = false; }
    else if (dt > 0) { C.x.step(dt); C.y.step(dt); C.w.step(dt); C.h.step(dt); }
    if (!C.on) { this.cursorEl.classList.add('is-on'); C.on = true; }
    const st = this.cursorEl.style;
    st.transform = `translate3d(${C.x.x.toFixed(1)}px,${C.y.x.toFixed(1)}px,0)`;
    st.width = Math.max(0, C.w.x).toFixed(1) + 'px';
    st.height = Math.max(0, C.h.x).toFixed(1) + 'px';
    const rad = parseFloat(C.r) || 0;
    const rr = `${Math.round(rad + pad)}px`;
    if (st.borderRadius !== rr) st.borderRadius = rr;
  }

  // ================================================================ modal
  _openModal({ title, text, buttons, danger = false }) {
    const btnEls = buttons.map((b, i) => this._btn({ id: 'modal-' + i, label: b.label, cls: 'iw-btn--modal ' + (b.cls || ''), accept: b.accept, sound: b.sound || 'ui_click' }));
    const m = h('div', { class: 'iw-modal' },
      h('div', { class: 'iw-modal__card' + (danger ? ' is-danger' : '') },
        h('div', { class: 'iw-modal__splat', html: splatSVG({ seed: 5, cls: danger ? 'iw-fdanger' : 'iw-fa' }) }),
        h('div', { class: 'iw-modal__title iw-display' }, title),
        text ? h('p', { class: 'iw-modal__text' }, text) : null,
        h('div', { class: 'iw-modal__btns' }, btnEls)));
    this._scr.el.appendChild(m);
    this._modalPrev = this._focus;
    this._modal = m;
    this._setFocus(btnEls[0], { snap: true });
    this._sfx('ui_click');
  }
  _closeModal(silent) {
    const m = this._modal;
    if (!m) return;
    this._modal = null;
    m.classList.add('is-leaving');
    setTimeout(() => m.remove(), 240);
    if (!silent) this._sfx('ui_back');
    if (this._modalPrev && this._modalPrev.isConnected) this._setFocus(this._modalPrev, { snap: true });
  }

  // ================================================================ building blocks
  _hint(kbm, pad, label) {
    const k = Array.isArray(kbm) ? kbm : [kbm];
    return h('span', { class: 'iw-hint' },
      h('span', { class: 'iw-kbm', html: k.map((x) => (x === 'LMB' ? mouseGlyph('L') : x === 'RMB' ? mouseGlyph('R') : keycap(x))).join('') }),
      h('span', { class: 'iw-padg', html: pad ? padGlyph(pad) : '' }),
      label ? h('span', { class: 'iw-hint__label' }, label) : null);
  }
  _prompts(items) {
    return h('div', { class: 'iw-prompts iw-in iw-in--up' }, items.map(([k, p, l]) => this._hint(k, p, l)));
  }
  _header(title, { back = true, sub = null } = {}) {
    return h('header', { class: 'iw-head iw-in iw-in--down' },
      back ? h('button', {
        class: 'iw-backbtn', type: 'button', tabindex: '-1',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => this._back(),
        onpointerenter: () => this._sfx('ui_hover', 0.05),
      }, h('span', { class: 'iw-backbtn__arrow', html: GLYPHS.back }), this._hint('Esc', 'B')) : null,
      h('div', { class: 'iw-head__titles' },
        h('div', { class: 'iw-head__title' },
          h('span', { class: 'iw-head__blob', html: splatSVG({ seed: title.length * 7 + 3, cls: 'iw-fa', r: 60, arms: 7, drops: 3 }) }),
          h('span', { class: 'iw-display' }, title)),
        sub ? h('div', { class: 'iw-head__sub' }, sub) : null));
  }
  _btn({ id, label, sub, icon, cls = '', accept, sound = 'ui_click', tilt = 0, badge = null }) {
    const b = h('button', { class: `iw-btn ${cls}`, style: { '--tilt': `${tilt}deg` } },
      h('span', { class: 'iw-btn__blob' }),
      icon ? h('span', { class: 'iw-btn__icon', html: icon }) : null,
      h('span', { class: 'iw-btn__text' },
        h('span', { class: 'iw-btn__label' }, label),
        sub ? h('span', { class: 'iw-btn__sub' }, sub) : null),
      badge);
    this._fx(b);
    this._bind(b, { id, accept: (src) => { if (sound) this._sfx(sound); if (src === 'mouse') this._press(b); accept && accept(src); } });
    return b;
  }
  _panel(cls, ...kids) { return h('div', { class: `iw-panel ${cls || ''}` }, ...kids); }

  // ================================================================ SCREEN: loading
  _scr_loading() {
    const fill = h('div', { class: 'iw-progress__fill' }, h('i', { class: 'iw-progress__wave' }), h('i', { class: 'iw-progress__edge' }));
    const pctEl = h('span', { class: 'iw-progress__pct' }, '0%');
    const label = h('div', { class: 'iw-loading__label' }, this._loading.label);
    const tipText = h('div', { class: 'iw-tip__text' });
    const tip = h('div', { class: 'iw-tip iw-in iw-in--up' }, h('span', { class: 'iw-tip__tag' }, 'TIP'), tipText);
    const blobs = h('div', { class: 'iw-loading__bg' }, [0, 1, 2, 3, 4, 5].map((i) => h('i', { class: `iw-bgblob iw-bgblob--${i}` })));
    const el = h('div', { class: 'iw-screen iw-loading' }, blobs,
      h('div', { class: 'iw-loading__center' },
        h('div', { class: 'iw-in iw-in--pop', html: logoMarkup(GAME_TITLE, GAME_SUBTITLE, 'md') }),
        h('div', { class: 'iw-progress iw-in iw-in--up' }, h('div', { class: 'iw-progress__track' }, fill), pctEl),
        h('div', { class: 'iw-in iw-in--up' }, label)),
      tip,
      h('div', { class: 'iw-corner iw-corner--br iw-in' }, `v${this._version()}`));
    let tipIdx = Math.floor(Math.random() * TIPS.length), tipT = 0, lastPct = -1;
    const setTip = () => { tipText.innerHTML = richText(TIPS[tipIdx % TIPS.length]); restartAnim(tipText, 'is-in'); };
    setTip();
    return {
      el, noCursor: true,
      setLabel: (t) => { if (label.textContent !== t) { label.textContent = t; restartAnim(label, 'is-in'); } },
      tick: (dt) => {
        const p = this._loading.shown;
        fill.style.transform = `translateX(${(-100 + p * 100).toFixed(2)}%)`;
        const pr = Math.round(p * 100);
        if (pr !== lastPct) { pctEl.textContent = pr + '%'; lastPct = pr; }
        tipT += dt;
        if (tipT > 4.8) { tipT = 0; tipIdx++; setTip(); }
      },
    };
  }

  // ================================================================ SCREEN: title
  _scr_title() {
    const press = h('div', { class: 'iw-title__press iw-in iw-in--up' },
      h('span', { class: 'iw-title__presstext' }, this._input === 'pad' ? 'PRESS ANY BUTTON' : 'PRESS ANY KEY'),
      h('span', { class: 'iw-title__presssub' }, this._input === 'pad' ? '' : 'or click to start'));
    const el = h('div', { class: 'iw-screen iw-title', onclick: () => this._titleGo() },
      h('div', { class: 'iw-title__scrim' }),
      h('div', { class: 'iw-title__logo iw-in iw-in--logo' }, h('i', { class: 'iw-title__shock' }), h('div', { class: 'iw-title__logoin', html: logoMarkup(GAME_TITLE, GAME_SUBTITLE, 'xl') })),
      press,
      h('div', { class: 'iw-corner iw-corner--bl iw-in' }, h('b', null, GAME_TITLE), ' · an original turf-war shooter'),
      h('div', { class: 'iw-corner iw-corner--br iw-in' }, `v${this._version()}`));
    return {
      el, noCursor: true,
      onInputMode: (m) => {
        press.firstChild.textContent = m === 'pad' ? 'PRESS ANY BUTTON' : 'PRESS ANY KEY';
        press.lastChild.textContent = m === 'pad' ? '' : 'or click to start';
      },
    };
  }

  // ================================================================ SCREEN: main
  _scr_main() {
    const prof = this._profile();
    const lo = this._loadout();
    const W = this._weapons()[lo.weapon];
    const sp = this._specials()[W.special] || Object.values(this._specials())[0];
    const sub = this._sub();
    const items = [
      { id: 'play', label: 'PLAY', sub: 'Turf War · 4 v 4', icon: GLYPHS.play, cls: 'iw-btn--menu iw-btn--xl iw-btn--primary', accept: () => this._go('setup'), sound: 'ui_confirm' },
      { id: 'loadout', label: 'LOADOUT', icon: weaponIcon(W.kind || lo.weapon), cls: 'iw-btn--menu', accept: () => this._go('loadout') },
      { id: 'locker', label: 'LOCKER', icon: GLYPHS.hanger, cls: 'iw-btn--menu', accept: () => this._go('locker') },
      { id: 'settings', label: 'SETTINGS', icon: GLYPHS.gear, cls: 'iw-btn--menu', accept: () => this._go('settings') },
      { id: 'howto', label: 'HOW TO PLAY', icon: GLYPHS.question, cls: 'iw-btn--menu', accept: () => this._go('howto') },
      { id: 'credits', label: 'CREDITS', icon: GLYPHS.star, cls: 'iw-btn--menu', accept: () => this._go('credits') },
    ];
    const tilts = [-2.2, 1.4, -1.1, 1.6, -1.3, 1.1];
    const btns = items.map((it, i) => { const b = this._btn({ ...it, tilt: tilts[i % tilts.length] }); b.classList.add('iw-in', 'iw-in--left'); return b; });
    const descText = h('span', { class: 'iw-main__desctext' });
    const desc = h('div', { class: 'iw-main__desc iw-in iw-in--left' }, h('i', { class: 'iw-main__descdot' }), descText);
    const xpT = clamp(prof.xp / Math.max(1, prof.xpToNext));
    const tier = rankTier(prof.level);
    const rank = RANK_TIERS[tier];
    const nextRank = RANK_TIERS[tier + 1];
    const avatar = h('div', { class: 'iw-profile__avatar' }, h('span', { class: 'iw-profile__avblob', html: splatSVG({ seed: 17, cls: 'iw-fa', r: 62, arms: 8, drops: 0 }) }), h('span', { class: 'iw-profile__squid', html: SQUID }));
    this._portraitInto(avatar, { kind: 'head', size: 160 });
    this._preloadStages();
    const profile = this._panel('iw-profile iw-in iw-in--right',
      avatar,
      h('div', { class: 'iw-profile__info' },
        h('div', { class: 'iw-profile__name' }, prof.name),
        h('div', { class: `iw-profile__rank ${rank.cls}` }, h('i', { class: 'iw-profile__emblem', html: rankEmblem(tier) }), h('span', null, rank.name))),
      h('div', { class: 'iw-profile__xp' },
        h('span', { class: 'iw-lvl' }, h('small', null, 'LV'), String(prof.level)),
        h('span', { class: 'iw-xpbar iw-xpbar--shine', style: { '--t': xpT.toFixed(3) } }, h('i'), h('b', { class: 'iw-xpbar__glint' })),
        h('span', { class: 'iw-profile__xpnum' }, `${fmtInt(prof.xp)} / ${fmtInt(prof.xpToNext)} XP`)),
      h('div', { class: 'iw-profile__stats' },
        h('div', null, h('b', null, fmtInt(prof.wins)), h('span', null, 'WINS')),
        h('div', null, h('b', null, fmtInt(prof.played)), h('span', null, 'MATCHES')),
        nextRank ? h('div', { class: 'iw-profile__next' }, h('span', null, 'NEXT RANK'), h('b', null, `LV ${nextRank.lv}`)) : null));
    const kit = this._panel('iw-kitcard iw-in iw-in--right',
      h('div', { class: 'iw-kitcard__label' }, 'CURRENT LOADOUT'),
      h('div', { class: 'iw-kitcard__main' },
        h('span', { class: 'iw-kitcard__icon', html: weaponIcon(W.kind || lo.weapon) }),
        h('div', null, h('div', { class: 'iw-kitcard__name' }, W.name), h('div', { class: 'iw-kitcard__kind' }, W.class || KIND_LABEL[W.kind] || ''))),
      h('div', { class: 'iw-kitcard__chips' },
        h('span', { class: 'iw-chip' }, h('i', { html: SUB_ICONS.bomb }), sub.name),
        h('span', { class: 'iw-chip' }, h('i', { html: specialIcon(sp.id) }), sp.name)));
    const el = h('div', { class: 'iw-screen iw-main' },
      h('div', { class: 'iw-scrim-left' }),
      h('div', { class: 'iw-main__logo iw-in iw-in--down', html: logoMarkup(GAME_TITLE, GAME_SUBTITLE, 'sm') }),
      h('nav', { class: 'iw-main__menu' }, btns),
      desc,
      h('div', { class: 'iw-main__side' }, profile, kit),
      h('div', { class: 'iw-corner iw-corner--bl iw-in' }, `v${this._version()}`),
      this._prompts([['Enter', 'A', 'Select'], ['Esc', 'B', 'Title']]));
    return {
      el, wrap: true, initial: btns[0],
      onFocus: (f) => {
        const t = MENU_DESC[f.dataset.id];
        if (t && descText.textContent !== t) { descText.textContent = t; restartAnim(desc, 'is-swap'); }
      },
      onBack: () => { this._sfx('ui_back'); this.show('title', { back: true }); },
    };
  }

  // ================================================================ SCREEN: setup (stage select)
  /** The time of day a stage will be played at: this session's pick → saved per-stage pick → settings.timeOfDay. */
  _stageTime(id) {
    const s = this._settings();
    const t = (this._setup && this._setup.times && this._setup.times[id]) || (s.stageTimes && s.stageTimes[id]);
    return t === 'dusk' || t === 'day' ? t : (s.timeOfDay === 'dusk' ? 'dusk' : 'day');
  }

  /** Warm the image cache with every stage render (hero + thumbnail, day + dusk) so switches never flash. */
  _preloadStages() {
    if (this._stageImgs) return;
    this._stageImgs = [];
    for (const m of this._maps()) {
      for (const t of ['day', 'dusk']) {
        for (const sm of [true, false]) {
          const im = new Image();
          im.decoding = 'async';
          im.src = stageArt(m.id, t, sm);
          if (im.decode) im.decode().catch(() => {});
          this._stageImgs.push(im);
        }
      }
    }
  }

  _scr_setup() {
    const s = this._settings();
    const maps = this._maps();
    const diffs = this._diffs();
    const durations = (MATCH.durations || [90, 180]);
    const byId = (id) => maps.find((m) => m.id === id);
    const st = this._setup || (this._setup = { times: {} });
    st.times = { ...(s.stageTimes || {}), ...(st.times || {}) };
    if (!byId(st.mapId)) st.mapId = byId(s.lastStage) ? s.lastStage : maps[0].id;
    st.difficulty = diffs[s.difficulty] ? s.difficulty : 'normal';
    st.duration = durations.includes(s.matchLength) ? s.matchLength : (MATCH.defaultDuration || 180);
    const timeOf = (id) => this._stageTime(id);
    const reduced = prefersReducedMotion();
    this._preloadStages();

    // ---- JS tweens (driven by tick → honour the lab's freeze / slow-mo)
    const tweens = [];
    const tween = (dur, step, done = null, delay = 0) => { const o = { t: -delay, dur, step, done }; tweens.push(o); if (delay <= 0) step(0); return o; };

    // ---- hero: big stage art, name tape, DAY / DUSK switch, layout sticker
    const art = h('div', { class: 'iw-ss__art' });
    const counter = h('span', { class: 'iw-ss__count' });
    const layoutMap = h('span', { class: 'iw-ss__layoutmap' });
    const layoutEl = h('div', { class: 'iw-ss__layout' }, layoutMap, h('span', { class: 'iw-ss__layoutlbl' }, h('i', { html: GLYPHS.map }), 'LAYOUT'));
    const stars = h('div', { class: 'iw-ss__stars' }, Array.from({ length: 16 }, (_, i) => {
      const x = ((i * 0.618034 + 0.13) % 1) * 96 + 2, y = ((i * 0.41421 + 0.07) % 1) * 34 + 3;
      return h('i', { style: { left: `${x.toFixed(1)}%`, top: `${y.toFixed(1)}%`, '--d': `${((i * 0.37) % 1 * 3).toFixed(2)}s`, '--s': (0.55 + ((i * 0.73) % 1) * 0.8).toFixed(2) } });
    }));
    const frame = h('div', { class: 'iw-ss__frame' }, art, h('i', { class: 'iw-ss__sun' }), stars, h('i', { class: 'iw-ss__glare' }), h('i', { class: 'iw-ss__vig' }), counter, layoutEl);
    const nameEl = h('div', { class: 'iw-ss__name' });
    const blurbEl = h('div', { class: 'iw-ss__blurb' });
    const caption = h('div', { class: 'iw-ss__caption' }, h('div', { class: 'iw-ss__tape' }, nameEl), blurbEl);
    const drips = h('div', { class: 'iw-ss__drips', html: `<svg viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">${
      [[38, 1], [96, 1.6], [140, 0.8], [226, 1.3], [300, 0.9], [352, 1.5]].map(([x, k], i) => `<g class="iw-ss__drip" style="--d:${i}"><path class="iw-fa" d="M${x - 6} 0 L${x + 6} 0 L${x + 4} ${22 * k} Q${x} ${31 * k} ${x - 4} ${22 * k} Z"/></g>`).join('')}</svg>` });

    // DAY / DUSK switch (big, sticker-like; the thumb carries a sun that sets and a moon that rises)
    const optDay = h('span', { class: 'iw-daytgl__opt is-day iw-noclick' }, 'DAY');
    const optDusk = h('span', { class: 'iw-daytgl__opt is-dusk iw-noclick' }, 'DUSK');
    const tgl = h('button', { class: 'iw-daytgl' },
      h('span', { class: 'iw-daytgl__sky' }, h('i', { class: 'iw-daytgl__cloud' }), h('i', { class: 'iw-daytgl__cloud is-2' }),
        ...Array.from({ length: 6 }, (_, i) => h('i', { class: 'iw-daytgl__star', style: { '--i': i } }))),
      h('span', { class: 'iw-daytgl__thumb' }, h('i', { class: 'iw-daytgl__sunico', html: GLYPHS.sun }), h('i', { class: 'iw-daytgl__moonico', html: GLYPHS.moon })),
      optDay, optDusk);
    const timeText = h('span', { class: 'iw-ss__timetext' });
    const tglWrap = h('div', { class: 'iw-ss__time' }, h('div', { class: 'iw-ss__timehead' }, h('small', null, 'TIME OF DAY'), this._hint(['Q', 'E'], null)), tgl, timeText);
    tglWrap.querySelector('.iw-padg').innerHTML = padGlyph('LB') + padGlyph('RB');
    const hero = h('div', { class: 'iw-ss__hero iw-in iw-in--pop' },
      h('div', { class: 'iw-ss__splat', html: splatSVG({ seed: 21, cls: 'iw-fa', r: 60, arms: 9, drops: 6 }) }),
      h('div', { class: 'iw-ss__splat is-b', html: splatSVG({ seed: 34, cls: 'iw-fb', r: 56, arms: 8, drops: 4 }) }),
      frame, drips, caption, tglWrap);
    this._fx(frame, { tilt: 3, press: false });

    // ---- background: the selected stage, blurred, washing the whole screen in its light
    const bg = h('div', { class: 'iw-ss__bg' });
    const setBg = () => {
      const im = h('img', { class: 'iw-ss__bgimg', alt: '', draggable: 'false' });
      im.addEventListener('error', () => im.remove(), { once: true });
      im.src = stageArt(st.mapId, timeOf(st.mapId), true);
      const olds = [...bg.children];
      bg.appendChild(im);
      requestAnimationFrame(() => requestAnimationFrame(() => im.classList.add('is-on')));
      setTimeout(() => olds.forEach((o) => o.remove()), 900);
    };

    // ---- art layers + ink reveals
    const makeLayer = (id, time) => {
      const m = byId(id);
      const img = h('img', { class: 'iw-ss__img', alt: '', draggable: 'false' });
      const L = h('div', { class: 'iw-ss__layer', 'data-time': time }, img);
      img.addEventListener('error', () => {
        L.classList.add('is-noart');
        L.appendChild(h('div', { class: 'iw-ss__fallback', html: (m && m.thumb) || mapThumb(m, 3) }));
      }, { once: true });
      img.src = stageArt(id, time);
      L._img = img;
      return L;
    };
    const whenReady = (img, cb) => {
      if (img.complete || !img.decode) { cb(); return; }
      let fired = false;
      const go = () => { if (!fired) { fired = true; cb(); } };
      img.decode().then(go, go);
      setTimeout(go, 280); // never hold a reveal back for long
    };
    let artSeed = 3;
    const showArt = (kind, fromEl) => {
      const L = makeLayer(st.mapId, timeOf(st.mapId));
      const finish = () => {
        L.style.clipPath = '';
        for (let n = L.previousSibling; n;) { const p = n.previousSibling; n.remove(); n = p; }
      };
      if (!art.firstChild || reduced || kind === 'instant') {
        L.classList.add(art.firstChild ? 'is-fade' : 'is-first');
        art.appendChild(L);
        if (art.childElementCount > 1) setTimeout(finish, 320); else finish();
        return;
      }
      const W = art.clientWidth || 1, H = art.clientHeight || 1;
      const time = timeOf(st.mapId);
      const ink = h('div', { class: `iw-ss__ink is-${kind} is-${time}` });
      const ink2 = kind === 'stage' ? h('div', { class: 'iw-ss__ink is-stage is-b' }) : null;
      const seed = (artSeed += 1);
      ink.style.clipPath = L.style.clipPath = 'inset(0 0 0 100%)';
      if (ink2) ink2.style.clipPath = ink.style.clipPath;
      art.append(...[ink2, ink, L].filter(Boolean));
      restartAnim(frame, kind === 'stage' ? 'is-hit' : 'is-flip');
      whenReady(L._img, () => {
        if (kind === 'time') {
          // day → dusk: the ink edge sweeps right-to-left (the sun sets west); dusk → day the other way
          const edge = sweepEdge(seed), dir = time === 'dusk' ? -1 : 1, D = 0.66;
          tween(D, (k) => { ink.style.clipPath = sweepClip(edge, W, H, easeInOutCubic(k), dir); });
          tween(D, (k) => { L.style.clipPath = sweepClip(edge, W, H, easeInOutCubic(k), dir); }, finish, 0.11);
        } else {
          // new stage: an ink splat thrown from the stage list side bursts open, carrying the new art inside it
          let oy = H * 0.5;
          if (fromEl && fromEl.isConnected) {
            const fr = fromEl.getBoundingClientRect(), ar = art.getBoundingClientRect();
            if (ar.height > 0) oy = clamp(((fr.top + fr.height / 2 - ar.top) / ar.height) * H, H * 0.12, H * 0.88);
          }
          const ox = W * 0.02, R = splatCover(ox, oy, W, H), D = 0.6;
          const grow = (el, s, k) => { el.style.clipPath = splatClip(ox, oy, R * easeOutCubic(k), s); };
          tween(D, (k) => grow(ink2, seed + 7, k));
          tween(D, (k) => grow(ink, seed, k), null, 0.05);
          tween(D, (k) => grow(L, seed + 3, k), finish, 0.12);
        }
      });
    };

    // ---- stage list: tilted tickets with the render, name tape, time badge, select splat
    const tickets = maps.map((m, i) => {
      const imgDay = h('img', { class: 'iw-ticket__img is-day', alt: '', draggable: 'false' });
      const imgDusk = h('img', { class: 'iw-ticket__img is-dusk', alt: '', draggable: 'false' });
      for (const [im, t] of [[imgDay, 'day'], [imgDusk, 'dusk']]) {
        im.addEventListener('error', () => { im.remove(); c.classList.add('is-noart'); }, { once: true });
        im.src = stageArt(m.id, t, true);
      }
      const badge = h('span', { class: 'iw-ticket__time iw-noclick' },
        h('i', { class: 'iw-ticket__sun', html: GLYPHS.sun }), h('i', { class: 'iw-ticket__moon', html: GLYPHS.moon }));
      const c = h('button', { class: 'iw-ticket iw-in iw-in--left', style: { '--tilt': `${[-1.2, 0.9, -0.7, 1.1][i % 4]}deg` } },
        h('span', { class: 'iw-ticket__art' }, h('span', { class: 'iw-ticket__fallback', html: m.thumb || mapThumb(m, i + 2) }), imgDay, imgDusk, h('i', { class: 'iw-ticket__shade' })),
        h('span', { class: 'iw-ticket__ink', html: splatSVG({ seed: 60 + i * 5, cls: 'iw-fa', r: 58, arms: 9, drops: 5 }) }),
        h('span', { class: 'iw-ticket__num' }, String(i + 1).padStart(2, '0')),
        h('span', { class: 'iw-ticket__name' }, m.name),
        badge,
        h('span', { class: 'iw-ticket__check', html: GLYPHS.check }));
      c._mid = m.id;
      c.dataset.cur = 'own';
      this._fx(c, { tilt: 8 });
      this._bind(c, {
        id: 'map-' + m.id,
        accept: (src) => select(m.id, src === 'mouse' ? 'click' : 'lock', c),
        adjust: (d) => { select(m.id, 'nav', c); setTime(m.id, d < 0 ? 'day' : 'dusk', 'key'); },
      });
      badge.addEventListener('click', () => { this._setFocus(c); select(m.id, 'click', c); setTime(m.id, timeOf(m.id) === 'day' ? 'dusk' : 'day', 'mouse'); });
      return c;
    });
    const refreshTicket = (c) => {
      const t = timeOf(c._mid);
      c.classList.toggle('is-dusk', t === 'dusk');
      c.classList.toggle('is-sel', c._mid === st.mapId);
    };
    const listEl = h('div', { class: 'iw-ss__list' }, tickets);

    // ---- match options (bot skill + length)
    const dOpts = Object.values(diffs).map((d) => [d.id, h('span', { class: 'iw-diffopt' }, h('span', { class: 'iw-pips' }, Array.from({ length: 3 }, (_, k) => h('i', { class: k < (DIFF_INFO[d.id]?.pips || 2) ? 'on' : '' }))), d.name)]);
    const dText = h('div', { class: 'iw-setup__desc' });
    const diffSeg = this._seg(dOpts, st.difficulty, (v) => {
      st.difficulty = v; dText.textContent = DIFF_INFO[v]?.text || ''; restartAnim(dText, 'is-in');
      safeCall(() => this.api.setSettings && this.api.setSettings({ difficulty: v })); updateStart();
    });
    dText.textContent = DIFF_INFO[st.difficulty]?.text || '';
    const diffRow = h('div', { class: 'iw-setrow iw-setrow--stack' }, h('div', { class: 'iw-setrow__label' }, h('i', { html: GLYPHS.bot }), 'BOT SKILL'), diffSeg.el);
    this._bind(diffRow, { id: 'difficulty', type: 'row', adjust: diffSeg.adjust, accept: diffSeg.cycle });
    const lOpts = durations.map((d) => [d, durLabel(d)]);
    const lenSeg = this._seg(lOpts, st.duration, (v) => {
      st.duration = v; safeCall(() => this.api.setSettings && this.api.setSettings({ matchLength: v })); updateStart();
    });
    const lenRow = h('div', { class: 'iw-setrow iw-setrow--stack' }, h('div', { class: 'iw-setrow__label' }, h('i', { html: GLYPHS.clock }), 'MATCH LENGTH'), lenSeg.el);
    this._bind(lenRow, { id: 'length', type: 'row', adjust: lenSeg.adjust, accept: lenSeg.cycle });
    const matchPanel = this._panel('iw-ss__match iw-in iw-in--up', diffRow, dText, lenRow);

    // ---- your weapon + your look + START
    const lo = this._loadout();
    const W = this._weapons()[lo.weapon];
    const weaponChip = h('button', { class: 'iw-wchip iw-in' },
      h('span', { class: 'iw-wchip__icon', html: weaponIcon(W.kind || lo.weapon) }),
      h('span', { class: 'iw-wchip__text' }, h('small', null, 'WEAPON'), h('b', null, W.name)),
      h('span', { class: 'iw-wchip__edit' }, h('i', { html: GLYPHS.pencil })));
    this._fx(weaponChip);
    this._bind(weaponChip, { id: 'weapon', accept: () => { this._sfx('ui_click'); this._go('loadout'); } });
    const prof = this._profile();
    const lookAv = h('span', { class: 'iw-lchip__av' }, h('span', { class: 'iw-lchip__blob', html: splatSVG({ seed: 17, cls: 'iw-fa', r: 62, arms: 8, drops: 0 }) }), h('span', { class: 'iw-lchip__squid', html: SQUID }));
    const lookChip = h('button', { class: 'iw-wchip iw-lchip iw-in' }, lookAv,
      h('span', { class: 'iw-wchip__text' }, h('small', null, 'SQUIDKID'), h('b', null, prof.name)),
      h('span', { class: 'iw-wchip__edit' }, h('i', { html: GLYPHS.hanger })));
    this._fx(lookChip);
    this._bind(lookChip, { id: 'look', accept: () => { this._sfx('ui_click'); this._go('locker'); } });
    this._portraitInto(lookAv, { kind: 'head', size: 128 });

    const startSub = h('span');
    const start = this._btn({ id: 'start', label: 'START!', icon: GLYPHS.play, cls: 'iw-btn--start iw-in iw-in--pop', sound: 'ui_confirm', accept: () => this._startMatch() });
    start.querySelector('.iw-btn__text').appendChild(h('span', { class: 'iw-btn__sub' }, startSub));
    start.append(h('span', { class: 'iw-start__charge' }, h('i')), h('span', { class: 'iw-start__ready' }, h('i', { html: GLYPHS.check }), 'READY'), h('span', { class: 'iw-start__chev' }, h('i'), h('i'), h('i')));
    const updateStart = () => {
      const m = byId(st.mapId);
      startSub.textContent = `${m ? m.name : ''} · ${TIME_INFO[timeOf(st.mapId)].label} · ${diffs[st.difficulty].name} · ${durLabel(st.duration)}`;
    };

    // ---- state changes
    const renderTime = (anim) => {
      const t = timeOf(st.mapId);
      tgl.dataset.time = t; hero.dataset.time = t; el.dataset.time = t;
      optDay.classList.toggle('is-on', t === 'day'); optDusk.classList.toggle('is-on', t === 'dusk');
      timeText.textContent = TIME_INFO[t].text;
      if (anim) { restartAnim(tgl, 'is-flip'); restartAnim(timeText, 'is-in'); }
      updateStart();
    };
    const renderStage = (anim) => {
      const m = byId(st.mapId), i = maps.indexOf(m);
      nameEl.innerHTML = m.name.split(' ').map((w, wi) => `<span class="iw-ss__word">${[...w].map((ch, k) => `<span style="--i:${wi * 4 + k}">${esc(ch)}</span>`).join('')}</span>`).join(' ');
      blurbEl.textContent = m.blurb || '';
      counter.innerHTML = `STAGE <b>${String(i + 1).padStart(2, '0')}</b><em>/ ${String(maps.length).padStart(2, '0')}</em>`;
      layoutMap.innerHTML = m.thumb || mapThumb(m, i + 2);
      if (anim) { restartAnim(caption, 'is-in'); restartAnim(layoutEl, 'is-in'); restartAnim(counter, 'is-in'); }
      renderTime(false);
    };
    const lockIn = () => {
      this._sfx('ui_confirm');
      restartAnim(start, 'is-recharge');
      this._moveFocus(start, 'right');
    };
    const select = (id, how, fromEl) => {
      const t = tickets.find((x) => x._mid === id);
      if (st.mapId === id) {
        if (how === 'lock') lockIn();
        else if (how === 'click') { this._sfx('ui_click'); if (t) restartAnim(t, 'is-pick'); }
        return;
      }
      st.mapId = id;
      this._setSetting('lastStage', id);
      tickets.forEach(refreshTicket);
      if (t) { restartAnim(t, 'is-pick'); this._burstAt(t.querySelector('.iw-ticket__num'), { count: 9, dist: 4, size: 0.7 }); }
      this._sfx('ui_toggle'); this._sfx('splat_small', 0.06);
      renderStage(true);
      showArt('stage', fromEl || t);
      setBg();
      restartAnim(start, 'is-recharge');
      if (how === 'lock') lockIn();
    };
    const setTime = (id, time, src) => {
      if (timeOf(id) === time) {
        if (src === 'key' || src === 'tab') { this._sfx('ui_error', 0.15); restartAnim(tgl, time === 'day' ? 'is-edge-l' : 'is-edge-r'); }
        return false;
      }
      st.times[id] = time;
      this._setSetting('stageTimes', { ...st.times });
      this._sfx('ui_toggle'); this._sfx(time === 'dusk' ? 'squid_in' : 'squid_out', 0.08);
      const t = tickets.find((x) => x._mid === id);
      if (t) { refreshTicket(t); restartAnim(t, 'is-timeflip'); }
      if (id === st.mapId) { renderTime(true); showArt('time'); setBg(); }
      return true;
    };
    this._bind(tgl, { id: 'time', type: 'row', accept: () => setTime(st.mapId, timeOf(st.mapId) === 'day' ? 'dusk' : 'day', 'toggle'), adjust: (d) => setTime(st.mapId, d < 0 ? 'day' : 'dusk', 'key') });
    this._fx(tgl);
    optDay.addEventListener('click', () => { this._setFocus(tgl); setTime(st.mapId, 'day', 'mouse'); });
    optDusk.addEventListener('click', () => { this._setFocus(tgl); setTime(st.mapId, 'dusk', 'mouse'); });

    const el = h('div', { class: 'iw-screen iw-setup iw-ss' },
      bg, h('div', { class: 'iw-ss__scrim' }),
      this._header('TURF WAR', { sub: 'Pick a stage and the time of day · 4 v 4 against bots' }),
      h('div', { class: 'iw-ss__left' }, h('div', { class: 'iw-seclabel iw-in' }, h('i', { html: GLYPHS.map }), 'STAGES'), listEl, matchPanel),
      hero,
      h('div', { class: 'iw-ss__foot' }, weaponChip, lookChip, start),
      this._prompts([[['↑', '↓'], 'DPad', 'Stage'], [['←', '→'], null, 'Day · Dusk'], ['Enter', 'A', 'Select'], ['Esc', 'B', 'Back']]));
    el.querySelector('.iw-prompts').children[1].querySelector('.iw-padg').innerHTML = padGlyph('LB') + padGlyph('RB');

    // explicit focus graph (rows with ←/→ adjust would otherwise trap the pad in a column)
    const selTicket = () => tickets.find((x) => x._mid === st.mapId) || tickets[0];
    const graph = new Map();
    tickets.forEach((t, i) => graph.set(t, { up: tickets[i - 1] || null, down: tickets[i + 1] || diffRow }));
    graph.set(diffRow, { up: selTicket, down: lenRow });
    graph.set(lenRow, { up: diffRow, down: start });
    graph.set(tgl, { up: null, down: start });
    graph.set(weaponChip, { up: tgl, down: null, left: lenRow, right: lookChip });
    graph.set(lookChip, { up: tgl, down: null, left: weaponChip, right: start });
    graph.set(start, { up: tgl, down: null, left: lookChip, right: null });

    tickets.forEach(refreshTicket);
    renderStage(false);
    showArt('instant');
    setBg();
    return {
      el, initial: selTicket(),
      onFocus: (f) => { if (f._mid && this._navFocus) select(f._mid, 'nav', f); },
      onNav: (dir) => {
        if (dir === 'tab_prev' || dir === 'tab_next') { setTime(st.mapId, dir === 'tab_prev' ? 'day' : 'dusk', 'tab'); return true; }
        return this._graphNav(graph, dir);
      },
      tick: (dt) => {
        for (let i = tweens.length - 1; i >= 0; i--) {
          const o = tweens[i];
          o.t += dt;
          if (o.t < 0) continue;
          const k = clamp(o.t / o.dur);
          safeCall(o.step, k);
          if (k >= 1) { tweens.splice(i, 1); if (o.done) safeCall(o.done); }
        }
      },
      destroy: () => { tweens.length = 0; },
    };
  }

  _startMatch() {
    if (this._starting) return;
    this._starting = true;
    const st = this._setup;
    const time = this._stageTime(st.mapId);
    const cfg = { mapId: st.mapId, time, difficulty: st.difficulty, duration: st.duration };
    safeCall(() => this.api.setSettings && this.api.setSettings({ difficulty: st.difficulty, matchLength: st.duration, lastStage: st.mapId, stageTimes: { ...(st.times || {}) } }));
    if (this._scr) {
      this._scr.el.classList.add('is-launch');
      const b = this._scr.el.querySelector('.iw-btn--start');
      this._burstAt(b, { count: 18, dist: 11, size: 1.4, ring: true });
      this._burstAt(this._scr.el.querySelector('.iw-ss__frame'), { count: 14, dist: 16, size: 2.2 });
      this._sfx('splat_big');
    }
    this._runWipe(() => {
      this._starting = false;
      safeCall(() => this.api.startMatch && this.api.startMatch(cfg));
      if (this.current === 'setup') this.show(null, { instantLeave: true });
    });
  }

  /** Put a live 3D portrait of the player's squidkid into `host` (replacing its fallback squid glyph) when the
   *  showcase can render one (the UI lab can't → the glyph stays). */
  _portraitInto(host, { kind = 'head', size = 128, style = null } = {}) {
    const sc = G.game && G.game.showcase;
    if (!sc || !sc.portrait) return;
    const look = style || this._style();
    const [a] = this._accent();
    safeCall(() => sc.portrait({ style: look, color: a, kind, size, weapon: this._loadout().weapon }, (cv) => {
      if (!cv || !host.isConnected) return;
      const img = h('span', { class: 'iw-portrait' });
      img.appendChild(cv);
      const old = host.querySelector('.iw-portrait');
      if (old) old.remove();
      host.appendChild(img);
      host.classList.add('has-portrait');
    }));
  }

  /** The player's look, resolved against the live catalog exactly like the in-match Character does (fields never
   *  saved derive from the name hash, so the locker shows the same kid you play as). */
  _style() {
    const p = this._profile();
    const raw = p.style && typeof p.style === 'object' ? p.style : (this._styleCache || {});
    try { return LOOK.resolveStyle({ ...raw }, fnv(p.name || 'Player')); } catch (e) { return { ...raw }; }
  }
  _saveStyle(style) {
    const clean = { ...style };
    this._styleCache = clean;
    if (this.api.setProfileStyle) { safeCall(() => this.api.setProfileStyle(clean)); return; }
    // until the engine exposes api.setProfileStyle: the same localStorage record main.js saves the profile to
    const g = G.game;
    if (g && g.profile) { g.profile.style = clean; try { localStorage.setItem('inkwave.profile', JSON.stringify(g.profile)); } catch (e) { /* private mode */ } }
  }

  // ================================================================ SCREEN: locker (choose + customise your squidkid)
  /** Catalog slots the locker can edit, built from the live tables in character-style.js (never hard-coded counts). */
  _lockerSlots() {
    const L = LOOK;
    const n = (x) => (Array.isArray(x) ? x.length : Math.max(0, x | 0));
    return {
      hair: { key: 'hair', title: 'TENTACLE STYLE', count: n(L.HAIR_STYLES), names: L.HAIR_STYLE_NAMES || L.HAIR_NAMES, art: 'portrait', kind: 'head', cause: 'hair' },
      hat: { key: 'hat', title: 'HEADGEAR', count: n(L.HATS), names: L.HAT_NAMES, art: 'portrait', kind: 'head', cause: 'hair' },
      eyes: { key: 'eyes', title: 'EYES', count: n(L.IRIS), names: L.IRIS_NAMES, art: 'iris', cause: 'eyes' },
      brows: { key: 'brows', title: 'BROWS', count: n(L.BROWS), names: L.BROW_NAMES, art: 'portrait', kind: 'face', cause: 'eyes' },
      skin: { key: 'skin', title: 'SKIN TONE', count: n(L.SKIN_TONES), names: L.SKIN_NAMES, art: 'skin', cause: 'skin' },
      outfit: { key: 'outfit', title: 'OUTFIT', count: n(L.OUTFITS), names: L.OUTFIT_NAMES, art: 'portrait', kind: 'body', cause: 'outfit' },
    };
  }

  /** Squidkid name field (Enter/click to edit, Esc cancels, blank names are refused). */
  _nameRow() {
    const prof = this._profile();
    const input = h('input', { class: 'iw-name__input', type: 'text', maxlength: '16', spellcheck: 'false', autocomplete: 'off', value: prof.name });
    input.dataset.orig = prof.name;
    const nameRow = h('div', { class: 'iw-name iw-in' },
      h('span', { class: 'iw-name__label' }, 'NAME'),
      h('span', { class: 'iw-name__field' }, input, h('i', { class: 'iw-name__pen', html: GLYPHS.pencil })));
    const commit = () => {
      nameRow.classList.remove('is-editing');
      if (input.dataset.cancel) { delete input.dataset.cancel; input.value = input.dataset.orig; this._sfx('ui_back'); return; }
      const v = input.value.replace(/\s+/g, ' ').trim().slice(0, 16);
      if (!v) { input.value = input.dataset.orig; this._sfx('ui_error'); restartAnim(nameRow, 'is-shake'); return; }
      input.value = v;
      if (v !== input.dataset.orig) {
        input.dataset.orig = v; safeCall(() => this.api.setProfileName && this.api.setProfileName(v)); this._sfx('ui_confirm'); restartAnim(nameRow, 'is-saved');
        if (nameRow._onChange) nameRow._onChange(v);
      }
    };
    input.addEventListener('blur', commit);
    input.addEventListener('focus', () => { nameRow.classList.add('is-editing'); input.dataset.orig = input.value; setTimeout(() => input.select(), 0); });
    input.addEventListener('keydown', (e) => {
      // commit/cancel here so it works even if the engine forwards keys late; keep them away from the menu nav
      if (e.key === 'Enter' || e.key === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); input.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.value = input.dataset.orig; input.dataset.cancel = '1'; input.blur(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); input.blur(); this.setInputMode('kbm'); this._nav(e.key === 'ArrowUp' ? 'up' : 'down'); }
    });
    this._bind(nameRow, { id: 'name', accept: () => { this._sfx('ui_click'); input.focus(); } });
    input.addEventListener('pointerdown', () => this._setFocus(nameRow));
    nameRow._input = input;
    return nameRow;
  }

  _scr_locker() {
    const slots = this._lockerSlots();
    const presets = (Array.isArray(LOOK.PRESETS) ? LOOK.PRESETS : []).filter((p) => p && p.style);
    const resolve = (st) => { try { return LOOK.resolveStyle({ ...st }, 0); } catch (e) { return { ...st }; } };
    const same = (a, b) => { for (const k in a) if (a[k] !== b[k]) return false; for (const k in b) if (a[k] !== b[k]) return false; return true; };
    let style = this._style();
    const tabs = LOCKER_TABS.map((t) => ({ ...t, sections: t.sections.filter((k) => (k === '_presets' ? presets.length : slots[k] && slots[k].count > 0)) })).filter((t) => t.sections.length);
    let tabIdx = clamp(this._lockerTab || 0, 0, tabs.length - 1);
    const sc = G.game && G.game.showcase;
    const teamColor = () => (G.teamColors && G.teamColors[0]) || this._accent()[0];
    const reduced = prefersReducedMotion();

    const nameRow = this._nameRow();

    // ---- tabs
    const tabsEl = h('div', { class: 'iw-tabs iw-ltabs' });
    const pill = h('span', { class: 'iw-tabs__hl' });
    const tabBtns = tabs.map((t, i) => {
      const b = h('button', { class: 'iw-tab' }, h('i', { html: GLYPHS[t.icon] || GLYPHS.star }), h('span', null, t.label));
      this._bind(b, { id: 'ltab-' + t.id, type: 'tab', accept: () => selectTab(i, true), adjust: (d) => { if (selectTab(i + d, true)) this._setFocus(tabBtns[tabIdx]); } });
      return b;
    });
    tabsEl.append(h('span', { class: 'iw-tabs__hint' }, this._hint('Q', 'LB')), pill, ...tabBtns, h('span', { class: 'iw-tabs__hint' }, this._hint('E', 'RB')));

    // ---- grid + info
    const gridWrap = h('div', { class: 'iw-lgrids' });
    const infoSub = h('small'), infoName = h('b'), infoText = h('span', { class: 'iw-linfo__text' });
    const infoEq = h('em', { class: 'iw-linfo__eq' }, h('i', { html: GLYPHS.check }), 'WEARING');
    const info = h('div', { class: 'iw-linfo' }, h('div', { class: 'iw-linfo__head' }, h('div', { class: 'iw-linfo__names' }, infoSub, infoName), infoEq), infoText);
    const panel = this._panel('iw-lpanel iw-in', gridWrap, info);

    // ---- footer: shuffle + done
    const shuffle = this._btn({ id: 'shuffle', label: 'SHUFFLE', icon: GLYPHS.dice, cls: 'iw-btn--ghost iw-lbtn iw-lbtn--dice', sound: null, accept: () => randomise() });
    shuffle.appendChild(h('span', { class: 'iw-lbtn__key' }, this._hint('R', null)));
    const done = this._btn({ id: 'done', label: 'DONE', icon: GLYPHS.check, cls: 'iw-btn--primary iw-lbtn', sound: 'ui_confirm', accept: () => this._back() });
    const saved = h('span', { class: 'iw-lsaved' }, h('i', { html: GLYPHS.check }), h('span', null, 'Saves automatically'));
    const foot = h('div', { class: 'iw-lfoot iw-in iw-in--up' }, shuffle, saved, done);
    const body = h('div', { class: 'iw-locker__body' }, tabsEl, panel, foot);

    // ---- right side: the kid's name tag (editable) above the pedestal, drag hint below, the current look as chips
    const spinHint = h('div', { class: 'iw-lspin iw-in iw-in--up' }, h('i', { html: GLYPHS.rotate }),
      h('span', { class: 'iw-kbm' }, 'DRAG TO SPIN'), h('span', { class: 'iw-padg', html: padGlyph('RS') + '<b>SPIN</b>' }));
    const sheet = h('div', { class: 'iw-lsheet' });
    const tag = h('div', { class: 'iw-ltag iw-in iw-in--down' }, h('span', { class: 'iw-ltag__blob', html: splatSVG({ seed: 44, cls: 'iw-fa', r: 60, arms: 9, drops: 3 }) }), nameRow, sheet);

    const el = h('div', { class: 'iw-screen iw-locker' },
      h('div', { class: 'iw-scrim-left' }),
      this._header('LOCKER', { sub: 'Choose your squidkid, then make it yours' }),
      body, tag, spinHint,
      this._prompts([['Enter', 'A', 'Wear'], [['Q', 'E'], null, 'Tabs'], ['R', null, 'Shuffle'], ['Esc', 'B', 'Done']]));
    el.querySelector('.iw-prompts').children[1].querySelector('.iw-padg').innerHTML = padGlyph('LB') + padGlyph('RB');

    // ---- tiles
    let tiles = [];
    let gen = 0;
    const handles = [];
    const tileStyle = (t) => (t._sec.key === '_presets' ? resolve(presets[t._i].style) : { ...style, [t._sec.key]: t._i });
    const isOn = (t) => (t._sec.key === '_presets' ? same(resolve(presets[t._i].style), style) : style[t._sec.key] === t._i);
    const optName = (sec, i) => (sec.key === '_presets' ? presets[i].name : (sec.names && sec.names[i]) || `${sec.title[0]}${sec.title.slice(1).toLowerCase()} ${i + 1}`);
    const fallbackArt = (sec, i) => {
      if (sec.art === 'skin') return skinSwatch(LOOK.SKIN_TONES[i]);
      if (sec.art === 'iris') return irisSwatch(LOOK.IRIS[i]);
      if (sec.key === 'outfit') return outfitIcon(LOOK.OUTFITS[i]);
      return `<span class="iw-ltile__squid">${SQUID}</span>`;
    };
    const makeTile = (sec, i, n) => {
      const t = h('button', { class: `iw-ltile iw-ltile--${sec.art === 'portrait' ? sec.kind : sec.art} iw-rowin`, style: { '--i': n, '--tilt': `${[-1.4, 1, -0.6, 1.3, -1, 0.7][n % 6]}deg` } },
        h('span', { class: 'iw-ltile__blob', html: splatSVG({ seed: 90 + n * 7, cls: 'iw-fa', r: 58, arms: 8, drops: 0 }) }),
        h('span', { class: 'iw-ltile__art', html: fallbackArt(sec, i) }),
        sec.art === 'portrait' || sec.key === '_presets' ? h('span', { class: 'iw-ltile__name' }, optName(sec, i)) : null,
        h('span', { class: 'iw-ltile__eq', html: GLYPHS.check }));
      t._sec = sec; t._i = i;
      t.dataset.cur = 'own';
      this._fx(t, { tilt: 12 });
      this._bind(t, { id: `lt-${sec.key}-${i}`, accept: () => wear(t) });
      return t;
    };
    // columns per section so every tab fits the fixed grid area: presets 5 · heads 8 · bodies 6 · swatches 10
    const cols = (sec) => (sec.key === '_presets' ? 5 : sec.art === 'portrait' ? (sec.kind === 'body' ? 6 : 8) : 10);
    const buildTab = (dirSign) => {
      for (const hd of handles.splice(0)) hd && hd.cancel && hd.cancel();
      gridWrap.innerHTML = '';
      tiles = [];
      const tab = tabs[tabIdx];
      for (const k of tab.sections) {
        const sec = k === '_presets' ? { key: '_presets', title: 'CHOOSE YOUR SQUIDKID', count: presets.length, art: 'portrait', kind: 'bust', cause: 'preset' } : slots[k];
        const grid = h('div', { class: `iw-lgrid iw-lgrid--${sec.art === 'portrait' ? sec.kind : 'swatch'}`, style: { '--cols': cols(sec) } });
        for (let i = 0; i < sec.count; i++) { const t = makeTile(sec, i, tiles.length); tiles.push(t); grid.appendChild(t); }
        gridWrap.appendChild(h('section', { class: 'iw-lsec', style: { '--dir': dirSign } },
          h('div', { class: 'iw-lsec__title' }, h('span', null, sec.title), h('small', null, `${sec.count} ${sec.key === '_presets' ? 'LOOKS' : 'OPTIONS'}`)), grid));
      }
      refresh();
      requestPortraits();
    };
    const refresh = () => {
      for (const t of tiles) t.classList.toggle('is-on', isOn(t));
      if (this._focus && this._focus._sec) showInfo(this._focus);
      renderSheet();
    };
    // live 3D portraits: every tile shows *your* kid wearing that option (presets show the preset look)
    const requestPortraits = () => {
      if (!sc || !sc.portrait) return;
      const g = ++gen;
      for (const hd of handles.splice(0)) hd && hd.cancel && hd.cancel();
      const col = teamColor();
      for (const t of tiles) {
        const sec = t._sec;
        if (sec.art !== 'portrait') continue;
        const hd = safeCall(() => sc.portrait({ style: tileStyle(t), color: col, kind: sec.kind, size: sec.kind === 'body' ? 224 : 176, weapon: this._loadout().weapon }, (cv) => {
          if (!cv || g !== gen || !t.isConnected) return;
          const art = t.querySelector('.iw-ltile__art');
          const wrap = h('span', { class: 'iw-ltile__pic' + (t.classList.contains('has-pic') ? ' is-swap' : '') });
          wrap.appendChild(cv);
          const old = art.querySelector('.iw-ltile__pic');
          art.appendChild(wrap);
          t.classList.add('has-pic');
          if (old) setTimeout(() => old.remove(), 260);
        }));
        handles.push(hd);
      }
    };
    const showInfo = (t) => {
      const sec = t._sec, i = t._i;
      infoSub.textContent = sec.key === '_presets' ? 'SQUIDKID' : sec.title;
      infoName.textContent = optName(sec, i);
      infoText.textContent = sec.key === '_presets' ? (presets[i].blurb || '') : `${i + 1} of ${sec.count}`;
      info.classList.toggle('is-on', isOn(t));
      restartAnim(info, 'is-swap');
    };
    // the current look as a sticker sheet (one chip per slot)
    const renderSheet = () => {
      const rows = [['hair', 'HAIR'], ['hat', 'HAT'], ['eyes', 'EYES'], ['brows', 'BROWS'], ['skin', 'SKIN'], ['outfit', 'OUTFIT']].filter(([k]) => slots[k] && slots[k].count > 0);
      sheet.innerHTML = '';
      for (const [k, label] of rows) {
        const sec = slots[k], i = style[k] | 0;
        const dot = sec.art === 'skin' ? `<i class="iw-lsheet__dot" style="background:${LOOK.SKIN_TONES[i]}"></i>`
          : sec.art === 'iris' ? `<i class="iw-lsheet__dot" style="background:linear-gradient(${LOOK.IRIS[i][0]},${LOOK.IRIS[i][1]})"></i>`
            : k === 'outfit' ? `<i class="iw-lsheet__dot" style="background:linear-gradient(135deg,${LOOK.OUTFITS[i].shirt} 50%,${LOOK.OUTFITS[i].shorts} 50%)"></i>` : '';
        sheet.appendChild(h('div', { class: 'iw-lsheet__row', html: `<small>${label}</small>${dot}<b>${esc(optName(sec, i))}</b>` }));
      }
    };

    // ---- actions
    const apply = (next, cause, fromEl) => {
      next = resolve(next);
      if (same(next, style)) { this._sfx('ui_click'); if (fromEl) restartAnim(fromEl, 'is-pick'); return false; }
      style = next;
      this._saveStyle(style);
      if (sc && sc.setStyle) safeCall(() => sc.setStyle(style, cause));
      this._sfx('ui_confirm'); this._sfx('splat_small', 0.06);
      if (fromEl) { restartAnim(fromEl, 'is-pick'); this._burstAt(fromEl, { count: 10, dist: 6, size: 0.9 }); }
      restartAnim(saved, 'is-on');
      refresh();
      requestPortraits();
      return true;
    };
    const wear = (t) => {
      if (t._sec.key === '_presets') apply(presets[t._i].style, 'preset', t);
      else apply({ ...style, [t._sec.key]: t._i }, t._sec.cause, t);
    };
    const randomise = () => {
      const roll = LOOK.randomStyle ? LOOK.randomStyle(Math.random) : Object.fromEntries(Object.values(slots).filter((s) => s.count).map((s) => [s.key, (Math.random() * s.count) | 0]));
      this._sfx('ui_toggle');
      restartAnim(shuffle, 'is-roll');
      if (!apply(roll, 'random', null)) apply(LOOK.randomStyle ? LOOK.randomStyle(Math.random) : roll, 'random', null);
      if (!reduced) this._burstAt(shuffle.querySelector('.iw-btn__icon'), { count: 12, dist: 7, size: 1 });
    };

    // ---- tab switching (keeps the equipped tile under the cursor when switching from the grid)
    const movePill = (instant) => {
      const b = tabBtns[tabIdx];
      if (!b || !b.offsetWidth) return;
      if (instant) pill.classList.add('is-instant');
      pill.style.transform = `translateX(${b.offsetLeft}px)`;
      pill.style.width = `${b.offsetWidth}px`;
      if (instant) { void pill.offsetWidth; pill.classList.remove('is-instant'); } // eslint-disable-line no-void
    };
    const selectTab = (i, sound) => {
      if (i < 0 || i >= tabs.length) { if (sound) this._sfx('ui_error', 0.15); return false; }
      if (i === tabIdx && tiles.length) return false;
      const dirSign = i >= tabIdx ? 1 : -1;
      tabIdx = i; this._lockerTab = i;
      tabBtns.forEach((b, k) => b.classList.toggle('is-sel', k === i));
      restartAnim(pill, 'is-move');
      movePill(false);
      if (sound) this._sfx('ui_toggle');
      buildTab(dirSign);
      return true;
    };
    tabBtns.forEach((b, k) => b.classList.toggle('is-sel', k === tabIdx));
    buildTab(1);
    const equippedTile = () => tiles.find((t) => t.classList.contains('is-on')) || tiles[0];

    return {
      el,
      initial: () => equippedTile(),
      afterMount: () => {
        movePill(true);
        if (sc && sc.showLocker) safeCall(() => sc.showLocker(style, teamColor(), this._loadout().weapon));
      },
      onFocus: (f) => { if (f._sec) showInfo(f); },
      onNav: (dir) => {
        if (dir === 'tab_prev' || dir === 'tab_next') {
          const onTab = this._focus && this._focus.dataset.nav === 'tab';
          if (selectTab(tabIdx + (dir === 'tab_next' ? 1 : -1), true)) this._setFocus(onTab ? tabBtns[tabIdx] : equippedTile(), { snap: false });
          else restartAnim(tabsEl, dir === 'tab_next' ? 'is-edge-r' : 'is-edge-l');
          return true;
        }
        if (dir === 'alt') { randomise(); return true; }
        return false;
      },
      destroy: () => {
        gen++;
        for (const hd of handles.splice(0)) hd && hd.cancel && hd.cancel();
        const inp = nameRow._input;
        if (document.activeElement === inp) inp.blur();
        // the loadout keeps the kid on the pedestal (camera glides over); anything else sends it back into the ink
        if (sc && this.current !== 'loadout') safeCall(() => sc.hide());
      },
    };
  }

  // ================================================================ SCREEN: loadout (weapon select)
  _scr_loadout() {
    const Ws = this._weapons();
    const order = this._weaponOrder().filter((id) => Ws[id]);
    let equipped = this._loadout().weapon;
    let shown = equipped;
    const specials = this._specials();
    const subs = this.api.subs || SUB;
    const classOf = (w) => w.class || KIND_LABEL[w.kind] || (w.kind ? w.kind[0].toUpperCase() + w.kind.slice(1) : '');
    const subOf = (w) => (w.sub && subs[w.sub]) || this._sub();
    // "NEW" stickers for weapons the player hasn't looked at yet (the original four count as seen)
    const s0 = this._settings();
    const seen = new Set(Array.isArray(s0.seenWeapons) ? s0.seenWeapons : ['shooter', 'roller', 'charger', 'blaster']);
    const markSeen = (id) => { if (seen.has(id)) return; seen.add(id); this._setSetting('seenWeapons', [...seen]); };

    // ---- weapon cards (grid scales 4 → 9+: 4 columns up to 8, then 5)
    const n = order.length;
    const cols = n <= 4 ? Math.max(1, n) : n <= 8 ? 4 : 5;
    const compact = n > cols;
    const cards = order.map((id, i) => {
      const w = Ws[id];
      const isNew = !seen.has(id);
      const c = h('button', { class: 'iw-wcard iw-in iw-in--pop' + (id === equipped ? ' is-equipped' : '') + (isNew ? ' is-new' : ''), style: { '--tilt': `${[-1.5, 1, -0.8, 1.4, -1.1][i % 5]}deg` } },
        h('span', { class: 'iw-wcard__ink' }),
        h('span', { class: 'iw-wcard__blob', html: splatSVG({ seed: 40 + i * 3, cls: 'iw-fa', r: 58, arms: 8, drops: 0 }) }),
        h('span', { class: 'iw-wcard__icon', html: weaponIcon(w.kind || id) }),
        h('span', { class: 'iw-wcard__name' }, w.name),
        h('span', { class: 'iw-wcard__kind' }, classOf(w)),
        h('span', { class: 'iw-wcard__eq', html: GLYPHS.check }),
        isNew ? h('span', { class: 'iw-wcard__new' }, 'NEW!') : null,
        h('span', { class: 'iw-wcard__glare' }));
      c.dataset.cur = 'own';
      this._fx(c, { tilt: 14 });
      this._bind(c, { id: 'w-' + id, accept: () => {
        if (equipped === id) { this._sfx('ui_click'); restartAnim(c, 'is-pick'); return; }
        equipped = id;
        safeCall(() => this.api.setLoadout && this.api.setLoadout({ weapon: id }));
        this._sfx('ui_confirm'); this._sfx('splat_small');
        cards.forEach((x) => x.classList.toggle('is-equipped', x === c));
        restartAnim(c, 'is-pick');
        this._burstAt(c, { count: 14, dist: 8, size: 1.1 });
        render(id);
      } });
      c._wid = id;
      return c;
    });

    // ---- detail panel
    const kind = h('span', { class: 'iw-wd__kind' });
    const nm = h('span', { class: 'iw-wd__name iw-display' });
    const eqBadge = h('span', { class: 'iw-wd__eq' }, h('i', { html: GLYPHS.check }), 'EQUIPPED');
    const cmpBadge = h('span', { class: 'iw-wd__cmp' }, h('i', { class: 'iw-wd__cmpdot' }), 'vs ', h('b'));
    const blurb = h('p', { class: 'iw-wd__blurb' });
    const statKeys = [...STAT_LABELS.map(([k]) => k), ...Object.keys((Ws[order[0]] && Ws[order[0]].stats) || {}).filter((k) => !STAT_LABELS.some(([x]) => x === k))].slice(0, 6);
    const statEls = statKeys.map((k, i) => {
      const label = (STAT_LABELS.find(([x]) => x === k) || [k, k[0].toUpperCase() + k.slice(1)])[1];
      const bar = h('span', { class: 'iw-stat__bar' }, h('i', { class: 'iw-stat__ghost' }), h('i', { class: 'iw-stat__fill' }), h('i', { class: 'iw-stat__ticks' }));
      const num = h('b', { class: 'iw-stat__num' }, '0');
      const delta = h('em', { class: 'iw-stat__delta' });
      const row = h('div', { class: 'iw-stat', style: { '--i': i } }, h('span', { class: 'iw-stat__label' }, h('i', { html: STAT_ICONS[k] || GLYPHS.star }), label), bar, num, delta);
      return { k, row, bar, num, delta, cur: 0, target: 0, shownInt: -1, delay: 0.25 + i * 0.07 };
    });
    const subIcon = h('span', { class: 'iw-kit__icon' }), subName = h('b'), subText = h('span');
    const subChip = h('div', { class: 'iw-kit' }, subIcon, h('div', null, h('small', null, 'SUB WEAPON'), subName, subText));
    const spIcon = h('span', { class: 'iw-kit__icon is-sp' });
    const spName = h('b'); const spBlurb = h('span'); const spCost = h('em', { class: 'iw-kit__cost' });
    const spChip = h('div', { class: 'iw-kit' }, spIcon, h('div', null, h('small', null, 'SPECIAL'), h('div', { class: 'iw-kit__row' }, spName, spCost), spBlurb));
    const detail = this._panel('iw-wd iw-in iw-in--up',
      h('div', { class: 'iw-wd__head' }, h('div', { class: 'iw-wd__title' }, kind, nm), h('div', { class: 'iw-wd__badges' }, cmpBadge, eqBadge)),
      blurb,
      h('div', { class: 'iw-wd__stats' }, statEls.map((s) => s.row)),
      h('div', { class: 'iw-wd__kits' }, subChip, spChip));

    let entered = false;
    const render = (id) => {
      const first = shown === id && !entered;
      shown = id;
      const w = Ws[id], eqW = Ws[equipped];
      kind.textContent = classOf(w).toUpperCase();
      nm.textContent = w.name;
      blurb.textContent = w.blurb || '';
      detail.classList.toggle('is-equipped', id === equipped);
      detail.classList.toggle('is-compare', id !== equipped);
      cmpBadge.lastChild.textContent = eqW.name;
      for (const s of statEls) {
        const v = clamp((w.stats && w.stats[s.k]) || 0);
        const g = clamp((eqW.stats && eqW.stats[s.k]) || 0);
        s.target = v * 100;
        if (entered) s.bar.style.setProperty('--v', v.toFixed(3));
        s.bar.style.setProperty('--g', (id === equipped ? 0 : g).toFixed(3));
        const up = id !== equipped && v > g + 0.01, down = id !== equipped && v < g - 0.01;
        s.bar.classList.toggle('is-up', up); s.bar.classList.toggle('is-down', down);
        s.num.classList.toggle('is-up', up); s.num.classList.toggle('is-down', down);
        const d = Math.round((v - g) * 100);
        s.delta.textContent = up ? `+${d}` : down ? `${d}` : '';
        s.delta.className = 'iw-stat__delta' + (up ? ' is-up' : down ? ' is-down' : '');
      }
      const sub = subOf(w);
      subIcon.innerHTML = SUB_ICONS[sub.id] || SUB_ICONS.bomb;
      subName.textContent = sub.name;
      subText.textContent = `Costs ${Math.round(sub.inkCost || 70)}% of your ink tank. Hold to aim, release to throw.`;
      const sp = specials[w.special] || Object.values(specials)[0];
      spIcon.innerHTML = specialIcon(sp.id);
      spName.textContent = sp.name;
      spBlurb.textContent = sp.blurb || '';
      spCost.textContent = w.specialCost ? `${Math.round(w.specialCost)}p` : '';
      spCost.title = 'Turf points to fill the special gauge';
      if (!first) restartAnim(detail, 'is-swap');
      markSeen(id);
    };
    render(equipped);

    // ---- your squidkid (→ locker)
    const prof = this._profile();
    const lookAv = h('span', { class: 'iw-lchip__av' }, h('span', { class: 'iw-lchip__blob', html: splatSVG({ seed: 17, cls: 'iw-fa', r: 62, arms: 8, drops: 0 }) }), h('span', { class: 'iw-lchip__squid', html: SQUID }));
    const lookChip = h('button', { class: 'iw-wchip iw-lchip iw-lchip--sm iw-in iw-in--down' }, lookAv,
      h('span', { class: 'iw-wchip__text' }, h('small', null, 'SQUIDKID'), h('b', null, prof.name)),
      h('span', { class: 'iw-wchip__edit' }, h('i', { html: GLYPHS.hanger }), 'LOCKER'));
    this._fx(lookChip);
    this._bind(lookChip, { id: 'look', accept: () => { this._sfx('ui_click'); this._go('locker'); } });
    this._portraitInto(lookAv, { kind: 'head', size: 128 });

    const grid = h('div', { class: 'iw-wgrid' + (compact ? ' is-compact' : ''), style: { '--cols': cols } }, cards);
    const el = h('div', { class: 'iw-screen iw-loadout' },
      h('div', { class: 'iw-scrim-left' }),
      this._header('LOADOUT', { sub: `${n} weapons · every one comes with a sub and a special` }),
      h('div', { class: 'iw-loadout__body' },
        h('div', { class: 'iw-seclabel iw-in' }, h('i', { html: WEAPON_ICONS.shooter }), 'WEAPON', h('span', { class: 'iw-seclabel__count' }, `${order.indexOf(equipped) + 1} / ${n}`)),
        grid,
        detail),
      h('div', { class: 'iw-loadout__look' }, lookChip),
      this._prompts([['Enter', 'A', 'Equip'], [['←', '→'], 'DPad', 'Browse'], ['Esc', 'B', 'Back']]));
    const countEl = el.querySelector('.iw-seclabel__count');
    let enterT = 0;
    return {
      el,
      initial: cards[order.indexOf(equipped)] || cards[0],
      onFocus: (f) => {
        if (f._wid && f._wid !== shown) render(f._wid);
        if (f._wid) { countEl.textContent = `${order.indexOf(f._wid) + 1} / ${n}`; if (f.classList.contains('is-new')) { f.classList.remove('is-new'); f.classList.add('was-new'); } }
      },
      afterMount: () => {
        // stat bars grow in from zero once the panel has popped in
        requestAnimationFrame(() => requestAnimationFrame(() => {
          entered = true;
          for (const s of statEls) s.bar.style.setProperty('--v', (s.target / 100).toFixed(3));
        }));
      },
      tick: (dt) => {
        enterT += dt;
        if (!entered) return;
        for (const s of statEls) {
          if (enterT < s.delay) continue;
          s.cur += (s.target - s.cur) * (1 - Math.exp(-dt * 9));
          if (Math.abs(s.target - s.cur) < 0.4) s.cur = s.target;
          const v = Math.round(s.cur);
          if (v !== s.shownInt) { s.shownInt = v; s.num.textContent = String(v); }
        }
      },
    };
  }

  // ================================================================ controls: segmented / slider / toggle
  _seg(options, value, onChange) {
    let idx = Math.max(0, options.findIndex((o) => o[0] === value));
    const opts = options.map(([v, label], i) => {
      const o = h('span', { class: 'iw-seg__opt' + (i === idx ? ' is-sel' : '') }, label);
      o.addEventListener('click', (e) => { e.stopPropagation(); set(i, true); });
      return o;
    });
    const el = h('span', { class: 'iw-seg', style: { '--n': options.length, '--idx': idx } }, h('span', { class: 'iw-seg__hl' }), opts);
    const set = (i, sound) => {
      i = clamp(i, 0, options.length - 1);
      if (i === idx) { if (sound) this._sfx('ui_click'); return false; }
      const d = i > idx ? 1 : -1;
      idx = i;
      el.style.setProperty('--idx', idx);
      el.style.setProperty('--sq', d);
      opts.forEach((o, k) => o.classList.toggle('is-sel', k === idx));
      restartAnim(el, 'is-change');
      if (sound) this._sfx('ui_toggle');
      onChange(options[idx][0]);
      return true;
    };
    return {
      el,
      adjust: (d) => { if (!set(idx + d, true)) { this._sfx('ui_error', 0.15); restartAnim(el, d < 0 ? 'is-edge-l' : 'is-edge-r'); } },
      cycle: () => set((idx + 1) % options.length, true),
      refresh: (v) => { const i = options.findIndex((o) => o[0] === v); if (i >= 0 && i !== idx) { idx = i; el.style.setProperty('--idx', idx); opts.forEach((o, k) => o.classList.toggle('is-sel', k === idx)); } },
    };
  }

  _slider(row, value) {
    const { key, min, max, step, fmt } = row;
    let v = +value;
    const fill = h('span', { class: 'iw-slider__fill' });
    const knob = h('span', { class: 'iw-slider__knob' });
    const def = DEFAULT_SETTINGS[key];
    const mark = def != null ? h('span', { class: 'iw-slider__def', style: { '--d': clamp((def - min) / (max - min)).toFixed(4) }, title: 'Default' }) : null;
    const track = h('span', { class: 'iw-slider__track iw-noclick' }, mark, fill, knob);
    const val = h('span', { class: 'iw-slider__val' });
    const el = h('span', { class: 'iw-slider' }, track, val);
    const render = () => {
      el.style.setProperty('--t', clamp((v - min) / (max - min)).toFixed(4));
      val.textContent = fmt(v);
    };
    const bump = () => { if (val.animate && !prefersReducedMotion()) val.animate([{ scale: 1.22, translate: '0 -2px' }, { scale: 1, translate: '0 0' }], { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' }); };
    const set = (nv, src) => {
      nv = clamp(Math.round((nv - min) / step) * step + min, min, max);
      nv = +nv.toFixed(4);
      if (nv === v) { if (src === 'key') { this._sfx('ui_error', 0.2); restartAnim(el, 'is-edge'); } return; }
      v = nv; render();
      this._setSetting(key, v);
      this._sfx('ui_slider', 0.05);
      bump();
      if (src === 'key') restartAnim(knob, 'is-bump');
    };
    track.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { track.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
      const r = track.getBoundingClientRect();
      const move = (ev) => set(min + clamp((ev.clientX - r.left) / r.width) * (max - min), 'mouse');
      const up = () => { el.classList.remove('is-drag'); track.removeEventListener('pointermove', move); track.removeEventListener('pointerup', up); track.removeEventListener('pointercancel', up); };
      el.classList.add('is-drag'); move(e);
      track.addEventListener('pointermove', move); track.addEventListener('pointerup', up); track.addEventListener('pointercancel', up);
    });
    render();
    let lastAdj = 0, accel = 1;
    return {
      el,
      adjust: (d) => {
        const t = performance.now();
        accel = t - lastAdj < 110 ? Math.min(accel + 0.35, 4) : 1;
        lastAdj = t;
        set(v + d * step * Math.floor(accel), 'key');
      },
      refresh: (nv) => { v = +nv; render(); },
    };
  }

  _toggle(row, value) {
    let v = !!value;
    const knob = h('span', { class: 'iw-toggle__knob' });
    const el = h('span', { class: 'iw-toggle' + (v ? ' is-on' : '') },
      h('span', { class: 'iw-toggle__ink' }),
      h('span', { class: 'iw-toggle__txt iw-toggle__off' }, 'OFF'), h('span', { class: 'iw-toggle__txt iw-toggle__on' }, 'ON'), knob);
    const set = (nv) => {
      nv = !!nv;
      if (nv === v) { this._sfx('ui_error', 0.2); restartAnim(el, 'is-edge'); return; }
      v = nv; el.classList.toggle('is-on', v);
      restartAnim(el, 'is-flip');
      this._setSetting(row.key, v);
      this._sfx('ui_toggle');
      if (v) this._burstAt(knob, { count: 7, dist: 3.2, size: 0.55, splat: false });
    };
    return { el, accept: () => set(!v), adjust: (d) => set(d > 0), refresh: (nv) => { v = !!nv; el.classList.toggle('is-on', v); } };
  }

  // ================================================================ SCREEN: settings
  _scr_settings() {
    let tabIdx = this._settingsTab || 0;
    const tabsEl = h('div', { class: 'iw-tabs' });
    const rowsEl = h('div', { class: 'iw-rows' });
    const controls = new Map();
    const pill = h('span', { class: 'iw-tabs__hl' });
    const tabBtns = SETTINGS_TABS.map((t, i) => {
      const b = h('button', { class: 'iw-tab' }, h('i', { html: GLYPHS[t.icon] }), h('span', null, t.label));
      this._bind(b, { id: 'tab-' + t.id, type: 'tab', accept: () => selectTab(i, true), adjust: (d) => { if (selectTab(i + d, true)) this._setFocus(tabBtns[tabIdx]); } });
      return b;
    });
    tabsEl.append(h('span', { class: 'iw-tabs__hint' }, this._hint('Q', 'LB')), pill, ...tabBtns, h('span', { class: 'iw-tabs__hint' }, this._hint('E', 'RB')));

    // ---- live preview card (right of the panel)
    const pvLabel = h('span', { class: 'iw-prev__label' });
    const pvVal = h('span', { class: 'iw-prev__val' });
    const pvStage = h('div', { class: 'iw-prev__stage' });
    const pvHelp = h('p', { class: 'iw-prev__help' });
    const card = h('aside', { class: 'iw-prev iw-in iw-in--right' }, h('div', { class: 'iw-prev__head' }, pvLabel, pvVal), pvStage, pvHelp);
    const P = { key: null, cur: null };
    const rowDef = (key) => { for (const t of SETTINGS_TABS) { const r = t.rows.find((x) => x.key === key); if (r) return r; } return null; };
    const optLabel = (r, v) => {
      if (r.key === 'difficulty') return (this._diffs()[v] || {}).name || v;
      if (r.key === 'matchLength') return durLabel(v);
      const o = (r.options || []).find((x) => x[0] === v);
      return o ? o[1] : String(v);
    };
    const fmtVal = (r, v) => (!r ? '' : r.type === 'slider' ? r.fmt(+v) : r.type === 'toggle' ? (v ? 'ON' : 'OFF') : r.type === 'seg' ? optLabel(r, v).toUpperCase() : '');
    const showPreview = (key, { label, help, tab } = {}) => {
      if (P.key === key) return;
      P.key = key;
      const s = this._settings();
      const r = rowDef(key);
      const pv = createPreview(key, {
        value: r ? s[key] : null, settings: s, qualityTable: QUALITY, palettes: TEAM_PALETTES, cbPalette: COLORBLIND_PALETTE,
        diffs: this._diffs(), diffInfo: DIFF_INFO, durations: MATCH.durations || [90, 180], tab,
      });
      // retire every preview still on stage (fast focus moves can queue several)
      for (const old of [...pvStage.children]) { if (old._out) continue; old._out = true; old.classList.add('is-out'); setTimeout(() => old.remove(), 260); }
      pvStage.appendChild(pv.el);
      P.cur = pv;
      pvLabel.textContent = label || (r ? r.label : '');
      pvVal.textContent = fmtVal(r, r ? s[key] : null);
      pvVal.classList.toggle('is-empty', !pvVal.textContent);
      pvHelp.textContent = help || (r ? r.help : '');
      restartAnim(card, 'is-swap');
    };

    const buildRows = (dirSign) => {
      rowsEl.innerHTML = '';
      controls.clear();
      const s = this._settings();
      const tab = SETTINGS_TABS[tabIdx];
      tab.rows.forEach((r, i) => {
        let ctrl;
        if (r.type === 'link') ctrl = { el: h('span', { class: 'iw-row__link' }, 'VIEW', h('i', { html: GLYPHS.next })), accept: () => { this._sfx('ui_click'); this._go('howto'); } };
        else if (r.type === 'slider') ctrl = this._slider(r, s[r.key]);
        else if (r.type === 'toggle') ctrl = this._toggle(r, s[r.key]);
        else {
          let options = r.options;
          if (r.key === 'difficulty') options = Object.values(this._diffs()).map((d) => [d.id, d.name]);
          if (r.key === 'matchLength') options = (MATCH.durations || [90, 180]).map((d) => [d, durLabel(d)]);
          ctrl = this._seg(options, s[r.key], (v) => this._setSetting(r.key, v));
          ctrl.accept = ctrl.cycle;
        }
        const row = h('div', { class: 'iw-row iw-rowin' + (r.type === 'link' ? ' iw-row--link' : ''), style: { '--i': i, '--dir': dirSign } },
          h('div', { class: 'iw-row__label' }, h('i', { class: 'iw-row__pip' }), r.label),
          h('div', { class: 'iw-row__ctrl' }, ctrl.el));
        row._key = r.key;
        this._bind(row, { id: 'set-' + r.key, type: 'row', accept: ctrl.accept, adjust: ctrl.adjust });
        if (r.type !== 'link') controls.set(r.key, ctrl);
        rowsEl.appendChild(row);
      });
    };
    const movePill = (instant) => {
      const b = tabBtns[tabIdx];
      if (!b || !b.offsetWidth) return;
      if (instant) pill.classList.add('is-instant');
      pill.style.transform = `translateX(${b.offsetLeft}px)`;
      pill.style.width = `${b.offsetWidth}px`;
      if (instant) { void pill.offsetWidth; pill.classList.remove('is-instant'); } // eslint-disable-line no-void
    };
    const selectTab = (i, sound) => {
      if (i < 0 || i >= SETTINGS_TABS.length) { if (sound) { this._sfx('ui_error', 0.15); } return false; }
      if (i === tabIdx && rowsEl.childElementCount) return false;
      const dirSign = i >= tabIdx ? 1 : -1;
      tabIdx = i; this._settingsTab = i;
      tabBtns.forEach((b, k) => b.classList.toggle('is-sel', k === i));
      tabsEl.style.setProperty('--idx', i);
      tabsEl.style.setProperty('--dir', dirSign);
      restartAnim(pill, 'is-move');
      movePill(false);
      if (sound) this._sfx('ui_toggle');
      buildRows(dirSign);
      return true;
    };
    tabsEl.style.setProperty('--n', SETTINGS_TABS.length);
    tabBtns.forEach((b, k) => b.classList.toggle('is-sel', k === tabIdx));
    tabsEl.style.setProperty('--idx', tabIdx);
    buildRows(1);

    let resetArmed = 0;
    const reset = this._btn({ id: 'reset', label: 'RESET TO DEFAULTS', icon: GLYPHS.reset, cls: 'iw-btn--ghost iw-btn--small', sound: null, accept: () => {
      if (!resetArmed) {
        resetArmed = 2.6; reset.classList.add('is-armed');
        reset.querySelector('.iw-btn__label').textContent = 'PRESS AGAIN TO CONFIRM';
        this._sfx('ui_click');
        return;
      }
      resetArmed = 0; reset.classList.remove('is-armed');
      reset.querySelector('.iw-btn__label').textContent = 'RESET TO DEFAULTS';
      safeCall(() => this.api.setSettings && this.api.setSettings({ ...DEFAULT_SETTINGS }));
      if (!this._accentExternal) this._applyAccent();
      const s = this._settings();
      for (const [k, c] of controls) c.refresh(s[k]);
      this._sfx('ui_confirm');
      rowsEl.querySelectorAll('.iw-row').forEach((r) => restartAnim(r, 'is-flash'));
      savedPulse();
    } });
    const saved = h('div', { class: 'iw-saved' }, h('i', { html: GLYPHS.check }), h('span', null, 'Changes save automatically'));
    const savedPulse = () => { saved.lastChild.textContent = 'Saved!'; restartAnim(saved, 'is-on'); clearTimeout(this._savedT); this._savedT = setTimeout(() => { if (saved.isConnected) saved.lastChild.textContent = 'Changes save automatically'; }, 1400); };

    const panel = this._panel('iw-settings__panel iw-in', tabsEl, rowsEl, h('div', { class: 'iw-settings__foot' }, saved, reset));
    const el = h('div', { class: 'iw-screen iw-settings' },
      h('div', { class: 'iw-scrim-left' }),
      this._header('SETTINGS', { sub: 'Changes apply instantly' }),
      panel, card,
      this._prompts([[['←', '→'], 'DPad', 'Adjust'], [['Q', 'E'], null, 'Tabs'], ['Esc', 'B', 'Back']]));
    el.querySelector('.iw-prompts').children[1].querySelector('.iw-padg').innerHTML = padGlyph('LB') + padGlyph('RB');
    return {
      el,
      initial: () => rowsEl.querySelector('[data-nav]'),
      afterMount: () => movePill(true),
      onFocus: (f) => {
        if (f._key) showPreview(f._key);
        else if (f.dataset.nav === 'tab') { const t = SETTINGS_TABS[tabBtns.indexOf(f)]; if (t) showPreview('_tab_' + t.id, { label: t.label, help: TAB_BLURB[t.id], tab: t }); }
        else if (f.dataset.id === 'reset') showPreview('_reset', { label: 'Reset', help: 'Restore every setting to its original value.' });
      },
      onSetting: (key, value) => {
        savedPulse();
        if (P.key === key && P.cur) {
          const s = this._settings();
          safeCall(() => P.cur.set(value, s));
          pvVal.textContent = fmtVal(rowDef(key), value);
          if (pvVal.animate && !prefersReducedMotion()) pvVal.animate([{ scale: 1.2 }, { scale: 1 }], { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        } else if (P.cur && (key === 'master') && (P.key === 'music' || P.key === 'sfx')) safeCall(() => P.cur.set(this._settings()[P.key], this._settings()));
      },
      onNav: (dir) => {
        if (dir === 'tab_prev' || dir === 'tab_next') {
          const onTab = this._focus && this._focus.dataset.nav === 'tab';
          if (selectTab(tabIdx + (dir === 'tab_next' ? 1 : -1), true)) this._setFocus(onTab ? tabBtns[tabIdx] : rowsEl.querySelector('[data-nav]'));
          else restartAnim(tabsEl, dir === 'tab_next' ? 'is-edge-r' : 'is-edge-l');
          return true;
        }
        return false;
      },
      tick: (dt) => {
        if (P.cur && P.cur.tick) P.cur.tick(dt);
        if (resetArmed > 0) {
          resetArmed -= dt;
          if (resetArmed <= 0) { resetArmed = 0; reset.classList.remove('is-armed'); reset.querySelector('.iw-btn__label').textContent = 'RESET TO DEFAULTS'; }
        }
      },
    };
  }

  // ================================================================ SCREEN: howto
  _controlsList(mode, compact = false) {
    const K = (...ks) => ks.map((k) => (k === 'or' ? '<em>or</em>' : k === 'LMB' ? mouseGlyph('L') : k === 'RMB' ? mouseGlyph('R') : k === 'MOUSE' ? mouseGlyph('M') : keycap(k))).join('');
    const rows = [
      ['Move', null, K('W', 'A', 'S', 'D'), padGlyph('LS')],
      ['Aim', null, K('MOUSE'), padGlyph('RS')],
      ['Fire', null, K('LMB'), padGlyph('RT')],
      ['Swim · squid form', 'hold', K('SHIFT'), padGlyph('LT')],
      ['Jump', null, K('SPACE'), padGlyph('A')],
      ['Aim bomb · release to throw', 'hold', K('RMB', 'or', 'E'), padGlyph('RB')],
      ['Special', null, K('F', 'or', 'Q'), padGlyph('Y')],
      ['Map', 'hold', K('TAB'), padGlyph('View')],
      ['Pause', null, K('ESC'), padGlyph('Start')],
    ];
    const list = compact ? rows.filter((r) => ['Move', 'Fire', 'Swim · squid form', 'Jump', 'Aim bomb · release to throw', 'Special'].includes(r[0])) : rows;
    return h('div', { class: 'iw-ctl' + (compact ? ' iw-ctl--compact' : '') }, list.map(([act, hold, kb, pad]) =>
      h('div', { class: 'iw-ctl__row' },
        h('span', { class: 'iw-ctl__act' }, compact ? act.replace(' · release to throw', '').replace(' · squid form', '') : act, hold ? h('em', null, hold) : null),
        h('span', { class: 'iw-ctl__keys', html: mode === 'pad' ? pad : kb }))));
  }

  _scr_howto() {
    const rules = [
      ['turf', 'Ink the turf', 'Paint the ground in your team’s color. When time runs out, the team with the most turf wins.'],
      ['swim', 'Swim to refill', 'Dive into your own ink as a squid to move fast, hide and refill your ink tank.'],
      ['enemy', 'Avoid enemy ink', 'Enemy ink slows you down and hurts. Paint over it to take the ground back.'],
      ['climb', 'Climb inked walls', 'Ink a wall, then swim straight up it as a squid to reach high ground.'],
    ];
    const cards = rules.map(([art, title, text], i) => h('div', { class: 'iw-rule iw-in iw-in--pop', style: { '--tilt': `${[-1.2, 1, 0.8, -1][i]}deg` } },
      h('div', { class: 'iw-rule__art', html: RULE_ART[art] }),
      h('div', { class: 'iw-rule__num' }, String(i + 1)),
      h('div', { class: 'iw-rule__title' }, title),
      h('p', { class: 'iw-rule__text' }, text)));
    let mode = this._input;
    const listWrap = h('div', { class: 'iw-ctl-wrap' });
    const renderList = () => { listWrap.innerHTML = ''; listWrap.appendChild(this._controlsList(mode)); restartAnim(listWrap, 'is-in'); };
    const seg = this._seg([['kbm', h('span', { class: 'iw-segico' }, h('i', { html: GLYPHS.keyboard }), 'KEYBOARD & MOUSE')], ['pad', h('span', { class: 'iw-segico' }, h('i', { html: GLYPHS.gamepad }), 'CONTROLLER')]], mode, (v) => { mode = v; renderList(); });
    const segRow = h('div', { class: 'iw-ctl-switch' }, seg.el);
    this._bind(segRow, { id: 'scheme', type: 'row', adjust: seg.adjust, accept: seg.cycle });
    renderList();
    const el = h('div', { class: 'iw-screen iw-howto' },
      h('div', { class: 'iw-scrim-full' }),
      this._header('HOW TO PLAY', { sub: 'Turf War in 30 seconds' }),
      h('div', { class: 'iw-howto__body' },
        h('div', { class: 'iw-howto__rules' }, cards),
        this._panel('iw-howto__ctl iw-in iw-in--right', h('div', { class: 'iw-seclabel' }, h('i', { html: GLYPHS.gamepad }), 'CONTROLS'), segRow, listWrap)),
      this._prompts([[['←', '→'], 'DPad', 'Switch controls'], ['Esc', 'B', 'Back']]));
    return {
      el, initial: segRow,
      onNav: (dir) => {
        if (dir === 'tab_prev' || dir === 'tab_next') { seg.adjust(dir === 'tab_next' ? 1 : -1); return true; }
        if (dir === 'up' || dir === 'down') return true; // only one control on this screen
        return false;
      },
    };
  }

  // ================================================================ SCREEN: credits
  _scr_credits() {
    const sec = (title, ...lines) => h('section', { class: 'iw-cred__sec' }, h('h3', null, title), lines.map((l) => (typeof l === 'string' ? h('p', null, l) : l)));
    const cast = h('div', { class: 'iw-cred__cast' }, BOT_NAMES.map((n, i) => h('span', { style: { '--c': i % 2 ? 'var(--b)' : 'var(--a)' } }, h('i', { html: SQUID }), n)));
    const roll = h('div', { class: 'iw-cred__roll' },
      h('div', { class: 'iw-cred__logo', html: logoMarkup(GAME_TITLE, GAME_SUBTITLE, 'md') }),
      h('p', { class: 'iw-cred__lead' }, 'An original 4 v 4 turf-war shooter.'),
      sec('Made with', 'Procedural everything — squidkids, weapons, stage, ink, music and sound are all generated in code.'),
      sec('Rendering', 'three.js', h('p', { class: 'dim' }, 'by the three.js authors & contributors')),
      sec('Typography', 'Titan One — Font Diner', 'Rubik — Hubert & Fischer', h('p', { class: 'dim' }, 'SIL Open Font License')),
      sec('Starring the squidkids', cast),
      sec('Special thanks', 'Everyone who ever painted a wall', 'Every bot that got splatted in testing', 'And you, for playing'),
      h('div', { class: 'iw-cred__end' }, h('div', { class: 'iw-cred__endsplat', html: splatSVG({ seed: 77, cls: 'iw-fa' }) }), h('span', { class: 'iw-display' }, 'STAY FRESH!')));
    const viewport = h('div', { class: 'iw-cred__view' }, roll);
    const el = h('div', { class: 'iw-screen iw-credits' },
      h('div', { class: 'iw-scrim-full' }),
      this._header('CREDITS'),
      viewport,
      this._prompts([['Enter', 'A', 'Hold to speed up'], ['Esc', 'B', 'Back']]));
    let y = null, boost = 0, vh = 0, rh = 0, measureT = 0;
    return {
      el, noCursor: true,
      onNav: (dir) => {
        if (dir === 'accept' || dir === 'down') { boost = 0.35; return true; }
        if (dir === 'up') { boost = -0.35; return true; }
        return false;
      },
      onHold: () => { boost = 0.35; },
      tick: (dt) => {
        // measure rarely (reads), then only write transforms
        measureT -= dt;
        if (measureT <= 0 || !vh) { vh = viewport.clientHeight; rh = roll.offsetHeight; measureT = 0.5; }
        if (y === null) y = vh * 0.62;
        const speed = boost > 0 ? 260 : boost < 0 ? -140 : 42;
        boost = boost > 0 ? Math.max(0, boost - dt) : Math.min(0, boost + dt);
        y -= speed * dt;
        if (y < -rh + vh * 0.35) y = vh;
        if (y > vh) y = vh;
        roll.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
      },
    };
  }

  // ================================================================ SCREEN: pause
  _resume() {
    this._sfx('ui_back');
    safeCall(() => this.api.resumeMatch && this.api.resumeMatch());
    if (this.current === 'pause') this.show(null);
  }

  /** Live match snapshot for the pause screen (null-guarded; demo data when no match is running, e.g. the UI lab). */
  _matchSnapshot() {
    try {
      const m = G.match;
      if (m && !m.attract && Array.isArray(m.actors) && m.actors.length) {
        const game = G.game || {};
        const hex = G.teamHex || [];
        const [a, b] = this._accent();
        return {
          live: true, time: Math.max(0, +m.time || 0), duration: Math.max(1, +m.duration || 180),
          map: (game.mapDef && game.mapDef.name) || '', difficulty: m.opts && m.opts.difficulty,
          colors: [toHex(hex[0] || a), toHex(hex[1] || b)],
          names: (game.palette && game.palette.names) || this._accentNames(),
          players: m.actors.map((x) => {
            let sp = false, spf = 0;
            try { sp = !!x.specialReady(); spf = x.specialFrac ? x.specialFrac() : 0; } catch (e) { /* optional */ }
            return {
              name: x.name, team: x.team | 0, weapon: x.weaponId, alive: x.alive !== false, respawn: x.alive === false ? Math.max(0, +x.respawnTimer || 0) : 0,
              special: sp, specialFrac: spf, isSelf: !!x.isLocal, turf: (x.stats && x.stats.turf) || 0, splats: (x.stats && x.stats.splats) || 0, deaths: (x.stats && x.stats.deaths) || 0,
            };
          }),
        };
      }
    } catch (e) { console.error('[menus] match snapshot', e); }
    const [a, b] = this._accent();
    const names = [this._profile().name, ...BOT_NAMES.slice(0, 7)];
    const demo = [
      [0, 'shooter', true, 0, false, 0.82, 612, 3, 1], [0, 'roller', true, 0, true, 1, 540, 2, 2], [0, 'charger', false, 3.4, false, 0.4, 301, 4, 1], [0, 'blaster', true, 0, false, 0.66, 455, 1, 0],
      [1, 'charger', true, 0, false, 0.5, 488, 2, 1], [1, 'shooter', false, 1.2, false, 0.3, 390, 1, 3], [1, 'blaster', true, 0, true, 1, 520, 3, 2], [1, 'roller', true, 0, false, 0.7, 610, 0, 1],
    ];
    return {
      live: false, time: 94.4, duration: 180, map: MAPS[0].name, difficulty: 'normal', colors: [a, b], names: this._accentNames(),
      players: demo.map(([team, weapon, alive, respawn, special, specialFrac, turf, splats, deaths], i) => ({ name: names[i], team, weapon, alive, respawn, special, specialFrac, isSelf: i === 0, turf, splats, deaths })),
    };
  }

  _scr_pause() {
    const items = [
      { id: 'resume', label: 'RESUME', icon: GLYPHS.play, cls: 'iw-btn--menu iw-btn--primary', accept: () => this._resume(), sound: null },
      { id: 'settings', label: 'SETTINGS', icon: GLYPHS.gear, cls: 'iw-btn--menu', accept: () => this._go('settings') },
      { id: 'howto', label: 'HOW TO PLAY', icon: GLYPHS.question, cls: 'iw-btn--menu', accept: () => this._go('howto') },
      { id: 'quit', label: 'QUIT MATCH', icon: GLYPHS.close, cls: 'iw-btn--menu iw-btn--danger', accept: () => this._openModal({
        title: 'QUIT MATCH?', text: 'You will leave this Turf War and head back to the lobby. Your turf will not count.', danger: true,
        buttons: [
          { label: 'KEEP PLAYING', accept: () => this._closeModal(), sound: null },
          { label: 'QUIT', cls: 'iw-btn--danger', sound: 'ui_confirm', accept: () => {
            this._closeModal(true);
            safeCall(() => this.api.quitMatch && this.api.quitMatch());
            if (this.current === 'pause') this.show('main', { wipe: true });
          } },
        ],
      }) },
    ];
    const tilts = [-1.8, 1.2, -1, 1.4];
    const btns = items.map((it, i) => { const b = this._btn({ ...it, tilt: tilts[i] }); b.classList.add('iw-in', 'iw-in--left'); return b; });

    // ---- live match panel
    const snap = this._matchSnapshot();
    const selfP = snap.players.find((p) => p.isSelf) || snap.players[0] || { team: 0, name: 'You' };
    const diff = snap.difficulty && this._diffs()[snap.difficulty];
    const clockNum = h('b', { class: 'iw-pclock__num' }, fmtTime(snap.time));
    const clockArc = h('i', { class: 'iw-pclock__arc' });
    const clock = h('div', { class: 'iw-pclock' }, h('span', { class: 'iw-pclock__ring' }, clockArc), h('div', { class: 'iw-pclock__txt' }, clockNum, h('small', null, 'LEFT')));
    const stat = (cls, icon, label) => {
      const b = h('b');
      const n = h('span', { class: `iw-pstat ${cls}` }, h('i', { html: icon }), b, h('small', null, label));
      return { el: n, b };
    };
    const sTurf = stat('iw-pstat--turf', GLYPHS.drop, 'TURF'), sSplat = stat('', SPLAT_ICON, 'SPLATS'), sDeath = stat('', DEATH_ICON, 'SPLATTED'), sSp = stat('iw-pstat--sp', specialIcon((this._weapons()[selfP.weapon] || {}).special), 'SPECIAL');
    const you = h('div', { class: 'iw-pyou' },
      h('span', { class: 'iw-pyou__av', html: SQUID }),
      h('div', { class: 'iw-pyou__id' }, h('small', null, 'YOUR MATCH'), h('b', null, selfP.name || 'You')),
      h('div', { class: 'iw-pyou__stats' }, sTurf.el, sSplat.el, sDeath.el, sSp.el));
    const rosterRows = [];
    const roster = (team) => {
      const list = snap.players.filter((p) => p.team === team);
      return h('div', { class: `iw-roster iw-roster--${team ? 'b' : 'a'}` },
        h('div', { class: 'iw-roster__head' }, h('i', { class: 'iw-roster__dot' }), h('span', null, snap.names[team] || TEAM_NAMES[team]), h('em', null, team === selfP.team ? 'YOUR TEAM' : 'RIVALS')),
        list.map((p) => {
          const st = h('span', { class: 'iw-rrow__st' });
          const row = h('div', { class: 'iw-rrow' + (p.isSelf ? ' is-self' : '') },
            h('span', { class: 'iw-rrow__w', html: weaponIcon((this._weapons()[p.weapon] || {}).kind || p.weapon) }),
            h('span', { class: 'iw-rrow__name' }, p.name, p.isSelf ? h('em', null, 'YOU') : null),
            st);
          rosterRows.push({ row, st, name: p.name, team: p.team, sig: '' });
          return row;
        }));
    };
    const teams = h('div', { class: 'iw-pteams' }, roster(0), roster(1));
    const ctlWrap = h('div', { class: 'iw-pctl' }, h('div', { class: 'iw-seclabel' }, h('i', { html: GLYPHS.gamepad }), 'QUICK CONTROLS'), this._controlsList(this._input, true));
    const matchPanel = this._panel('iw-pmatch iw-panel--flat iw-in iw-in--right',
      h('div', { class: 'iw-pmatch__top' },
        h('div', { class: 'iw-pmatch__info' },
          h('div', { class: 'iw-pmatch__mode' }, h('span', { class: 'iw-pmatch__tag' }, 'TURF WAR'), diff ? h('span', { class: 'iw-pmatch__diff' }, h('i', { html: GLYPHS.bot }), `${diff.name} bots`) : null),
          h('div', { class: 'iw-pmatch__map' }, h('i', { html: GLYPHS.map }), snap.map || 'Turf War')),
        clock),
      you, teams, ctlWrap);
    colorVars(matchPanel, 'ta', snap.colors[0]);
    colorVars(matchPanel, 'tb', snap.colors[1]);
    colorVars(matchPanel, 'self', snap.colors[selfP.team] || snap.colors[0]);

    const refresh = (s) => {
      const tLeft = s.time, frac = clamp(tLeft / s.duration);
      clockNum.textContent = fmtTime(tLeft);
      clock.style.setProperty('--f', frac.toFixed(4));
      clock.classList.toggle('is-low', tLeft <= 60);
      const me = s.players.find((p) => p.isSelf) || selfP;
      sTurf.b.innerHTML = `${fmtInt(me.turf || 0)}<small>p</small>`;
      sSplat.b.textContent = String(me.splats || 0);
      sDeath.b.textContent = String(me.deaths || 0);
      sSp.b.textContent = me.special ? 'READY' : `${Math.round(clamp(me.specialFrac || 0) * 100)}%`;
      sSp.el.classList.toggle('is-ready', !!me.special);
      sSp.el.style.setProperty('--sp', clamp(me.specialFrac || 0).toFixed(3));
      for (const r of rosterRows) {
        const p = s.players.find((x) => x.name === r.name && x.team === r.team);
        if (!p) continue;
        const sig = !p.alive ? `d${Math.ceil(p.respawn)}` : p.special ? 's' : 'a';
        if (sig === r.sig) continue;
        r.sig = sig;
        r.row.classList.toggle('is-dead', !p.alive);
        r.row.classList.toggle('is-sp', p.alive && p.special);
        if (!p.alive) r.st.innerHTML = `<span class="iw-st iw-st--dead"><i>${DEATH_ICON}</i><b>${Math.max(1, Math.ceil(p.respawn))}s</b></span>`;
        else if (p.special) r.st.innerHTML = `<span class="iw-st iw-st--sp"><i>${specialIcon((this._weapons()[p.weapon] || {}).special)}</i>READY</span>`;
        else r.st.innerHTML = `<span class="iw-st iw-st--alive"><i>${SQUID}</i></span>`;
      }
    };
    refresh(snap);

    const el = h('div', { class: 'iw-screen iw-pause' },
      h('div', { class: 'iw-pause__dim' }),
      h('div', { class: 'iw-pause__col' },
        h('div', { class: 'iw-pause__title iw-in iw-in--down' }, h('span', { class: 'iw-pause__blob', html: splatSVG({ seed: 3, cls: 'iw-fa', r: 60, arms: 8, drops: 4 }) }), h('span', { class: 'iw-display' }, 'PAUSED')),
        h('nav', { class: 'iw-pause__menu' }, btns)),
      matchPanel,
      this._prompts([['Enter', 'A', 'Select'], ['Esc', 'Start', 'Resume']]));
    let acc = 0;
    return {
      el, wrap: true, initial: btns[0],
      onBack: () => { if (performance.now() - this._shownAt > 200) this._resume(); },
      onInputMode: (mode) => { const old = ctlWrap.querySelector('.iw-ctl'); if (old) old.replaceWith(this._controlsList(mode, true)); },
      tick: (dt) => {
        acc += dt;
        if (acc < 0.25) return;
        acc = 0;
        if (snap.live) refresh(this._matchSnapshot());
      },
    };
  }

  // ================================================================ SCREEN: results
  _scr_results() {
    const d = this._results || this._demoResults();
    const colors = (d.colors || [TEAM_PALETTES[0].a, TEAM_PALETTES[0].b]).map((c) => toHex(c));
    const [pa, pb] = pct(...(d.percents || [50, 50]));
    const names = d.teamNames || TEAM_NAMES;
    const win = !!d.win;
    const raw = d.players || [];
    const awards = computeAwards(raw, { win, percents: [pa, pb] });
    const all = raw.map((p, i) => ({ ...p, _aw: awards.byPlayer[i] || [] }));
    const players = all.slice().sort((x, y) => (x.team - y.team) || (y.turf - x.turf));
    const self = all.find((p) => p.isSelf) || null;
    const selfTeam = self ? self.team : 0;
    const winTeam = win ? selfTeam : 1 - selfTeam;
    const reduced = prefersReducedMotion();

    // ---- title block: VICTORY/DEFEAT, stage, match tags, your medals
    const titleEl = h('div', { class: 'iw-res__title iw-display' }, win ? 'VICTORY!' : 'DEFEAT');
    const tags = awards.match.map((t) => h('span', { class: `iw-res__tag iw-res__tag--${t.id}` }, h('i', { html: awardIcon(t.icon) }), t.label, h('small', null, t.value)));
    const myAwards = (self ? self._aw : []).slice(0, 4);
    const medals = myAwards.map((aw, i) => { const m = h('div', { class: 'iw-medalwrap', html: medalMarkup(aw, i) }).firstElementChild; return m; });
    const medalRow = medals.length ? h('div', { class: 'iw-res__medals' + (medals.length > 3 ? ' is-4' : '') }, h('div', { class: 'iw-res__medalcap' }, 'YOUR MEDALS'), h('div', { class: 'iw-res__medallist' }, medals)) : null;
    const head = h('div', { class: 'iw-res__head iw-in iw-in--pop' + (win ? ' is-win' : ' is-lose') },
      h('div', { class: 'iw-res__splat', html: splatSVG({ seed: win ? 9 : 14, cls: 'iw-fta', r: 60, arms: 10, drops: 4 }) }),
      titleEl,
      h('div', { class: 'iw-res__metarow' }, h('div', { class: 'iw-res__meta' }, h('i', { html: GLYPHS.map }), `${d.mapName || 'Turf War'} · Turf War`), tags),
      medalRow);

    // ---- coverage bar (JS-driven growth so the numbers + sound land together)
    const crownA = h('i', { class: 'iw-cover__crown', html: GLYPHS.crown });
    const crownB = h('i', { class: 'iw-cover__crown', html: GLYPHS.crown });
    const numA = h('b', null, '0.0%'), numB = h('b', null, '0.0%');
    const coverBar = h('div', { class: 'iw-cover', style: { '--pa': (pa / 100).toFixed(4), '--pb': (pb / 100).toFixed(4), '--ga': reduced ? 1 : 0 } },
      h('div', { class: 'iw-cover__a' }, h('i', { class: 'iw-cover__shine' })),
      h('div', { class: 'iw-cover__b' }, h('i', { class: 'iw-cover__shine' })),
      h('i', { class: 'iw-cover__mid' }));
    const cover = h('div', { class: 'iw-res__cover iw-in' + (pa >= pb ? ' is-a' : ' is-b') },
      h('div', { class: 'iw-cover__names' },
        h('span', { class: 'ta' + (pa >= pb ? ' is-win' : '') }, pa >= pb ? crownA : null, names[0] || 'Alpha', numA),
        h('span', { class: 'tb' + (pb > pa ? ' is-win' : '') }, numB, names[1] || 'Bravo', pb > pa ? crownB : null)),
      coverBar);

    // ---- team tables with count-ups + award badges
    const rowFx = [];
    const table = (team) => {
      const rows = players.filter((p) => p.team === team);
      const best = Math.max(...rows.map((p) => p.turf || 0), 1);
      const isWin = team === winTeam;
      return h('div', { class: `iw-ttable iw-ttable--${team ? 'b' : 'a'} ${isWin ? 'is-win' : 'is-lose'}` },
        h('div', { class: 'iw-ttable__head iw-in' },
          h('span', { class: 'iw-ttable__team' }, h('i', { class: 'iw-ttable__dot' }), names[team] || TEAM_NAMES[team], isWin ? h('em', { class: 'iw-ttable__win' }, h('i', { html: GLYPHS.crown }), 'WIN') : null),
          h('span', { class: 'iw-ttable__col', title: 'Turf inked' }, h('i', { html: GLYPHS.drop }), 'TURF'),
          h('span', { class: 'iw-ttable__col', title: 'Splats' }, h('i', { html: SPLAT_ICON })),
          h('span', { class: 'iw-ttable__col', title: 'Times splatted' }, h('i', { html: DEATH_ICON }))),
        rows.map((p, ri) => {
          const turfNum = h('b', null, '0');
          const turfBar = h('i', { class: 'iw-prow__turfbar' });
          const nSplat = h('span', { class: 'iw-prow__n is-wait' }, String(p.splats || 0));
          const nDeath = h('span', { class: 'iw-prow__n is-wait' }, String(p.deaths || 0));
          const badges = h('span', { class: 'iw-prow__aw' });
          const isMvp = p._aw.some((a) => a.id === 'mvp');
          const row = h('div', { class: 'iw-prow iw-in iw-in--left' + (p.isSelf ? ' is-self' : '') + (isMvp ? ' is-mvp' : '') },
            h('span', { class: 'iw-prow__w', html: weaponIcon((this._weapons()[p.weapon] || {}).kind || p.weapon) }),
            h('span', { class: 'iw-prow__name' }, h('span', { class: 'iw-prow__nm' }, p.name), p.isSelf ? h('em', null, 'YOU') : null, badges),
            h('span', { class: 'iw-prow__turf' }, turfBar, turfNum, h('small', null, 'p')),
            nSplat, nDeath);
          rowFx.push({ row, turfNum, turfBar, nSplat, nDeath, badges, turf: p.turf || 0, rel: (p.turf || 0) / best, aws: p._aw.slice(0, 3), start: 0.8 + ri * 0.13, shown: -1, done: false });
          return row;
        }));
    };

    // ---- XP
    const xp = { gained: 0, levelBefore: 1, levelAfter: 1, xpBefore: 0, xpAfter: 0, xpToNextBefore: 1000, xpToNextAfter: 1000, ...(d.xp || {}) };
    const lvlNum = h('span', { class: 'iw-lvl__n' }, String(xp.levelBefore));
    const lvl = h('span', { class: 'iw-lvl iw-lvl--big' }, h('small', null, 'LV'), lvlNum, h('i', { class: 'iw-lvl__burst', html: GLYPHS.star }));
    const bar = h('span', { class: 'iw-xpbar iw-xpbar--big' }, h('i'));
    const gainEl = h('b', { class: 'iw-xp__gain' }, '+0 XP');
    const nextEl = h('span', { class: 'iw-xp__next' });
    const lvUp = h('span', { class: 'iw-xp__lvup' }, 'LEVEL UP!');
    // honest XP breakdown (only when the parts add up to the reported gain)
    const bd = [];
    if (self) {
      const base = win ? PROGRESSION.xpWin : PROGRESSION.xpLose;
      const tx = Math.round((self.turf || 0) * PROGRESSION.xpPerTurfPoint), sx = Math.round((self.splats || 0) * PROGRESSION.xpPerSplat);
      if (xp.gained > 0 && Math.abs(base + tx + sx - xp.gained) <= 2) {
        bd.push([win ? 'WIN BONUS' : 'MATCH', base], [`TURF`, tx]);
        if (sx) bd.push(['SPLATS', sx]);
      }
    }
    let acc = 0;
    const bdEls = bd.map(([label, v]) => { const at = acc / Math.max(1, xp.gained); acc += v; return { at, el: h('span', { class: 'iw-xpb' }, h('small', null, label), h('b', null, `+${fmtInt(v)}`)) }; });
    const xpPanel = this._panel('iw-xp iw-in iw-in--up' + (bdEls.length ? ' has-bd' : ''), lvl,
      h('div', { class: 'iw-xp__mid' }, h('div', { class: 'iw-xp__row' }, h('span', null, gainEl, lvUp), nextEl), bar,
        bdEls.length ? h('div', { class: 'iw-xp__bd' }, bdEls.map((b) => b.el)) : null));

    const rematch = this._btn({ id: 'rematch', label: 'REMATCH', icon: GLYPHS.reset, cls: 'iw-btn--wide iw-btn--primary iw-in iw-in--pop', sound: 'ui_confirm', accept: () => {
      safeCall(() => this.api.rematch && this.api.rematch());
    } });
    const home = this._btn({ id: 'home', label: 'MAIN MENU', icon: GLYPHS.back, cls: 'iw-btn--wide iw-in iw-in--pop', sound: 'ui_click', accept: () => {
      safeCall(() => this.api.toMainMenu && this.api.toMainMenu());
      if (this.current === 'results') this.show('main', { wipe: true });
    } });

    const el = h('div', { class: 'iw-screen iw-results' + (win ? ' is-win' : ' is-lose') },
      h('div', { class: 'iw-res__scrim' }),
      head,
      h('div', { class: 'iw-res__body' },
        cover,
        h('div', { class: 'iw-res__teams' }, table(0), table(1)),
        h('div', { class: 'iw-res__foot' }, xpPanel, h('div', { class: 'iw-res__btns' }, rematch, home))),
      this._prompts([['Enter', 'A', 'Skip · Select'], [['←', '→'], 'DPad', 'Move']]));
    colorVars(el, 'ta', colors[0]);
    colorVars(el, 'tb', colors[1]);
    colorVars(el, 'tw', colors[0]);
    colorVars(el, 'self', colors[selfTeam] || colors[0]);

    // ---- timeline (seconds; driven by tick so freeze/slow-mo apply). The team's podium moment plays first: the
    // scoreboard waits below the fold for INTRO seconds (the showcase frames the dancers big meanwhile), then slides up.
    const INTRO = reduced ? 0 : 2.3;
    if (INTRO > 0) el.classList.add('is-intro');
    const COVER0 = 0.45, COVER1 = 1.35;
    let allBadges = 0;
    rowFx.forEach((r) => { allBadges += r.aws.length; });
    const BADGE0 = 2.05;
    const MEDAL0 = BADGE0 + Math.min(allBadges, 10) * 0.07 + 0.25;
    const medalFx = medals.map((m, i) => ({ el: m, at: MEDAL0 + i * 0.5, done: false, mvp: m.dataset.aw === 'mvp' }));
    const XP0 = medalFx.length ? MEDAL0 + medalFx.length * 0.5 + 0.1 : BADGE0 + 0.35;
    let T = -INTRO, coverDone = false, tickAcc = 0, lastA = -1, lastB = -1, badgeQueue = null;
    const endIntro = (silent) => { if (!el.classList.contains('is-intro')) return; el.classList.remove('is-intro'); if (!silent) this._sfx('ui_confirm', 0.1); };

    const setCover = (k) => {
      coverBar.style.setProperty('--ga', k.toFixed(4));
      const va = Math.round(pa * k * 10), vb = Math.round(pb * k * 10);
      if (va !== lastA) { lastA = va; numA.textContent = (va / 10).toFixed(1) + '%'; }
      if (vb !== lastB) { lastB = vb; numB.textContent = (vb / 10).toFixed(1) + '%'; }
    };
    const landCover = (silent) => {
      if (coverDone) return;
      coverDone = true;
      setCover(1);
      cover.classList.add('is-landed');
      if (!silent) { this._sfx('splat_big'); }
    };
    const setRow = (r, k) => {
      const v = Math.round(r.turf * k);
      if (v !== r.shown) { r.shown = v; r.turfNum.textContent = fmtInt(v); }
      r.turfBar.style.setProperty('--t', (r.rel * k).toFixed(4));
    };
    const finishRow = (r) => {
      if (r.done) return;
      r.done = true; setRow(r, 1);
      r.row.classList.add('is-counted');
      r.nSplat.classList.remove('is-wait'); r.nDeath.classList.remove('is-wait');
    };
    const badgesList = () => {
      if (badgeQueue) return badgeQueue;
      badgeQueue = [];
      for (const r of rowFx) for (const aw of r.aws) badgeQueue.push({ r, aw, done: false });
      return badgeQueue;
    };
    const showBadge = (b, silent) => {
      if (b.done) return;
      b.done = true;
      const el2 = awardBadge(b.aw);
      b.r.badges.appendChild(el2);
      if (!silent) this._sfx('ui_toggle', 0.05);
    };
    const stampMedal = (m, silent) => {
      if (m.done) return;
      m.done = true;
      m.el.classList.add(silent ? 'is-shown' : 'is-in');
      if (!silent) { this._sfx('splat_big', 0.08); if (m.mvp) this._sfx('special_ready', 0.1); }
    };
    if (reduced) { landCover(true); rowFx.forEach(finishRow); }

    // XP animation state machine
    const segs = [];
    {
      const lb = xp.levelBefore | 0, la = Math.max(lb, xp.levelAfter | 0);
      if (la > lb) {
        segs.push({ lv: lb, from: xp.xpBefore, to: xp.xpToNextBefore, max: xp.xpToNextBefore, up: true });
        for (let l = lb + 1; l < la; l++) { const m = PROGRESSION.xpForLevel(l); segs.push({ lv: l, from: 0, to: m, max: m, up: true }); }
        segs.push({ lv: la, from: 0, to: xp.xpAfter, max: xp.xpToNextAfter, up: false });
      } else segs.push({ lv: lb, from: xp.xpBefore, to: xp.xpAfter, max: xp.xpToNextBefore, up: false });
    }
    const totalFill = segs.reduce((a, s) => a + Math.max(0, s.to - s.from), 0) || 1;
    let si = 0, cur = segs[0].from, filled = 0, pause = 0, xpTick = 0, done = false;
    const setBar = (v, max) => { bar.style.setProperty('--t', clamp(v / Math.max(1, max)).toFixed(4)); nextEl.textContent = `${fmtInt(Math.max(0, max - v))} XP to next level`; };
    setBar(cur, segs[0].max);
    const showBd = (frac) => { for (const b of bdEls) if (!b.shown && frac >= b.at - 1e-6) { b.shown = true; b.el.classList.add('is-in'); } };
    const finish = () => {
      if (done) return;
      endIntro(true);
      landCover(true);
      rowFx.forEach(finishRow);
      badgesList().forEach((b) => showBadge(b, true));
      medalFx.forEach((m) => stampMedal(m, true));
      const last = segs[segs.length - 1];
      if (segs.length > 1 && lvlNum.textContent !== String(last.lv)) { lvlNum.textContent = String(last.lv); xpPanel.classList.add('is-levelup'); }
      si = segs.length - 1; cur = last.to; setBar(cur, last.max);
      gainEl.textContent = `+${fmtInt(xp.gained)} XP`;
      showBd(1);
      done = true; xpPanel.classList.add('is-done');
      el.classList.add('is-done');
    };
    el.addEventListener('pointerdown', (e) => { if (!done && !e.target.closest('[data-nav]')) finish(); });
    return {
      el, initial: rematch,
      onNav: (dir) => {
        if (dir === 'accept' && !done) { finish(); this._sfx('ui_click'); return true; } // first press skips the count-ups (no accidental rematch)
        if (dir === 'back') return true;
        return false;
      },
      tick: (dt) => {
        if (done) return;
        T += dt;
        if (T < -0.05) return;
        endIntro(false);
        // coverage bar
        if (!coverDone) {
          if (T >= COVER0) {
            const k = easeOutCubic(clamp((T - COVER0) / (COVER1 - COVER0)));
            setCover(k);
            tickAcc += dt;
            if (tickAcc > 0.07 && k < 0.98) { tickAcc = 0; this._sfx('xp_tick', 0.06); }
            if (T >= COVER1) landCover(false);
          }
        }
        // per-row turf count-ups (staggered by rank within each team)
        let counting = false;
        for (const r of rowFx) {
          if (r.done || T < r.start) continue;
          const k = clamp((T - r.start) / 0.75);
          setRow(r, easeOutCubic(k));
          counting = true;
          if (k >= 1) finishRow(r);
        }
        if (counting) { xpTick += dt; if (xpTick > 0.075) { xpTick = 0; this._sfx('xp_tick', 0.06); } }
        // award badges pop in next to names
        if (T >= BADGE0) {
          const q = badgesList();
          const n = Math.floor((T - BADGE0) / 0.07) + 1;
          for (let i = 0; i < Math.min(n, q.length); i++) showBadge(q[i], false);
        }
        // your medals: flip + stamp, one by one
        for (const m of medalFx) if (!m.done && T >= m.at) stampMedal(m, false);
        // XP bar
        if (T < XP0) return;
        if (pause > 0) { pause -= dt; return; }
        const s = segs[si];
        const rate = Math.max(totalFill / 1.7, 300);
        const step = Math.min(rate * dt, s.to - cur);
        cur += step; filled += step;
        setBar(cur, s.max);
        const frac = Math.min(1, filled / totalFill);
        gainEl.textContent = `+${fmtInt(Math.min(xp.gained, frac * xp.gained))} XP`;
        showBd(frac);
        xpTick += dt;
        if (xpTick > 0.065) { xpTick = 0; this._sfx('xp_tick', 0.05); }
        if (cur >= s.to - 1e-6) {
          if (s.up) {
            si++;
            const nx = segs[si];
            lvlNum.textContent = String(nx.lv);
            restartAnim(xpPanel, 'is-levelup');
            restartAnim(lvl, 'is-pop');
            this._sfx('level_up', 0.1);
            cur = nx.from; setBar(cur, nx.max);
            pause = 0.75;
          } else if (si >= segs.length - 1) { finish(); }
          else si++;
        }
      },
    };
  }

  _demoResults() {
    const pal = TEAM_PALETTES[0];
    const names = BOT_NAMES.slice(0, 8);
    return {
      win: true, percents: [51.2, 42.7], colors: [pal.a, pal.b], teamNames: pal.names, mapName: MAPS[0].name,
      players: names.map((n, i) => ({ name: i === 0 ? this._profile().name : n, team: i < 4 ? 0 : 1, weapon: WEAPON_ORDER[i % 4], turf: 1400 - i * 90, splats: (i * 3) % 7, deaths: (i * 5) % 4, isSelf: i === 0 })),
      xp: { gained: 1640, levelBefore: 4, levelAfter: 5, xpBefore: 1700, xpAfter: 1140, xpToNextBefore: 2200, xpToNextAfter: 2550 },
    };
  }
}
