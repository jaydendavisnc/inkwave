// INKWAVE — front-end menus (contract: docs/CONTRACTS.md §3).
//   const menus = new Menus(rootEl, api);
//   menus.show(screen) · menus.current · menus.setLoading(p, label) · menus.showResults(data)
//   menus.update(dt) · menus.handleKey(e) → bool · menus.nav(dir) → bool
// Additive extras (optional for the engine): menus.setAccent(a, b), menus.setInputMode('kbm'|'pad'),
// nav('tab_prev'|'tab_next') for LB/RB tab switching, menus.timeScale (debug slow-motion for JS-driven motion).
import {
  h, clamp, Spring, colorVars, toHex, splatSVG, fmtInt, fmtTime, pct, safeCall, restartAnim,
  prefersReducedMotion, easeOutCubic, easeInOutCubic, esc, blobPath,
} from './ui-util.js';
import {
  WEAPON_ICONS, SUB_ICONS, SQUID, GLYPHS, SPLAT_ICON, DEATH_ICON, keycap, mouseGlyph, padGlyph,
  richText, logoMarkup, mapThumb, RULE_ART, weaponIcon, specialIcon,
} from './ui-icons.js';
import {
  GAME_TITLE, GAME_SUBTITLE, VERSION, WEAPONS, WEAPON_ORDER, SPECIALS, SUB, MAPS, DIFFICULTY, MATCH, QUALITY,
  DEFAULT_SETTINGS, TEAM_PALETTES, COLORBLIND_PALETTE, PROGRESSION, BOT_NAMES, TEAM_NAMES, ZONES, TOWER,
  mapNoBots, mapBossOk, bossFallbackMap, noBotsStartBlock,
} from '../config.js';
import * as LOOK from '../game/character-style.js';
import { G } from '../core/ctx.js';
import {
  computeAwards, medalMarkup, awardBadge, awardIcon, rankEmblem, rankTier, RANK_TIERS, inkBurst, InkWipe, createPreview,
  sweepEdge, sweepClip, splatClip, splatCover, skinSwatch, irisSwatch, outfitIcon, tagArt, inkBand, dripsSVG, computeBossAwards,
} from './menu-art.js';
import { bossSilhouette, bossEmblem, BOSS_GLYPH, BOSS_NAME, BOSS_EPITHET } from './boss-art.js';
import { WhatsNew } from './news.js';

const SCREENS = ['loading', 'title', 'main', 'mode', 'loadout', 'setup', 'locker', 'settings', 'howto', 'credits', 'pause', 'results', 'online', 'lobby'];
// Transitions that get the full-screen ink wipe (the rest use staggered pop-ins).
const WIPES = new Set(['loading>title', 'title>main', 'results>main', 'pause>main', 'results>null', 'pause>title', 'online>lobby', 'lobby>online', 'lobby>main', 'results>lobby', 'pause>online']);
// Pushes/pops between these get the light ink swipe (decorative — the swap itself is immediate).
const LIGHT = new Set(['main', 'mode', 'loadout', 'setup', 'locker', 'settings', 'howto', 'credits', 'pause', 'online', 'lobby']);
// ?netmock=1 → an offline stand-in for G.net (src/net/mock.js) so the online screens work without the relay
const NETMOCK = typeof location !== 'undefined' && new URLSearchParams(location.search).get('netmock') === '1';
// room codes (the session generates them from this set: no O/0, I/1)
const CODE_ABC = 'BCEFGHJKLMNPQRTUVXYZ23456789';   // as session.js: no O/0, I/1, and no W/A/S/D (menu keys)
const TEAM_LABEL = ['ALPHA', 'BRAVO'];
const EMOTES = [
  { id: 'booyah', label: 'BOOYAH!', icon: 'booyah', key: '1', dir: 'up' },
  { id: 'wave', label: 'HEY!', icon: 'hand', key: '2', dir: 'right' },
  { id: 'dance', label: 'DANCE', icon: 'note', key: '3', dir: 'down' },
  { id: 'flex', label: 'FLEX', icon: 'flex', key: '4', dir: 'left' },
];
// splashtag title line ("Fresh Squidkid"): adjective + subject, picked from the player's name so everyone sees the same
const TITLE_ADJ = ['Fresh', 'Inky', 'Turf', 'Splashy', 'Rad', 'Sneaky', 'Deep-Sea', 'Glossy', 'Tidal', 'Zesty', 'Mighty', 'Soggy', 'Speedy', 'Salty', 'Bubbly', 'Snazzy', 'Drippy', 'Sunny'];
const TITLE_NOUN = ['Squidkid', 'Inkling', 'Turf Boss', 'Wave Rider', 'Splatter', 'Tentacle', 'Drip Lord', 'Sprayer', 'Rookie', 'Legend', 'Deck Hand', 'Sea Pickle', 'Kelp Fan', 'Ink Slinger', 'Plaza Star', 'Harbor Kid'];
const JOIN_ERR = {
  'Room not found': { title: 'ROOM NOT FOUND', text: 'No room uses that code. Double-check it with your friend — rooms close when everyone leaves.', icon: 'question' },
  'Room is full': { title: 'ROOM IS FULL', text: 'All 8 spots are taken. Ask the host to make space, or open a room of your own.', icon: 'users' },
  'Match in progress': { title: 'MATCH IN PROGRESS', text: 'They are mid-match right now. Try again in a few minutes — the room reopens after the results.', icon: 'clock' },
  'Could not connect': { title: 'CAN\u2019T CONNECT', text: 'The INKWAVE servers didn\u2019t answer. Check your connection, then try again.', icon: 'signal' },
  'Room code taken': { title: 'TRY AGAIN', text: 'That room code was just taken. Give it another go.', icon: 'reset' },
  'Lost connection to the room': { title: 'CONNECTION LOST', text: 'The link to the room dropped. Check your connection and join again.', icon: 'signal' },
};
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
  'In Turf War only turf counts when time runs out. Splats just buy you space.',
  'Your special gauge fills as you ink. Press [F] when it glows!',
  'A Splat Bomb costs most of your tank — throw it where it claims the most turf.',
  'Chargers splat in one fully-charged shot. Keep moving and use cover.',
  'Rollers paint huge stripes. Flick the roller to splash foes at range.',
  'Low on ink? Dive in, refill, then push again.',
  'Hold [TAB] to open the big map and spot unpainted turf.',
  'Zone Control: ink 80% of the live zone to take it — 40% of theirs knocks it back to neutral.',
  'Zone Control: a side zone on their half counts you down 4× faster than the one on yours.',
  'Zone Control: lose the zone to the other team and you get a penalty to count off before your count moves again.',
  'Zone Control: while they hold the zone your special charges fast. Team up and break their hold!',
  'Tower Command: stand on the tower to push it toward their goal — four riders roll it 43% faster than one.',
  'Tower Command: checkpoints stop the tower until it clears them. Lose it for 5 s and the checkpoint fills back up.',
  'Tower Command: both teams on the tower stops it dead. Clear them off to keep it rolling.',
  'Tower Command: take the tower back on your own half and it rolls home to the middle even with nobody on — hop off and defend it.',
];
// Battle modes offered on the stage select (Zone Control: see src/game/zones.js)
const ZONE_GLYPH = '<svg class="iw-ico" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 21 V12 Q8 8 12 8 H21 M43 8 H52 Q56 8 56 12 V21 M56 43 V52 Q56 56 52 56 H43 M21 56 H12 Q8 56 8 52 V43" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="19" y="19" width="26" height="26" rx="5" fill="currentColor"/></svg>';
// Tower Command (src/game/tower.js): the tower — a platform on a track under a beacon
const TOWER_GLYPH = '<svg class="iw-ico" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round"><ellipse cx="32" cy="31" rx="16" ry="4.6" stroke-width="4.6"/><ellipse cx="32" cy="19.5" rx="11.5" ry="3.4" stroke-width="4"/><ellipse cx="32" cy="9.5" rx="7" ry="2.3" stroke-width="3.4"/></g><rect x="9" y="39" width="46" height="7" rx="2.5" fill="currentColor"/><path d="M13 48 H51 L47 58 H17 Z" fill="currentColor"/></svg>';
const MODE_INFO = {
  turf: { id: 'turf', label: 'TURF WAR', name: 'Turf War', icon: GLYPHS.drop, text: 'Ink the most ground before the clock runs out.' },
  zones: { id: 'zones', label: 'ZONE CONTROL', name: 'Zone Control', icon: ZONE_GLYPH, text: 'Hold the live zone to count down from 100 — first to 0 wins.' },
  tower: { id: 'tower', label: 'TOWER COMMAND', name: 'Tower Command', icon: TOWER_GLYPH, text: 'Ride the tower into their base — furthest push wins, reach their goal to knock out.' },
  boss: { id: 'boss', label: 'BOSS BATTLE', name: 'Boss Battle', icon: BOSS_GLYPH, text: `Your squad of 8 against ${BOSS_NAME}.` },
};
const modeOf = (m) => (m === 'zones' || m === 'tower' || m === 'boss' ? m : 'turf');
// the modes with a fixed 5:00 + overtime length (the length is locked on the stage select and in the lobby)
const fixedLen = (m) => m === 'zones' || m === 'tower';
const fixedDur = (m) => (m === 'tower' ? TOWER.duration : ZONES.duration) || 300;
// the battle modes (Turf War / Zone Control / Tower Command) — the rules cards, the in-match strip and the results use these
const BATTLE_MODES = [MODE_INFO.turf, MODE_INFO.zones, MODE_INFO.tower];
const ZK = '#15121c';
const zNum = (x, y, n, size = 16) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="'Titan One', sans-serif" font-size="${size}" fill="#fff" stroke="${ZK}" stroke-width="3.2" paint-order="stroke" stroke-linejoin="round">${n}</text>`;
const zPill = (x, y, w, hgt, cls, n, size) => `<g transform="translate(${x} ${y})"><rect width="${w}" height="${hgt}" rx="${hgt / 2.6}" fill="${ZK}"/><rect x="2.5" y="2.5" width="${w - 5}" height="${hgt - 5}" rx="${hgt / 3.2}" class="${cls}"/>${zNum(w / 2, hgt * 0.72, n, size)}</g>`;
const ZONE_FLOOR = `<path d="M10 60 L60 34 L110 60 L60 78 Z" fill="#f4ecdc" stroke="${ZK}" stroke-width="2.5" stroke-linejoin="round"/>`;
const ZONE_EDGE = `<path d="M30 58 L60 43 L90 58 L60 71 Z" fill="none" stroke="#fff" stroke-width="2.4" stroke-dasharray="5 3" stroke-linejoin="round"/>`;
const ZONE_RULE_ART = {
  take: `<svg viewBox="0 0 120 80" aria-hidden="true">${ZONE_FLOOR}
    <clipPath id="iw-zr-take"><path d="M30 58 L60 43 L90 58 L60 71 Z"/></clipPath>
    <g clip-path="url(#iw-zr-take)"><path class="iw-fa" d="${blobPath(54, 58, 26, { seed: 3, sy: 0.55, points: 11, wobble: 0.16 })}"/><path class="iw-fb" d="${blobPath(84, 60, 6, { seed: 8, sy: 0.55, points: 8, wobble: 0.25 })}"/></g>${ZONE_EDGE}
    <g transform="translate(12 9)"><rect width="66" height="13" rx="6.5" fill="${ZK}"/><rect x="3" y="3" width="48" height="7" rx="3.5" class="iw-fa"/><path d="M51.5 1 L51.5 12" stroke="#fff" stroke-width="2"/></g>
    <g transform="translate(82 6)"><rect width="30" height="19" rx="6" fill="${ZK}"/>${zNum(15, 14.5, '80%', 11)}</g>
  </svg>`,
  count: `<svg viewBox="0 0 120 80" aria-hidden="true">
    ${zPill(8, 10, 48, 30, 'iw-fa', '37', 17)}${zPill(64, 10, 48, 30, 'iw-fb', '100', 15)}
    <path d="M32 44 L32 60 M25 53 L32 61 L39 53" stroke="${ZK}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M32 44 L32 60 M25 53 L32 61 L39 53" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(46 56)"><rect width="46" height="20" rx="10" fill="#ffd54a" stroke="${ZK}" stroke-width="2.5"/><text x="23" y="14.5" text-anchor="middle" font-family="'Titan One', sans-serif" font-size="11" fill="${ZK}">0 = WIN</text></g>
  </svg>`,
  rotate: `<svg viewBox="0 0 120 80" aria-hidden="true">
    <rect x="18" y="6" width="84" height="68" rx="10" fill="#f4ecdc" stroke="${ZK}" stroke-width="2.5"/>
    <circle cx="60" cy="67" r="4.5" class="iw-fa" stroke="${ZK}" stroke-width="2"/><circle cx="60" cy="13" r="4.5" class="iw-fb" stroke="${ZK}" stroke-width="2"/>
    <path d="M49 48 L38 54 M71 32 L82 26" stroke="${ZK}" stroke-width="2.2" stroke-dasharray="3 3" stroke-linecap="round"/>
    <rect x="49" y="29" width="22" height="22" rx="3" fill="#ffd54a" stroke="${ZK}" stroke-width="2.4"/>
    <rect x="24" y="48" width="15" height="15" rx="3" fill="rgba(21,18,28,.1)" stroke="${ZK}" stroke-width="2.2" stroke-dasharray="4 3"/>
    <rect x="81" y="17" width="15" height="15" rx="3" fill="rgba(21,18,28,.1)" stroke="${ZK}" stroke-width="2.2" stroke-dasharray="4 3"/>
    ${GLYPHS.rotate.replace(/^<svg class="[^"]*"/, `<svg x="51.5" y="31.5" width="17" height="17" style="color:${ZK}"`)}
    <g transform="translate(20 64)"><rect width="22" height="13" rx="6.5" fill="${ZK}"/>${zNum(11, 10, '2s', 9)}</g>
    <g transform="translate(92 32)"><rect width="24" height="13" rx="6.5" fill="${ZK}"/>${zNum(12, 10, '½s', 9)}</g>
  </svg>`,
  penalty: `<svg viewBox="0 0 120 80" aria-hidden="true">${ZONE_FLOOR}
    <clipPath id="iw-zr-pen"><path d="M30 58 L60 43 L90 58 L60 71 Z"/></clipPath>
    <g clip-path="url(#iw-zr-pen)"><path class="iw-fb" d="${blobPath(64, 58, 26, { seed: 21, sy: 0.55, points: 11, wobble: 0.16 })}"/><path class="iw-fa" d="${blobPath(36, 60, 6, { seed: 4, sy: 0.55, points: 8, wobble: 0.25 })}"/></g>${ZONE_EDGE}
    ${zPill(10, 6, 44, 26, 'iw-fa', '62', 15)}
    <g transform="translate(58 8)"><rect width="34" height="20" rx="10" fill="#ff4d6a" stroke="${ZK}" stroke-width="2.5"/>${zNum(17, 15, '+12', 11)}</g>
    <path d="M100 26 L100 10 M94 16 L100 9 L106 16" stroke="#ff4d6a" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
};
// Tower Command rule cards: a side view of the track, the tower on it
const TW_TRACK = `<rect x="6" y="54" width="108" height="12" rx="6" fill="${ZK}"/><rect x="9" y="57" width="102" height="6" rx="3" fill="#f4ecdc"/>`;
const twPaint = (c) => (c[0] === '#' ? `fill="${c}"` : `class="${c}"`);
const twTower = (x, cls, riders = []) => `<g transform="translate(${x} 55)">
  ${riders.map(([rx, rc]) => `<circle cx="${rx}" cy="-15" r="4.6" ${twPaint(rc)} stroke="${ZK}" stroke-width="2.2"/>`).join('')}
  <rect x="-2.6" y="-34" width="5.2" height="24" fill="#fff" stroke="${ZK}" stroke-width="2"/>
  <circle cx="0" cy="-36" r="5" ${twPaint(cls)} stroke="${ZK}" stroke-width="2.4"/>
  <path d="M-17 -10 H17 L13 1 H-13 Z" ${twPaint(cls)} stroke="${ZK}" stroke-width="2.5" stroke-linejoin="round"/></g>`;
const twLit = (x0, x1, cls) => `<rect x="${x0}" y="57" width="${x1 - x0}" height="6" rx="3" class="${cls}"/><path d="M${x0 + 3} 60 H${x1 - 3}" stroke="#fff" stroke-width="1.6" stroke-dasharray="3 4" opacity=".8"/>`;
const twCp = (x, fill = '#ffd54a') => `<g transform="translate(${x} 60)"><path d="M0 -9 L9 0 L0 9 L-9 0 Z" fill="${fill}" stroke="${ZK}" stroke-width="2.4" stroke-linejoin="round"/></g>`;
const twPill = (x, y, w, text, fill = ZK, size = 10, color = '#fff') => `<g transform="translate(${x} ${y})"><rect width="${w}" height="17" rx="8.5" fill="${fill}" stroke="${ZK}" stroke-width="2.4"/><text x="${w / 2}" y="12.6" text-anchor="middle" font-family="'Titan One', sans-serif" font-size="${size}" fill="${color}">${text}</text></g>`;
const TOWER_RULE_ART = {
  ride: `<svg viewBox="0 0 120 80" aria-hidden="true">${TW_TRACK}${twLit(40, 111, 'iw-fa')}
    ${twTower(34, 'iw-fa', [[-11, 'iw-fa'], [-4, 'iw-fa'], [4, 'iw-fa'], [11, 'iw-fa']])}
    <path d="M60 36 H92 M84 29 L93 36 L84 43" stroke="${ZK}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M60 36 H92 M84 29 L93 36 L84 43" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${twPill(70, 6, 44, '×1.43', '#ffd54a', 11, ZK)}
  </svg>`,
  checkpoint: `<svg viewBox="0 0 120 80" aria-hidden="true">${TW_TRACK}${twLit(20, 70, 'iw-fa')}${twCp(30, '#8b8697')}
    ${twTower(62, 'iw-fa', [[-8, 'iw-fa'], [8, 'iw-fa']])}${twCp(80)}
    <g transform="translate(74 10)"><rect width="40" height="16" rx="8" fill="${ZK}"/><rect x="3" y="3" width="23" height="10" rx="5" class="iw-fa"/><path d="M26.5 2 V14" stroke="#fff" stroke-width="2"/></g>
    <g transform="translate(10 12)"><circle r="9" cx="9" cy="9" fill="#fff" stroke="${ZK}" stroke-width="2.4"/><path d="M9 3.5 V9 L13 11.5" stroke="${ZK}" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>
    ${twPill(31, 13, 22, '3s', ZK, 10)}
  </svg>`,
  goal: `<svg viewBox="0 0 120 80" aria-hidden="true">${TW_TRACK}${twLit(9, 90, 'iw-fa')}
    ${twTower(88, 'iw-fa', [[-6, 'iw-fa'], [6, 'iw-fa']])}
    <g transform="translate(106 60)"><circle r="10" fill="#fff" stroke="${ZK}" stroke-width="2.6"/><circle r="5.5" class="iw-fb" stroke="${ZK}" stroke-width="2"/></g>
    ${twPill(6, 8, 72, 'KNOCKOUT!', '#ffd54a', 10, ZK)}
    <path d="M14 45 H66" stroke="${ZK}" stroke-width="2.2" stroke-dasharray="3 3" stroke-linecap="round"/>
  </svg>`,
  contest: `<svg viewBox="0 0 120 80" aria-hidden="true">${TW_TRACK}
    ${twTower(50, '#ffd54a', [[-8, 'iw-fa'], [8, 'iw-fb']])}
    <g transform="translate(84 12)"><path d="M7 0 H19 L26 7 V19 L19 26 H7 L0 19 V7 Z" fill="#ff4d6a" stroke="${ZK}" stroke-width="2.4" stroke-linejoin="round"/><rect x="6" y="11" width="14" height="4.4" rx="1.4" fill="#fff"/></g>
    <path d="M100 48 a10 10 0 1 0 -4 8" stroke="${ZK}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M100 48 a10 10 0 1 0 -4 8" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    ${twPill(76, 60, 36, '5s', ZK, 10)}
  </svg>`,
};
// how a Zone Control match was decided, in plain words (winner's view / loser's view)
const ZONE_REASON = {
  knockout: ['KNOCKOUT!', 'Knocked out'],
  time: ["Time's up", "Time's up"],
  comeback: ['Comeback in overtime!', 'Overtaken in overtime'],
  retake: ['Held on in overtime', 'Stopped in overtime'],
  neutralised: ['Held on in overtime', 'Pushed off the zone in overtime'],
  'overtime-cap': ['Won at the overtime limit', 'Lost at the overtime limit'],
};
// … and a Tower Command match
const TOWER_REASON = {
  ...ZONE_REASON,
  neutralised: ['Held on in overtime', 'Lost the tower in overtime'],
  'sudden-death': ['Pulled ahead in overtime', 'Overtaken in overtime'],
};
const DIFF_INFO = {
  easy: { pips: 1, text: 'Relaxed bots with shaky aim. Great for learning the ropes.' },
  normal: { pips: 2, text: 'Balanced bots that push turf and fight back.' },
  hard: { pips: 3, text: 'Sharp, aggressive bots that punish mistakes. Bring your A-game.' },
};
// Boss Battle: the same three levels scale HULLBREAKER (HP, damage, pace) — the bots are on your side
const BOSS_DIFF_INFO = {
  easy: 'A sleepier crab: less HP, softer hits and longer breathers between attacks.',
  normal: 'The full HULLBREAKER. Dodge the tells, punish the openings.',
  hard: 'Tougher shell, harder hits, relentless pace. Bring the whole squad.',
};
const BOSS_DURATIONS = [180, 240, 300];
const STAT_LABELS = [['range', 'Range'], ['damage', 'Damage'], ['rate', 'Fire rate'], ['mobility', 'Mobility'], ['paint', 'Ink coverage']];
const KIND_LABEL = { shooter: 'Shooter', roller: 'Roller', charger: 'Charger', blaster: 'Blaster', dualies: 'Dualies', slosher: 'Slosher', splatling: 'Splatling', bucket: 'Bucket', spinner: 'Spinner', twins: 'Pistols', brush: 'Brush' };
const STAT_ICONS = { range: GLYPHS.target, damage: GLYPHS.bolt, rate: GLYPHS.clock, mobility: GLYPHS.feather, paint: GLYPHS.drop };
const LOCKER_TABS = [
  { id: 'kids', label: 'SQUIDKIDS', icon: 'users', sections: ['_presets'] },
  { id: 'hair', label: 'HAIR', icon: 'hair', sections: ['hair', 'hat'] },
  { id: 'face', label: 'FACE', icon: 'eye', sections: ['eyes', 'brows', 'skin'] },
  { id: 'outfit', label: 'OUTFIT', icon: 'shirt', sections: ['outfit'] },
];
const MENU_DESC = {
  play: 'Turf War, Zone Control or Tower Command 4 v 4 — or squad up against HULLBREAKER',
  online: 'Private rooms for up to 8 friends — create one or join with a room code',
  loadout: 'Choose your weapon, sub and special — or practice with it',
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
    { key: 'fpsCap', label: 'Frame rate limit', type: 'seg', options: [[0, 'Max'], [60, '60'], [30, '30']], help: 'Max follows your display (up to 120 Hz on ProMotion Macs). A 60 cap gives steadier pacing and longer battery life.' },
    // desktop app only (the Electron preload provides window.inkwaveNative)
    ...(typeof window !== 'undefined' && window.inkwaveNative ? [{ key: 'fullscreen', label: 'Fullscreen', type: 'toggle', help: 'Fill the whole display. Also ⌃⌘F or F11.' }] : []),
  ] },
  { id: 'audio', label: 'Audio', icon: 'speaker', rows: [
    { key: 'master', label: 'Master volume', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pctFmt, help: 'Overall loudness of everything.' },
    { key: 'music', label: 'Music', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pctFmt, help: 'Menu and battle soundtrack.' },
    { key: 'sfx', label: 'Sound effects', type: 'slider', min: 0, max: 1, step: 0.05, fmt: pctFmt, help: 'Weapons, splats, voices and menu sounds.' },
    { key: 'cues', label: 'Cues', type: 'slider', min: 0, max: 1.5, step: 0.05, fmt: pctFmt, help: 'The sounds that tell you what a sub or special is doing — throws, fuses, warnings, alerts — on top of Sound effects. 100 % is the standard mix; turn it up to hear them over a busy fight.' },
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
const tagTitle = (name) => { const x = fnv(String(name || '').toLowerCase()); return `${TITLE_ADJ[x % TITLE_ADJ.length]} ${TITLE_NOUN[(x >>> 8) % TITLE_NOUN.length]}`; };
const tagNum = (name) => '#' + String(1000 + (fnv('#' + String(name || '')) % 9000));

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
    if (NETMOCK) import('../net/mock.js').then((m) => { this._mockMod = m; }, (e) => console.error('[menus] netmock', e));
    this._news = new WhatsNew(this);   // "What's New" launch cards (src/ui/news.js): once per update, on the first main menu
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
    else if (opts.under && name) this._stack = [...opts.under, name];
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
    if (this._scr && this._scr.onKey && !this._modalBlocksKeys()) {
      const r = this._scr.onKey(e);
      if (r) { e.preventDefault(); this.setInputMode('kbm'); return true; }
    }
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
      KeyQ: 'tab_prev', KeyE: 'tab_next', PageUp: 'tab_prev', PageDown: 'tab_next', Tab: e.shiftKey ? 'tab_prev' : 'tab_next', KeyP: 'alt', KeyR: 'alt',
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

  _modalBlocksKeys() { return !!(this._modal && !this._modal.dataset.keys); }

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

  /** main.js: can this build show `name`? (online screens are new) */
  hasScreen(name) { return SCREENS.includes(name); }

  /** A short notification in the top-right corner (survives screen swaps). kind: 'info' | 'good' | 'error' | 'join' | 'leave'.
   *  `tag: { name, weapon }` leads with that player's mini splashtag (in `color`) instead of the icon. */
  toast(text, { kind = 'info', icon = null, color = null, ms = 3400, tag = null } = {}) {
    if (!text) return null;
    if (!this._toasts || !this._toasts.isConnected) { this._toasts = h('div', { class: 'iw-toasts', 'aria-live': 'polite' }); this.el.insertBefore(this._toasts, this.cursorEl); }
    const ico = icon || GLYPHS[kind === 'error' ? 'close' : kind === 'join' ? 'plus' : kind === 'leave' ? 'exit' : kind === 'good' ? 'check' : 'sparkle'];
    const W = tag && this._weapons()[tag.weapon];
    const lead = tag
      ? h('span', { class: 'iw-stag iw-toast__tag' }, h('span', { class: 'iw-stag__art', html: tagArt(fnv(String(tag.name).toLowerCase())) }),
        h('span', { class: 'iw-stag__w', html: weaponIcon((W && W.kind) || tag.weapon) }), h('span', { class: 'iw-stag__txt' }, h('span', { class: 'iw-stag__title' }, tagTitle(tag.name)), h('b', null, tag.name)))
      : h('i', { class: 'iw-toast__icon', html: ico });
    const t = h('div', { class: `iw-toast is-${kind}` + (tag ? ' has-tag' : '') }, lead, h('span', { class: 'iw-toast__text' }, String(text)));
    if (color) colorVars(t, 'tc', color);
    this._toasts.appendChild(t);
    const max = this.current === 'lobby' ? 2 : 4;   // the lobby's feed band is small: the newest two
    while (this._toasts.childElementCount > max) this._toasts.firstElementChild.remove();
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 420); }, ms);
    return t;
  }

  /** The lobby's match launch (countdown → everyone super-jumps out). Resolves when the screen can be taken over;
   *  immediately when the lobby isn't showing. The session awaits it between state 'starting' and building the match. */
  launchLobby() {
    if (this._launchP) return this._launchP;
    const s = this._scr;
    if (this.current !== 'lobby' || !s || !s.launch) return Promise.resolve();
    let fin = null;
    const p = new Promise((res) => { let done = false; fin = () => { if (!done) { done = true; res(); } }; });
    this._launchP = p;
    s.launch(fin);
    setTimeout(fin, 7000);
    p.then(() => { if (this._launchP === p) this._launchP = null; });
    return p;
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
    return { weapon: this._weapons()[w] ? w : 'shooter', sub: (l && l.sub) || null, special: (l && l.special) || null };
  }
  _weapons() { return this.api.weapons || WEAPONS; }
  _weaponOrder() { return this.api.weaponOrder || WEAPON_ORDER; }
  _specials() { return this.api.specials || SPECIALS; }
  _sub() { const id = this._loadout().sub, all = this.api.subs || SUB; return (id && all[id]) || this.api.sub || SUB.bomb; }
  _special() { const lo = this._loadout(), all = this._specials(); return (lo.special && all[lo.special]) || all[(this._weapons()[lo.weapon] || {}).special] || Object.values(all)[0]; }
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
    if (name === 'main') this._news.maybeShow();
  }

  /** mode: 'full' (organic ink pour; mid ≈ 380 ms, clear ≈ 1000 ms) · 'light' (quick swipe) · reduced motion → 'fade'. */
  _runWipe(mid, mode, dir = 1) {
    const [a, b] = this._accent();
    const m = mode || (prefersReducedMotion() ? 'fade' : 'full');
    this.wipe.run({ a, b, mode: m, dir, onMid: mid || null });
  }

  _go(name, opts = {}) { this.show(name, { ...opts, push: true }); }

  _back() {
    if (this._modal) { if (this._modal._onBack) this._modal._onBack(); else this._closeModal(); return; }
    if (performance.now() - this._shownAt < 200) return; // swallow the key that opened this screen
    const s = this._scr;
    if (s && s.onBack) { s.onBack(); return; }
    if (this._stack.length > 1) {
      this._sfx('ui_back');
      this.show(this._stack[this._stack.length - 2], { pop: true, back: true });
    } else if (['mode', 'loadout', 'setup', 'locker', 'settings', 'howto', 'credits', 'online'].includes(this.current)) {
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
    if (dir === 'tab_prev' || dir === 'tab_next' || dir === 'alt') return true;
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
    const sp = this._special();
    const sub = this._sub();
    const items = [
      { id: 'play', label: 'PLAY', sub: 'Turf · Zones · Tower · Boss Battle', icon: GLYPHS.play, cls: 'iw-btn--menu iw-btn--xl iw-btn--primary', accept: () => this._go('mode'), sound: 'ui_confirm' },
      { id: 'online', label: 'ONLINE', sub: 'Play with friends · private rooms', icon: GLYPHS.online, cls: 'iw-btn--menu iw-btn--online', accept: () => this._go('online'), sound: 'ui_confirm',
        badge: h('span', { class: 'iw-btn__live' }, h('i'), 'LIVE') },
      { id: 'loadout', label: 'LOADOUT', icon: weaponIcon(W.kind || lo.weapon), cls: 'iw-btn--menu', accept: () => this._go('loadout') },
      { id: 'locker', label: 'LOCKER', icon: GLYPHS.hanger, cls: 'iw-btn--menu', accept: () => this._go('locker') },
      { id: 'settings', label: 'SETTINGS', icon: GLYPHS.gear, cls: 'iw-btn--menu', accept: () => this._go('settings') },
      { id: 'howto', label: 'HOW TO PLAY', icon: GLYPHS.question, cls: 'iw-btn--menu', accept: () => this._go('howto') },
      { id: 'credits', label: 'CREDITS', icon: GLYPHS.star, cls: 'iw-btn--menu', accept: () => this._go('credits') },
    ];
    // the desktop app (electron/preload.cjs exposes inkwaveNative.quit) can close from here — never in a browser tab
    const native = typeof window !== 'undefined' && window.inkwaveNative && typeof window.inkwaveNative.quit === 'function' ? window.inkwaveNative : null;
    const quitBtn = native ? this._btn({ id: 'quitgame', label: 'QUIT GAME', icon: GLYPHS.exit || GLYPHS.close, cls: 'iw-btn--quitgame', sound: 'ui_click', accept: () => this._openModal({
      title: 'QUIT INKWAVE?', danger: true,
      text: 'Close the game and head back to your desktop?',
      buttons: [
        { label: 'KEEP PLAYING', accept: () => this._closeModal(), sound: null },
        { label: 'QUIT', cls: 'iw-btn--danger', sound: 'ui_confirm', accept: () => { this._closeModal(true); safeCall(() => native.quit()); } },
      ],
    }) }) : null;
    const tilts = [-2.2, 1.3, 1.4, -1.1, 1.6, -1.3, 1.1];
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
        h('span', { class: 'iw-chip' }, h('i', { html: SUB_ICONS[sub.id] || SUB_ICONS.bomb }), sub.name),
        h('span', { class: 'iw-chip' }, h('i', { html: specialIcon(sp.id) }), sp.name)));
    const el = h('div', { class: 'iw-screen iw-main' },
      h('div', { class: 'iw-scrim-left' }),
      h('div', { class: 'iw-main__logo iw-in iw-in--down', html: logoMarkup(GAME_TITLE, GAME_SUBTITLE, 'sm') }),
      h('nav', { class: 'iw-main__menu' }, btns),
      desc,
      h('div', { class: 'iw-main__side' }, profile, kit),
      h('div', { class: 'iw-corner iw-corner--bl iw-in' }, `v${this._version()}`),
      (() => { const pr = this._prompts([['Enter', 'A', 'Select'], ['Esc', 'B', 'Title']]); if (quitBtn) pr.prepend(quitBtn); return pr; })());   // (QUIT GAME leads the prompt row, bottom right)
    return {
      el, wrap: true, initial: btns[0],
      onFocus: (f) => {
        const t = MENU_DESC[f.dataset.id];
        if (t && descText.textContent !== t) { descText.textContent = t; restartAnim(desc, 'is-swap'); }
      },
      onBack: () => { this._sfx('ui_back'); this.show('title', { back: true }); },
    };
  }

  // ================================================================ SCREEN: mode (offline Play: Turf War | Zone Control | Tower Command | Boss Battle)
  _scr_mode() {
    const s = this._settings();
    const st = this._setup || (this._setup = { times: {} });
    const reduced = prefersReducedMotion();
    const cur = modeOf(st.mode || s.lastMode);
    const bossLen = [180, 240, 300].includes(s.bossLength) ? s.bossLength : 240;
    const MODES = [
      { id: 'turf', name: 'TURF WAR', kicker: 'CLASSIC', img: stageArt('tidewater', 'day'),
        blurb: 'Two teams of four, one harbour. Ink the most ground before the whistle.',
        chips: [[GLYPHS.users, '4 V 4'], [GLYPHS.clock, durLabel(s.matchLength || MATCH.defaultDuration || 180)], [GLYPHS.bot, 'VS BOTS']] },
      { id: 'zones', name: 'ZONE CONTROL', kicker: 'RANKED RULES', img: stageArt('crossmarket', 'day'),
        blurb: 'Take the live zone and hold it: your count ticks down from 100. The zone moves, so keep up!',
        chips: [[GLYPHS.users, '4 V 4'], [GLYPHS.clock, `${Math.round((ZONES.duration || 300) / 60)}:00 + OT`], [ZONE_GLYPH, 'ROTATING ZONES']] },
      { id: 'tower', name: 'TOWER COMMAND', kicker: 'RANKED RULES', img: stageArt('halyard', 'day'), badge: 'NEW!',
        blurb: 'Ride the tower into their base. Clear the checkpoints — reach their goal for a knockout!',
        chips: [[GLYPHS.users, '4 V 4'], [GLYPHS.clock, `${Math.round((TOWER.duration || 300) / 60)}:00 + OT`], [TOWER_GLYPH, 'MOVING TOWER']] },
      { id: 'boss', name: 'BOSS BATTLE', kicker: 'CO-OP', img: stageArt('kelpline', 'dusk'), badge: 'NEW!', beta: true,
        blurb: `Everyone's one squad against ${BOSS_NAME}, a giant crab in a rusted container. Sink it before time runs out!`,
        chips: [[GLYPHS.users, 'SQUAD OF 8'], [GLYPHS.clock, durLabel(bossLen)], [BOSS_GLYPH, '1 BOSS']] },
    ];
    let picking = false;
    const pick = (id, c) => {
      if (picking) return;
      picking = true;
      st.mode = id;
      this._setSetting('lastMode', id);
      this._sfx('ui_confirm'); this._sfx('splat_small', 0.06);
      restartAnim(c, 'is-pick');
      cards.forEach((x) => x.classList.toggle('is-picked', x === c));
      this._burstAt(c.querySelector('.iw-mode__tape'), { count: 16, dist: 10, size: 1.3, color: 'var(--mc)' });
      setTimeout(() => { picking = false; if (this.current === 'mode') this._go('setup'); }, reduced ? 0 : 260);
    };
    const cards = MODES.map((m, i) => {
      const img = h('img', { class: 'iw-mode__img', alt: '', draggable: 'false' });
      img.addEventListener('error', () => img.remove(), { once: true });
      img.src = m.img;
      const hero = m.id === 'boss'
        ? h('span', { class: 'iw-mode__hero is-boss', html: bossSilhouette() })
        : h('span', { class: 'iw-mode__hero is-turf' },
          h('i', { class: 'iw-mode__squid is-a', html: SQUID }),
          m.id === 'zones' || m.id === 'tower' ? h('i', { class: 'iw-mode__zone', html: m.id === 'tower' ? TOWER_GLYPH : ZONE_GLYPH }) : h('b', { class: 'iw-mode__vs iw-display' }, 'VS'),
          h('i', { class: 'iw-mode__squid is-b', html: SQUID }));
      const c = h('button', { class: `iw-mode iw-mode--${m.id} iw-in iw-in--pop`, style: { '--tilt': `${(MODES.length > 3 ? [-1.4, 0.8, -0.6, 1.4] : [-1.4, 0.6, 1.4])[i] ?? 0}deg` } },
        h('span', { class: 'iw-mode__art' }, img, h('i', { class: 'iw-mode__tint' }),
          h('span', { class: 'iw-mode__splat', html: splatSVG({ seed: 51 + i * 9, fill: 'var(--mc)', r: 58, arms: 9, drops: 5 }) }),
          hero, h('i', { class: 'iw-mode__glare' })),
        h('span', { class: 'iw-mode__kicker' }, m.kicker),
        m.beta ? h('span', { class: 'iw-beta iw-mode__beta' }, 'PUBLIC BETA') : null,
        h('span', { class: 'iw-mode__tape' }, h('span', { class: 'iw-display' }, m.name)),
        h('span', { class: 'iw-mode__blurb' }, m.blurb),
        h('span', { class: 'iw-mode__chips' }, m.chips.map(([ic, t]) => h('span', { class: 'iw-chip' }, h('i', { html: ic }), t))),
        m.badge ? h('span', { class: 'iw-mode__new' }, m.badge) : null,
        h('span', { class: 'iw-mode__go' }, h('i', { html: GLYPHS.play }), 'SELECT'));
      c.dataset.cur = 'own';
      c._mode = m.id;
      this._fx(c, { tilt: 7 });
      this._bind(c, { id: 'mode-' + m.id, accept: () => pick(m.id, c) });
      return c;
    });
    const bg = h('div', { class: 'iw-ss__bg' });
    const setBg = (id) => {
      const m = MODES.find((x) => x.id === id);
      const im = h('img', { class: 'iw-ss__bgimg', alt: '', draggable: 'false' });
      im.addEventListener('error', () => im.remove(), { once: true });
      im.src = m.img.replace('.webp', '-sm.webp');
      const olds = [...bg.children];
      bg.appendChild(im);
      requestAnimationFrame(() => requestAnimationFrame(() => im.classList.add('is-on')));
      setTimeout(() => olds.forEach((o) => o.remove()), 900);
    };
    const el = h('div', { class: 'iw-screen iw-modesel' },
      bg, h('div', { class: 'iw-ss__scrim' }),
      this._header('PLAY', { sub: 'Choose a mode · you and the bots' }),
      h('div', { class: 'iw-modesel__row' + (cards.length > 3 ? ' is-three is-four' : cards.length > 2 ? ' is-three' : '') }, cards),
      this._prompts([[['←', '→'], 'DPad', 'Mode'], ['Enter', 'A', 'Select'], ['Esc', 'B', 'Back']]));
    el.dataset.mode = cur;
    setBg(cur);
    const graph = new Map(cards.map((c, i) => [c, { left: cards[i - 1] || null, right: cards[i + 1] || null }]));
    return {
      el, initial: cards.find((c) => c._mode === cur) || cards[0],
      onFocus: (f) => { if (f && f._mode && f._mode !== el.dataset.mode) { el.dataset.mode = f._mode; setBg(f._mode); } },
      onNav: (dir) => this._graphNav(graph, dir),
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
    const maps = this._maps().filter((m) => !m.onlineOnly);   // (online-only stages live in the online lobby's picker)
    const diffs = this._diffs();
    const byId = (id) => maps.find((m) => m.id === id);
    const st = this._setup || (this._setup = { times: {} });
    st.mode = modeOf(st.mode || s.lastMode);   // picked on the mode screen (Play › mode), else the last one played
    const boss = st.mode === 'boss';
    const durations = boss ? BOSS_DURATIONS : (MATCH.durations || [90, 180]);
    const diffText = (v) => (boss ? BOSS_DIFF_INFO[v] : DIFF_INFO[v]?.text) || '';
    st.times = { ...(s.stageTimes || {}), ...(st.times || {}) };
    if (!byId(st.mapId)) st.mapId = byId(s.lastStage) ? s.lastStage : maps[0].id;
    st.difficulty = diffs[s.difficulty] ? s.difficulty : 'normal';
    st.duration = boss ? (durations.includes(s.bossLength) ? s.bossLength : 240) : durations.includes(s.matchLength) ? s.matchLength : (MATCH.defaultDuration || 180);
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
    const bossTag = boss ? h('div', { class: 'iw-ss__bosstag' }, h('span', { class: 'iw-ss__bossemb', html: bossEmblem() }), h('span', { class: 'iw-ss__bosstxt' }, h('small', null, 'BOSS'), h('b', { class: 'iw-display' }, BOSS_NAME))) : null;
    const frame = h('div', { class: 'iw-ss__frame' }, art, h('i', { class: 'iw-ss__sun' }), stars, h('i', { class: 'iw-ss__glare' }), h('i', { class: 'iw-ss__vig' }), counter, layoutEl, bossTag);
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
    // more stages than fit: compact tickets in a scrolling list (the focused one is kept in view)
    const listEl = h('div', { class: 'iw-ss__list' + (tickets.length > 3 ? ' is-many' : '') }, tickets);

    // ---- match options (bot skill + length)
    const dOpts = Object.values(diffs).map((d) => [d.id, h('span', { class: 'iw-diffopt' }, h('span', { class: 'iw-pips' }, Array.from({ length: 3 }, (_, k) => h('i', { class: k < (DIFF_INFO[d.id]?.pips || 2) ? 'on' : '' }))), d.name)]);
    const dText = h('div', { class: 'iw-setup__desc' });
    const diffSeg = this._seg(dOpts, st.difficulty, (v) => {
      st.difficulty = v; dText.textContent = diffText(v); restartAnim(dText, 'is-in');
      safeCall(() => this.api.setSettings && this.api.setSettings({ difficulty: v })); updateStart();
    });
    dText.textContent = diffText(st.difficulty);
    const diffRow = h('div', { class: 'iw-setrow iw-setrow--stack' }, h('div', { class: 'iw-setrow__label' }, h('i', { html: boss ? BOSS_GLYPH : GLYPHS.bot }), boss ? 'DIFFICULTY' : 'BOT SKILL'), diffSeg.el);
    this._bind(diffRow, { id: 'difficulty', type: 'row', adjust: diffSeg.adjust, accept: diffSeg.cycle });
    const lOpts = durations.map((d) => [d, durLabel(d)]);
    const lenSeg = this._seg(lOpts, st.duration, (v) => {
      st.duration = v; safeCall(() => this.api.setSettings && this.api.setSettings(boss ? { bossLength: v } : { matchLength: v })); updateStart();
    });
    // Zone Control and Tower Command always run 5:00 (+ overtime): the length shows locked and never touches the saved Turf War length
    const lenLockB = h('b'), lenLockEm = h('em');
    const lenLock = h('div', { class: 'iw-lenlock' }, lenLockB, h('span', null, '+ OVERTIME'), lenLockEm);
    const lenRow = h('div', { class: 'iw-setrow iw-setrow--stack' }, h('div', { class: 'iw-setrow__label' }, h('i', { html: GLYPHS.clock }), 'MATCH LENGTH'), lenSeg.el, lenLock);
    const lenLocked = () => { this._sfx('ui_error', 0.15); restartAnim(lenLock, 'is-edge-r'); };
    this._bind(lenRow, { id: 'length', type: 'row', adjust: (d) => (fixedLen(st.mode) ? lenLocked() : lenSeg.adjust(d)), accept: () => (fixedLen(st.mode) ? lenLocked() : lenSeg.cycle()) });
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
      // mode · stage · time (+ the length Turf War lets you pick; bot skill sits right beside it in its own panel)
      startSub.textContent = `${MODE_INFO[st.mode].name} · ${m ? m.name : ''} · ${TIME_INFO[timeOf(st.mapId)].label}${fixedLen(st.mode) ? '' : ` · ${durLabel(st.duration)}`}`;
      // long stage names: tighten the line a touch rather than cut it off
      requestAnimationFrame(() => {
        const box = startSub.parentElement;
        if (!box || !box.isConnected) return;
        box.classList.remove('is-tight');
        if (box.scrollWidth > box.clientWidth + 1) box.classList.add('is-tight');
      });
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

    const MI = MODE_INFO[st.mode];
    const head = this._header(MI.label, { sub: boss ? `Pick a stage and the time of day · your squad of 8 vs ${BOSS_NAME}`
      : fixedLen(st.mode) ? `Pick a stage and the time of day · 4 v 4 against bots · ${Math.round(fixedDur(st.mode) / 60)}:00 + overtime` : 'Pick a stage and the time of day · 4 v 4 against bots' });
    const el = h('div', { class: 'iw-screen iw-setup iw-ss' + (boss ? ' is-boss' : '') },
      bg, h('div', { class: 'iw-ss__scrim' }),
      head,
      h('div', { class: 'iw-ss__left' }, h('div', { class: 'iw-seclabel iw-in' }, h('i', { html: GLYPHS.map }), 'STAGES'), listEl, matchPanel),
      hero,
      h('div', { class: 'iw-ss__foot' }, weaponChip, lookChip, start),
      this._prompts([[['↑', '↓'], 'DPad', 'Stage'], [['←', '→'], null, 'Day · Dusk'], ['R', 'Y', 'Mode'], ['Enter', 'A', 'Select'], ['Esc', 'B', 'Back']]));
    el.querySelector('.iw-prompts').children[1].querySelector('.iw-padg').innerHTML = padGlyph('LB') + padGlyph('RB');

    // ---- the mode (picked on the mode screen): the locked Zone Control / Tower Command length, the START line
    const renderMode = () => {
      el.dataset.mode = st.mode;
      lenRow.classList.toggle('is-locked', fixedLen(st.mode));
      if (fixedLen(st.mode)) { lenLockB.textContent = `${Math.round(fixedDur(st.mode) / 60)}:00`; lenLockEm.textContent = MODE_INFO[st.mode].label; }
      updateStart();
    };

    // explicit focus graph (rows with ←/→ adjust would otherwise trap the pad in a column)
    const selTicket = () => tickets.find((x) => x._mid === st.mapId) || tickets[0];
    const graph = new Map();
    tickets.forEach((t, i) => graph.set(t, { up: tickets[i - 1] || null, down: tickets[i + 1] || diffRow }));
    const lenOrDiff = () => (fixedLen(st.mode) ? diffRow : lenRow);
    graph.set(tickets[0], { up: null, down: tickets[1] || diffRow });
    graph.set(diffRow, { up: selTicket, down: () => (fixedLen(st.mode) ? start : lenRow) });
    graph.set(lenRow, { up: diffRow, down: start });
    graph.set(tgl, { up: null, down: start });
    graph.set(weaponChip, { up: tgl, down: null, left: lenOrDiff, right: lookChip });
    graph.set(lookChip, { up: tgl, down: null, left: weaponChip, right: start });
    graph.set(start, { up: tgl, down: null, left: lookChip, right: null });

    tickets.forEach(refreshTicket);
    renderStage(false);
    renderMode();
    showArt('instant');
    setBg();
    return {
      el, initial: selTicket(),
      onFocus: (f) => {
        if (f._mid && this._navFocus) select(f._mid, 'nav', f);
        if (f._mid && listEl.classList.contains('is-many')) f.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      },
      onNav: (dir) => {
        if (dir === 'tab_prev' || dir === 'tab_next') { setTime(st.mapId, dir === 'tab_prev' ? 'day' : 'dusk', 'tab'); return true; }
        if (dir === 'alt') { this._sfx('ui_back'); this._go('mode'); return true; }   // R / Y: back to the mode cards
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
    const mode = modeOf(st.mode);
    // Zone Control / Tower Command have a fixed length (main uses ZONES / TOWER.duration) and never overwrite a saved length
    const cfg = { mode, mapId: st.mapId, time, difficulty: st.difficulty, ...(fixedLen(mode) ? {} : { duration: st.duration }) };
    safeCall(() => this.api.setSettings && this.api.setSettings({ difficulty: st.difficulty, lastStage: st.mapId, lastMode: mode, stageTimes: { ...(st.times || {}) },
      ...(fixedLen(mode) ? {} : { [mode === 'boss' ? 'bossLength' : 'matchLength']: st.duration }) }));
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
        // the loadout / online hub keep the kid on the pedestal (camera glides over); the lobby takes the stage back
        // itself; anything else sends it back into the ink
        if (sc && !['loadout', 'online', 'lobby'].includes(this.current)) safeCall(() => sc.hide());
      },
    };
  }


  // ================================================================ SCREEN: loadout
  _scr_loadout(opts = {}) {
    const inPractice = !!safeCall(() => this.api.isPractice && this.api.isPractice());
    const Ws = this._weapons();
    const order = this._weaponOrder().filter((id) => Ws[id]);
    let equipped = this._loadout().weapon;
    let shown = equipped;
    const specials = this._specials();
    const classOf = (w) => w.class || KIND_LABEL[w.kind] || (w.kind ? w.kind[0].toUpperCase() + w.kind.slice(1) : '');
    // "NEW" stickers for weapons the player hasn't looked at yet (the original four count as seen)
    const s0 = this._settings();
    const seen = new Set(Array.isArray(s0.seenWeapons) ? s0.seenWeapons : ['shooter', 'roller', 'charger', 'blaster']);
    const markSeen = (id) => { if (seen.has(id)) return; seen.add(id); this._setSetting('seenWeapons', [...seen]); };
    const prof = this._profile();

    // ---- weapon cards (grid scales 4 → 9+: 4 columns up to 8, then 5, compact past one screen)
    const n = order.length;
    const cols = n <= 4 ? Math.max(1, n) : n <= 8 ? 4 : n <= 12 ? 6 : 5;   // 9–12 weapons: two rows of six
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
    const statEls = STAT_LABELS.map(([k, label], i) => {
      const bar = h('span', { class: 'iw-stat__bar' }, h('i', { class: 'iw-stat__ghost' }), h('i', { class: 'iw-stat__fill' }), h('i', { class: 'iw-stat__ticks' }));
      const num = h('b', { class: 'iw-stat__num' }, '0');
      const delta = h('em', { class: 'iw-stat__delta' });
      const row = h('div', { class: 'iw-stat', style: { '--i': i } }, h('span', { class: 'iw-stat__label' }, h('i', { html: STAT_ICONS[k] || GLYPHS.star }), label), bar, num, delta);
      return { k, row, bar, num, delta, cur: 0, target: 0, shownInt: -1 };
    });
    // sub picker: Enter / click cycles, ← → steps through every sub (saved to the profile)
    const subIcon = h('span', { class: 'iw-kit__icon' }), subName = h('b'), subBlurb = h('span');
    const subChip = h('div', { class: 'iw-kit iw-kit--pick' }, subIcon,
      h('div', null, h('small', null, 'SUB ', h('i', { class: 'iw-kit__hint' }, '◀ ▶ CHANGE')), subName, subBlurb));
    const subOrder = this.api.subOrder || ['bomb'];
    const renderSub = () => {
      const sb = this._sub();
      subIcon.innerHTML = SUB_ICONS[sb.id] || SUB_ICONS.bomb;
      subName.textContent = sb.name;
      subBlurb.textContent = `${sb.blurb || ''} Uses ${Math.round(sb.inkCost)}% of your ink.`;
    };
    const cycleSub = (d) => {
      const i = subOrder.indexOf(this._sub().id);
      safeCall(() => this.api.setLoadout && this.api.setLoadout({ sub: subOrder[(i + d + subOrder.length) % subOrder.length] }));
      this._sfx('ui_toggle');
      renderSub();
      restartAnim(subChip, 'is-swap');
    };
    this._bind(subChip, { id: 'subpick', type: 'row', accept: () => cycleSub(1), adjust: (d) => cycleSub(d) });
    renderSub();
    const spIcon = h('span', { class: 'iw-kit__icon' });
    const spName = h('b'); const spBlurb = h('span'); const spCost = h('em', { class: 'iw-kit__cost' });
    const spChip = h('div', { class: 'iw-kit iw-kit--pick' }, spIcon, h('div', null, h('small', null, 'SPECIAL ', h('i', { class: 'iw-kit__hint' }, '◀ ▶ CHANGE')), h('div', { class: 'iw-kit__row' }, spName, spCost), spBlurb));
    const spOrder = this.api.specialOrder || Object.keys(specials);
    const renderSp = () => {
      const sp = this._special();
      spIcon.innerHTML = specialIcon(sp.id);
      spName.textContent = sp.name;
      spBlurb.textContent = sp.blurb || '';
    };
    const cycleSp = (d) => {
      const i = spOrder.indexOf(this._special().id);
      safeCall(() => this.api.setLoadout && this.api.setLoadout({ special: spOrder[(i + d + spOrder.length) % spOrder.length] }));
      this._sfx('ui_toggle');
      renderSp();
      restartAnim(spChip, 'is-swap');
    };
    this._bind(spChip, { id: 'specialpick', type: 'row', accept: () => cycleSp(1), adjust: (d) => cycleSp(d) });
    const detail = this._panel('iw-wd iw-in is-enter',
      h('div', { class: 'iw-wd__head' }, h('div', null, kind, nm), h('div', { class: 'iw-wd__badges' }, cmpBadge, eqBadge)),
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
      renderSp();
      renderSub();
      spCost.textContent = w.specialCost ? `${Math.round(w.specialCost)}p` : '';
      spCost.title = 'Turf points to fill the special gauge';
      markSeen(id);
      if (!first) restartAnim(detail, 'is-swap');
    };
    render(equipped);

    // practice: from the lobby it starts a solo session on a random stage; mid-practice it drops you back in (whatever
    // you equip here is already in your hands)
    const goPractice = () => {
      if (this._starting) return;
      if (inPractice) { this._resume(); return; }
      this._starting = true;
      this._burstAt(practiceBtn, { count: 16, dist: 10, size: 1.3, ring: true });
      this._sfx('splat_big');
      this._runWipe(() => {
        this._starting = false;
        safeCall(() => this.api.startPractice && this.api.startPractice());
        if (this.current === 'loadout') this.show(null, { instantLeave: true });
      });
    };
    const practiceBtn = this._btn({
      id: 'practice', icon: GLYPHS.play, cls: 'iw-btn--menu iw-btn--primary iw-loadout__practice iw-in iw-in--down', sound: 'ui_confirm', tilt: -1.2,
      label: inPractice ? 'BACK TO PRACTICE' : 'PRACTICE',
      sub: inPractice ? 'Your picks are already equipped' : 'Try this loadout on a random stage',
      accept: goPractice,
    });
    // ---- your squidkid (→ locker)
    const lookAv = h('span', { class: 'iw-lchip__av' }, h('span', { class: 'iw-lchip__blob', html: splatSVG({ seed: 17, cls: 'iw-fa', r: 62, arms: 8, drops: 0 }) }), h('span', { class: 'iw-lchip__squid', html: SQUID }));
    const lookChip = inPractice ? null : h('button', { class: 'iw-wchip iw-lchip iw-lchip--sm iw-in iw-in--down' }, lookAv,
      h('span', { class: 'iw-wchip__text' }, h('small', null, 'SQUIDKID'), h('b', null, prof.name)),
      h('span', { class: 'iw-wchip__edit' }, h('i', { html: GLYPHS.hanger }), 'LOCKER'));
    if (lookChip) {
      this._fx(lookChip);
      this._bind(lookChip, { id: 'look', accept: () => { this._sfx('ui_click'); this._go('locker'); } });
      this._portraitInto(lookAv, { kind: 'head', size: 128 });
    }
    const grid = h('div', { class: 'iw-wgrid' + (compact ? ' is-compact' : ''), style: { '--cols': cols } }, cards);
    const el = h('div', { class: 'iw-screen iw-loadout' },
      h('div', { class: 'iw-scrim-left' }),
      this._header('LOADOUT', { sub: inPractice ? 'Swap weapons and subs mid-practice — changes apply straight away' : 'Pick your weapon, sub and special — your squidkid shows it off on the right' }),
      practiceBtn,
      h('div', { class: 'iw-loadout__body' },
        h('div', { class: 'iw-seclabel iw-in' }, h('i', { html: WEAPON_ICONS.shooter }), 'WEAPON', h('span', { class: 'iw-seclabel__count' }, `${order.indexOf(equipped) + 1} / ${n}`)),
        grid,
        detail),
      lookChip ? h('div', { class: 'iw-loadout__look' }, lookChip) : null,
      this._prompts(opts.quick ? [['Enter', 'A', 'Equip'], ['Esc', 'B', 'Resume']] : [['Enter', 'A', 'Equip'], ['P', 'Y', inPractice ? 'Resume' : 'Practice'], ['Esc', 'B', 'Back']]));
    const countEl = el.querySelector('.iw-seclabel__count');
    let enterT = 0;
    return {
      el,
      initial: cards[order.indexOf(equipped)] || cards[0],
      onNav: (dir) => { if (dir === 'alt') { this._sfx('ui_confirm'); this._press(practiceBtn); goPractice(); return true; } return false; },
      // opened straight from practice play (L / View): back goes back into the game
      onBack: opts.quick ? () => { if (performance.now() - this._shownAt > 200) this._resume(); } : undefined,
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
        if (enterT > 1.6 && detail.classList.contains('is-enter')) detail.classList.remove('is-enter');
        for (const s of statEls) {
          if (!entered) continue;
          const delay = detail.classList.contains('is-enter') ? 0.3 + s.row.style.getPropertyValue('--i') * 0.07 : 0;
          if (enterT < delay) continue;
          s.cur += (s.target - s.cur) * (1 - Math.exp(-dt * 9));
          if (Math.abs(s.target - s.cur) < 0.4) s.cur = s.target;
          const n = Math.round(s.cur);
          if (n !== s.shownInt) { s.shownInt = n; s.num.textContent = String(n); }
        }
      },
      destroy: () => {},
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
      if (key === 'cues') safeCall(() => this.api.cuePreview && this.api.cuePreview());   // (hear the cue level you picked)
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
      if (row.onChange) row.onChange(v); else this._setSetting(row.key, v);
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
        } else if (P.cur && (key === 'master' || key === 'sfx') && (P.key === 'music' || P.key === 'sfx' || P.key === 'cues')) safeCall(() => P.cur.set(this._settings()[P.key], this._settings()));
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
      ['"Yeah!" cheer', null, K('C'), padGlyph('LS').replace(/>[^<]*</, '>↑<')],
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
    const zoneRules = [
      ['take', 'Take the zone', 'Ink 80% of the live zone to take it. Ink 40% of a zone they hold to knock it back to neutral.'],
      ['count', 'Count down from 100', 'Hold the zone and your count ticks down — 1 a second at the centre. First to 0, or lowest count at time up, wins.'],
      ['rotate', 'Zones rotate', 'Every 30–60 s the live zone swaps between the centre and a side zone: 1 point per 2 s on your half, per ½ s on theirs.'],
      ['penalty', 'Don’t lose it', 'If they take the zone from you, ¾ of what you counted since you took it becomes a penalty: your count won’t move until you count it off.'],
    ];
    const towerRules = [
      ['ride', 'Ride the tower', 'Ink its side and swim up onto it to take it: it rolls toward their base. More riders, more speed — up to ×1.43 with four aboard.'],
      ['checkpoint', 'Clear checkpoints', 'Checkpoints stop the tower until you clear them — cleared ones never stop it again. Lose it for 5 s and the checkpoint fills back up.'],
      ['goal', 'Push it home', 'Your count drops the further you push into their half. Reach their goal for a knockout — otherwise the furthest push wins.'],
      ['contest', 'Both on it? It stops', 'With both teams aboard the tower won’t move. Leave it empty for 5 s and it goes neutral and rolls back to the middle — on your own half, yours rolls home by itself meanwhile.'],
    ];
    const card = ([art, title, text], i, mode) => h('div', { class: 'iw-rule iw-in iw-in--pop', style: { '--tilt': `${[-1.2, 1, 0.8, -1][i]}deg` } },
      h('div', { class: 'iw-rule__art' + (mode !== 'turf' ? ' is-zone' : ''), html: (mode === 'tower' ? TOWER_RULE_ART : mode === 'zones' ? ZONE_RULE_ART : RULE_ART)[art] }),
      h('div', { class: 'iw-rule__num' }, String(i + 1)),
      h('div', { class: 'iw-rule__title' }, title),
      h('p', { class: 'iw-rule__text' }, text));
    const zoneNotes = () => h('div', { class: 'iw-howto__notes iw-in iw-in--up' },
      h('div', { class: 'iw-hnote' }, h('i', { html: GLYPHS.bolt }), h('span', null, h('b', null, 'Specials charge fast'), ' while the other team holds the zone — use them to break in.')),
      h('div', { class: 'iw-hnote' }, h('i', { html: GLYPHS.clock }), h('span', null, h('b', null, 'Overtime:'), ' at time up, the team behind plays on while it holds the zone.')));
    const towerNotes = () => h('div', { class: 'iw-howto__notes iw-in iw-in--up' },
      h('div', { class: 'iw-hnote' }, h('i', { html: GLYPHS.bolt }), h('span', null, h('b', null, 'Specials charge fast'), ' while your team holds the tower — and for the team behind while it sits neutral.')),
      h('div', { class: 'iw-hnote' }, h('i', { html: GLYPHS.clock }), h('span', null, h('b', null, 'Overtime:'), ' at time up, the team behind plays on while it holds the tower — until it takes the lead or loses the tower.')));
    const RULESETS = { turf: [rules, null], zones: [zoneRules, zoneNotes], tower: [towerRules, towerNotes] };
    const m0 = G.match && !G.match.attract && !G.match.practice ? G.match.mode : this._settings().lastMode;
    let rulesMode = RULESETS[m0] ? m0 : 'turf';   // (the rules cards cover the three battle modes)
    const rulesEl = h('div', { class: 'iw-howto__rules' });
    const notesSlot = h('div', { class: 'iw-howto__noteslot' });
    const renderRules = (anim) => {
      const [list, notes] = RULESETS[rulesMode];
      rulesEl.replaceChildren(...list.map((r, i) => card(r, i, rulesMode)));
      notesSlot.replaceChildren(...(notes ? [notes()] : []));
      if (headSub) headSub.textContent = `${MODE_INFO[rulesMode].name} in 30 seconds`;
      if (anim) restartAnim(rulesEl, 'is-swap');
    };
    const rOpts = BATTLE_MODES.map((mi) => [mi.id, h('span', { class: 'iw-segico' }, h('i', { html: mi.icon }), mi.label)]);
    const rSeg = this._seg(rOpts, rulesMode, (v) => { rulesMode = RULESETS[v] ? v : 'turf'; renderRules(true); });
    const rulesRow = h('div', { class: 'iw-ctl-switch iw-howto__modes iw-in' }, rSeg.el);
    this._bind(rulesRow, { id: 'rules', type: 'row', adjust: rSeg.adjust, accept: rSeg.cycle });
    let headSub = null;
    let mode = this._input;
    const listWrap = h('div', { class: 'iw-ctl-wrap' });
    const renderList = () => { listWrap.innerHTML = ''; listWrap.appendChild(this._controlsList(mode)); restartAnim(listWrap, 'is-in'); };
    const seg = this._seg([['kbm', h('span', { class: 'iw-segico' }, h('i', { html: GLYPHS.keyboard }), 'KEYBOARD & MOUSE')], ['pad', h('span', { class: 'iw-segico' }, h('i', { html: GLYPHS.gamepad }), 'CONTROLLER')]], mode, (v) => { mode = v; renderList(); });
    const segRow = h('div', { class: 'iw-ctl-switch' }, seg.el);
    this._bind(segRow, { id: 'scheme', type: 'row', adjust: seg.adjust, accept: seg.cycle });
    renderList();
    const head = this._header('HOW TO PLAY', { sub: `${MODE_INFO[rulesMode].name} in 30 seconds` });
    headSub = head.querySelector('.iw-head__sub');
    renderRules(false);
    const el = h('div', { class: 'iw-screen iw-howto' },
      h('div', { class: 'iw-scrim-full' }),
      head,
      h('div', { class: 'iw-howto__body' },
        h('div', { class: 'iw-howto__left' }, rulesRow, rulesEl, notesSlot),
        this._panel('iw-howto__ctl iw-in iw-in--right', h('div', { class: 'iw-seclabel' }, h('i', { html: GLYPHS.gamepad }), 'CONTROLS'), segRow, listWrap)),
      this._prompts([[['←', '→'], 'DPad', 'Switch'], [['↑', '↓'], null, 'Rules · Controls'], ['R', 'Y', 'Mode'], ['Esc', 'B', 'Back']]));
    return {
      el, initial: segRow,
      onNav: (dir) => {
        if (dir === 'tab_prev' || dir === 'tab_next') { seg.adjust(dir === 'tab_next' ? 1 : -1); return true; }
        if (dir === 'alt') { this._press(rulesRow); rSeg.cycle(); return true; }
        // two switches on this screen: the rules' mode (left) and the control scheme (right)
        if (dir === 'up' || dir === 'down') { const to = this._focus === rulesRow ? segRow : rulesRow; if (to !== this._focus) this._moveFocus(to, dir); return true; }
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
      sec('Original game', 'INKWAVE by Jayden Davis', h('p', { class: 'dim' }, 'MIT License · github.com/jaydendavisnc/inkwave')),
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

  // ================================================================ ONLINE: session plumbing
  _sc() { return (G.game && G.game.showcase) || null; }

  /** The live session (docs/NET.md). With ?netmock=1 the offline mock replaces whatever main.js installed. */
  _net() {
    if (NETMOCK && this._mockMod && !(G.net && G.net.isMock)) safeCall(() => this._mockMod.installMockNet());
    const n = G.net || null;
    if (n && n !== this._netBound && typeof n.on === 'function') this._bindNet(n);
    return n;
  }

  _bindNet(n) {
    for (const off of this._netOff || []) safeCall(off);
    this._netBound = n;
    this._netOff = [n.on('state', (e) => this._onNetState(e && e.state))];
  }

  // app-level reactions (the lobby screen handles its own events while it is up)
  _onNetState(state) {
    const n = this._netBound, cur = this.current;
    if (!n) return;
    if (state === 'starting') { if (cur === 'lobby') this.launchLobby(); return; }
    // the real flow is main.js' (startNetMatch hides us, netMatchEnd brings the lobby back); the mock has no match
    if (state === 'match') { if (n.isMock && cur === 'lobby') this.show(null, { instantLeave: true }); return; }
    if (state === 'lobby') { if (n.isMock && (cur === null || cur === 'results')) this.show('lobby'); return; }
    if ((state === 'error' || state === 'offline') && !this._leavingRoom) {
      if (cur === 'lobby' || (this._stack[0] === 'lobby' && cur)) this._roomGone(n.error || 'You left the room');
    }
  }

  /** The room went away under us (connection lost / closed): back to the hub with the reason. */
  _roomGone(msg) {
    const sc = this._sc();
    safeCall(() => sc && sc.leaveLobby && sc.leaveLobby());
    if (this._modal) this._closeModal(true);
    this.show('online', { wipe: true, back: true });
    const E = JOIN_ERR[msg];
    this.toast(E ? `${E.title[0]}${E.title.slice(1).toLowerCase()} — ${E.text.split('.')[0]}.` : msg, { kind: 'error', icon: GLYPHS[(E && E.icon) || 'exit'], ms: 5200 });
  }

  _teamColors() { return this._accent(); }

  /** Profile look / weapon / name → the room (after the locker, the loadout drawer or a rename). */
  _syncMe(net) {
    if (!net || !net.lobby) return;
    const me = (net.lobby.players || []).find((p) => p.you);
    if (!me) return;
    const prof = this._profile(), lo = this._loadout(), style = this._style();
    const ch = {};
    if (lo.weapon && lo.weapon !== me.weapon) ch.weapon = lo.weapon;
    // sub / special: the profile's own pick (null = the weapon's), so a weapon swap keeps its default kit
    if ((prof.sub || null) !== (me.sub || null)) ch.sub = prof.sub || null;
    if ((prof.special || null) !== (me.special || null)) ch.special = prof.special || null;
    if (prof.name && prof.name !== me.name) ch.name = prof.name;
    const a = me.style || {}, keys = new Set([...Object.keys(a), ...Object.keys(style)]);
    for (const k of keys) if (a[k] !== style[k]) { ch.style = { ...style }; break; }
    if (Object.keys(ch).length) safeCall(() => net.setMe(ch));
  }

  // ================================================================ SCREEN: online (hub — create / join)
  _scr_online() {
    const reduced = prefersReducedMotion();
    const sc = this._sc();
    const st = { mode: 'idle', code: ['', '', '', '', ''], pick: [0, 0, 0, 0, 0], caret: 0, busy: false, token: 0, input: 'kbm', alive: true, errT: 0 };
    this._net(); // bind early (and install the mock) so state events reach us

    // ---- CREATE: a loud striped sticker in the ONLINE ink (the main menu's ONLINE button is --b too)
    const createStatus = h('span', { class: 'iw-hubcard__status' });
    const create = h('button', { class: 'iw-hubcard iw-hubcard--create iw-in iw-in--left', style: { '--tilt': '-1.6deg' } },
      h('span', { class: 'iw-hubcard__bg' }, h('span', { class: 'iw-hubcard__ink' })),
      h('span', { class: 'iw-hubcard__blob', html: splatSVG({ seed: 71, cls: 'iw-fa', r: 58, arms: 9, drops: 2 }) }),
      h('span', { class: 'iw-hubcard__icon' }, h('i', { html: GLYPHS.flag }), h('b', { class: 'iw-hubcard__spin', html: SQUID })),
      h('span', { class: 'iw-hubcard__text' },
        h('span', { class: 'iw-hubcard__kicker iw-tape' }, h('i', { html: GLYPHS.crown }), 'YOU HOST'),
        h('span', { class: 'iw-hubcard__title' }, 'CREATE A ROOM'),
        h('span', { class: 'iw-hubcard__sub' }, 'Pick the stage, share the code, start when everyone’s ready.'),
        createStatus),
      h('span', { class: 'iw-hubcard__go' }, h('b', null, 'GO!'), this._hint('Enter', 'A')),
      h('span', { class: 'iw-hubcard__drips', html: dripsSVG([[46, 1.1], [120, 1.7], [168, 0.8], [300, 1.3], [352, 0.9]], 'iw-fhv') }));
    create.dataset.cur = 'own';
    this._fx(create, { tilt: 5 });

    // ---- JOIN (inline 5-box code entry)
    const boxes = st.code.map((_, i) => {
      const ch = h('b', { class: 'iw-code__ch' });
      const ghost = h('b', { class: 'iw-code__ghost' });
      const b = h('span', { class: 'iw-code__box', style: { '--i': i, '--tilt': `${[-3.5, 2.6, -1.8, 3.2, -2.6][i]}deg` } },
        h('i', { class: 'iw-code__arr is-up', html: GLYPHS.next }), ghost, ch, h('i', { class: 'iw-code__arr is-dn', html: GLYPHS.next }), h('i', { class: 'iw-code__caret' }));
      b._ch = ch; b._ghost = ghost;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this._setFocus(join); enterEntry(i); });
      return b;
    });
    const codeRow = h('div', { class: 'iw-code' }, boxes);
    const pasteBtn = h('button', { class: 'iw-minibtn iw-noclick', type: 'button', tabindex: '-1' }, h('i', { html: GLYPHS.paste }), 'PASTE');
    const joinBtn = h('button', { class: 'iw-minibtn is-go iw-noclick', type: 'button', tabindex: '-1' }, h('span', { class: 'iw-join__lbl' }, 'JOIN'), h('i', { html: GLYPHS.next }));
    pasteBtn.addEventListener('mousedown', (e) => e.preventDefault());
    joinBtn.addEventListener('mousedown', (e) => e.preventDefault());
    pasteBtn.addEventListener('click', (e) => { e.stopPropagation(); this._setFocus(join); readClipboard(); });
    joinBtn.addEventListener('click', (e) => { e.stopPropagation(); this._setFocus(join); if (st.mode === 'connecting') { cancelConnect(); return; } if (st.mode === 'idle') enterEntry(firstEmpty()); doJoin(); });
    const errIcon = h('i', { class: 'iw-jstat__icon' }), errTitle = h('b'), errText = h('span');
    const jstat = h('div', { class: 'iw-jstat' }, h('span', { class: 'iw-jstat__splat', html: splatSVG({ seed: 23, fill: '#ff3d5e', r: 56, arms: 8, drops: 3 }) }), errIcon, h('div', { class: 'iw-jstat__txt' }, errTitle, errText));
    const hintEl = h('span', { class: 'iw-join__hint' });
    const join = h('div', { class: 'iw-hubcard iw-hubcard--join iw-in iw-in--left', style: { '--tilt': '0.9deg' } },
      h('span', { class: 'iw-hubcard__bg' }, h('span', { class: 'iw-hubcard__ink' })),
      h('div', { class: 'iw-join__head' },
        h('span', { class: 'iw-hubcard__text' },
          h('span', { class: 'iw-hubcard__kicker iw-tape' }, h('i', { html: GLYPHS.key }), 'GOT A CODE?'),
          h('span', { class: 'iw-hubcard__title' }, 'JOIN A ROOM')),
        h('span', { class: 'iw-join__btns' }, pasteBtn, joinBtn)),
      codeRow,
      h('div', { class: 'iw-join__foot' }, hintEl, jstat));
    join.dataset.cur = 'own';
    this._fx(join, { tilt: 0, press: false });
    join.addEventListener('click', () => { if (st.mode === 'idle') enterEntry(firstEmpty()); });

    // ---- how it works: three little stickers, comic-strip style
    const steps = h('div', { class: 'iw-hub__steps iw-in iw-in--up' },
      [['1', 'Create or join', GLYPHS.flag], ['2', 'Share the code', GLYPHS.copy], ['3', 'Ready up & ink!', GLYPHS.check]].map(([n, t, ic], i) =>
        h('div', { class: 'iw-hubstep', style: { '--tilt': `${[-2, 1.5, -1][i]}deg` } }, h('b', { html: splatSVG({ seed: 30 + i * 7, cls: 'iw-fa', r: 56, arms: 8, drops: 2 }) }, h('span', null, n)), h('i', { html: ic }), h('span', null, t))));

    const body = h('div', { class: 'iw-hub__body' }, create, join, steps);

    // ---- you: your splashtag (the name on it is editable) + weapon + look (the kid stands on the pedestal to the right)
    const nameRow = this._nameRow();
    const lo = this._loadout(), W = this._weapons()[lo.weapon];
    const prof = this._profile();
    const tagArtEl = h('span', { class: 'iw-stag__art' }), tagTitleEl = h('span', { class: 'iw-stag__title' }), tagNumEl = h('span', { class: 'iw-stag__num' });
    const setTag = (name) => { tagArtEl.innerHTML = tagArt(fnv(String(name).toLowerCase())); tagTitleEl.textContent = tagTitle(name); tagNumEl.textContent = tagNum(name); };
    setTag(prof.name);
    nameRow._onChange = (v) => { setTag(v); restartAnim(stag, 'is-pick'); };
    const stag = h('div', { class: 'iw-stag iw-stag--big' },
      tagArtEl, h('span', { class: 'iw-stag__w', html: weaponIcon(W.kind || lo.weapon) }),
      h('span', { class: 'iw-stag__txt' }, tagTitleEl, nameRow), tagNumEl,
      h('span', { class: 'iw-stag__lv' }, h('small', null, 'LV'), String(prof.level)));
    colorVars(stag, 'tc', this._accent()[0]);
    const wChip = h('button', { class: 'iw-wchip iw-hub__chip iw-in iw-in--right' },
      h('span', { class: 'iw-wchip__icon', html: weaponIcon(W.kind || lo.weapon) }),
      h('span', { class: 'iw-wchip__text' }, h('small', null, 'WEAPON'), h('b', null, W.name)),
      h('span', { class: 'iw-wchip__edit' }, h('i', { html: GLYPHS.pencil })));
    this._fx(wChip);
    this._bind(wChip, { id: 'weapon', accept: () => { this._sfx('ui_click'); this._go('loadout'); } });
    const lookAv = h('span', { class: 'iw-lchip__av' }, h('span', { class: 'iw-lchip__blob', html: splatSVG({ seed: 17, cls: 'iw-fa', r: 62, arms: 8, drops: 0 }) }), h('span', { class: 'iw-lchip__squid', html: SQUID }));
    const lChip = h('button', { class: 'iw-wchip iw-lchip iw-hub__chip iw-in iw-in--right' }, lookAv,
      h('span', { class: 'iw-wchip__text' }, h('small', null, 'LOOK'), h('b', null, 'Locker')),
      h('span', { class: 'iw-wchip__edit' }, h('i', { html: GLYPHS.hanger })));
    this._fx(lChip);
    this._bind(lChip, { id: 'look', accept: () => { this._sfx('ui_click'); this._go('locker'); } });
    this._portraitInto(lookAv, { kind: 'head', size: 128 });
    const me = h('div', { class: 'iw-hub__me' },
      h('div', { class: 'iw-hub__metag iw-in iw-in--down' }, h('span', { class: 'iw-hub__metaglbl iw-tape' }, 'YOUR SPLASHTAG'), stag),
      h('div', { class: 'iw-hub__chips' }, wChip, lChip));

    const promptsIdle = this._prompts([['Enter', 'A', 'Select'], ['Esc', 'B', 'Back']]);
    const promptsEntry = this._prompts([['A–Z', null, 'Type'], [['↑', '↓'], 'DPad', 'Letter'], ['Enter', 'A', 'Join'], ['Esc', 'B', 'Cancel']]);
    promptsEntry.classList.add('is-entry');
    promptsEntry.children[0].classList.add('iw-kbm');
    const padClear = this._hint([], 'X', 'Clear');
    padClear.classList.add('iw-padg');
    promptsEntry.insertBefore(padClear, promptsEntry.children[1]);
    const promptsBusy = this._prompts([['Esc', 'B', 'Cancel']]);
    promptsBusy.classList.add('is-busy');
    const el = h('div', { class: 'iw-screen iw-online' },
      h('div', { class: 'iw-scrim-left' }),
      this._header('ONLINE', { sub: 'Private rooms · 4 v 4 · up to 8 squidkids' }),
      body, me, promptsIdle, promptsEntry, promptsBusy);

    // ---- code entry
    const firstEmpty = () => { const i = st.code.findIndex((c) => !c); return i < 0 ? 4 : i; };
    const full = () => st.code.every(Boolean);
    const render = () => {
      boxes.forEach((b, i) => {
        const c = st.code[i];
        if (b._ch.textContent !== c) b._ch.textContent = c;
        b.classList.toggle('is-filled', !!c);
        b.classList.toggle('is-caret', (st.mode === 'entry' || st.mode === 'error') && i === st.caret);
        b._ghost.textContent = !c && i === st.caret && st.input === 'pad' ? CODE_ABC[st.pick[i]] : '';
      });
      join.dataset.mode = st.mode;
      join.classList.toggle('is-entry', st.mode !== 'idle');
      joinBtn.classList.toggle('is-ready', full() && st.mode !== 'connecting');
      joinBtn.classList.toggle('is-cancel', st.mode === 'connecting');
      joinBtn.firstChild.textContent = st.mode === 'connecting' ? 'CANCEL' : 'JOIN';
      el.classList.toggle('is-connecting', st.mode === 'connecting' || create.classList.contains('is-busy'));
      el.classList.toggle('is-entry', st.mode === 'entry' || st.mode === 'error');
      if (st.mode === 'idle') hintEl.textContent = 'Room codes are 5 letters & numbers';
      else if (st.mode === 'entry') hintEl.textContent = full() ? 'Press JOIN (or Enter) to hop in' : st.input === 'pad' ? '↑↓ pick a letter · A to confirm' : 'Type or paste the code';
    };
    const setMode = (m) => { st.mode = m; render(); };
    const clearError = () => { if (st.mode === 'error') { st.mode = 'entry'; join.classList.remove('is-err'); jstat.classList.remove('is-on'); } };
    const enterEntry = (i = st.caret) => {
      if (st.busy) return;
      if (st.mode === 'idle') { this._sfx('ui_click'); restartAnim(codeRow, 'is-wake'); }
      clearError();
      st.caret = clamp(i, 0, 4);
      setMode('entry');
    };
    const exitEntry = () => { clearError(); setMode('idle'); this._sfx('ui_back'); };
    const bump = (i) => { restartAnim(boxes[i], 'is-pop'); };
    const type = (c) => {
      if (st.busy) return;
      if (st.mode === 'idle') enterEntry(firstEmpty());
      clearError();
      if (!CODE_ABC.includes(c)) {
        const hint = /[O0]/.test(c) ? 'No O or 0 in room codes — try the letter next to it' : /[I1]/.test(c) ? 'No I or 1 in room codes' : /[WASD]/.test(c) ? 'Room codes never use W, A, S or D' : 'Letters and numbers only';
        hintEl.textContent = hint; restartAnim(boxes[st.caret], 'is-shake'); this._sfx('ui_error', 0.12);
        return;
      }
      st.code[st.caret] = c;
      st.pick[st.caret] = CODE_ABC.indexOf(c);
      bump(st.caret);
      this._sfx('ui_toggle', 0.02);
      if (st.caret < 4) st.caret++;
      render();
      if (full() && st.caret === 4 && st.code[4] === c) { clearTimeout(st.autoT); st.autoT = setTimeout(() => { if (st.alive && st.mode === 'entry' && full()) doJoin(); }, 320); }
    };
    const backspace = () => {
      if (st.busy) return;
      clearError();
      clearTimeout(st.autoT);
      if (!st.code[st.caret] && st.caret > 0) st.caret--;
      if (st.code[st.caret]) { st.code[st.caret] = ''; bump(st.caret); this._sfx('ui_back', 0.04); }
      else this._sfx('ui_error', 0.15);
      render();
    };
    const moveCaret = (d) => {
      const n = clamp(st.caret + d, 0, 4);
      if (n === st.caret) { this._bump(boxes[st.caret], 'left'); this._sfx('ui_error', 0.15); return; }
      st.caret = n; this._sfx('ui_hover', 0.03); render();
    };
    const cycle = (d) => {
      clearError();
      const i = st.caret, cur = st.code[i] ? CODE_ABC.indexOf(st.code[i]) : st.pick[i] - (d > 0 ? 1 : -1);
      const n = (cur + d + CODE_ABC.length) % CODE_ABC.length;
      st.pick[i] = n; st.code[i] = CODE_ABC[n];
      restartAnim(boxes[i], d > 0 ? 'is-roll-up' : 'is-roll-dn');
      this._sfx('ui_slider', 0.03);
      render();
    };
    const padAccept = () => {
      if (!st.code[st.caret]) { st.code[st.caret] = CODE_ABC[st.pick[st.caret]]; bump(st.caret); }
      this._sfx('ui_toggle', 0.02);
      if (full() && st.caret === 4) { doJoin(); return; }
      if (st.caret < 4) st.caret++;
      else st.caret = firstEmpty();
      render();
    };
    const pasteCode = (text) => {
      // a pasted invite ("Join my room: K7QXM") → the 5-character word that can be a code; else the characters themselves
      const up = String(text || '').toUpperCase();
      let pick = (up.match(/\b[A-Z0-9]{5}\b/g) || []).reverse().find((w) => [...w].every((c) => CODE_ABC.includes(c)));
      if (!pick) { const raw = up.replace(/[^A-Z0-9]/g, ''); pick = raw.length <= 8 ? raw : ''; }
      const clean = [...pick].filter((c) => CODE_ABC.includes(c)).slice(0, 5);
      if (!clean.length) { hintEl.textContent = 'Nothing that looks like a room code on the clipboard'; this._sfx('ui_error'); restartAnim(codeRow, 'is-shake'); return; }
      if (st.mode === 'idle') enterEntry(0);
      clearError();
      st.code = ['', '', '', '', ''];
      clean.forEach((c, i) => { st.code[i] = c; st.pick[i] = CODE_ABC.indexOf(c); setTimeout(() => { if (st.alive) { bump(i); this._sfx('ui_toggle', 0.02); } }, reduced ? 0 : i * 55); });
      st.caret = Math.min(4, clean.length === 5 ? 4 : clean.length);
      render();
      if (clean.length === 5) { clearTimeout(st.autoT); st.autoT = setTimeout(() => { if (st.alive && full()) doJoin(); }, reduced ? 120 : 420); }
    };
    const readClipboard = () => {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(pasteCode, () => { enterEntry(firstEmpty()); hintEl.textContent = 'Press Ctrl+V (⌘V) to paste'; });
      } else { enterEntry(firstEmpty()); hintEl.textContent = 'Press Ctrl+V (⌘V) to paste'; }
    };
    const showError = (msg) => {
      const E = JOIN_ERR[msg] || { title: 'COULDN’T JOIN', text: msg || 'Something went wrong. Try again.', icon: 'close' };
      errIcon.innerHTML = GLYPHS[E.icon] || GLYPHS.close;
      errTitle.textContent = E.title; errText.textContent = E.text;
      jstat.classList.add('is-on'); restartAnim(jstat, 'is-in');
      join.classList.add('is-err'); restartAnim(codeRow, 'is-shake');
      st.mode = 'error'; st.caret = 4;
      this._sfx('ui_error');
      render();
    };
    const doJoin = async () => {
      if (st.busy) return;
      clearTimeout(st.autoT);
      const code = st.code.join('');
      if (code.length < 5) {
        st.caret = firstEmpty(); render();
        hintEl.textContent = `${5 - code.length} more character${5 - code.length > 1 ? 's' : ''} to go`;
        restartAnim(boxes[st.caret], 'is-shake'); this._sfx('ui_error', 0.12);
        return;
      }
      const net = this._net();
      if (!net) { showError('Could not connect'); return; }
      st.busy = true;
      const tok = ++st.token;
      jstat.classList.remove('is-on'); join.classList.remove('is-err');
      hintEl.textContent = `Connecting to room ${code}…`;
      setMode('connecting');
      this._sfx('ui_confirm');
      try {
        await net.join(code, this._profile().name);
        if (tok !== st.token || !st.alive) return;
        st.busy = false;
        this._sfx('splat_big');
        restartAnim(codeRow, 'is-yay');
        this.show('lobby', { wipe: true });
      } catch (e) {
        if (tok !== st.token || !st.alive) return;
        st.busy = false;
        showError(e && e.message);
      }
    };
    const cancelConnect = () => {
      st.token++; st.busy = false;
      safeCall(() => this._net() && this._net().leave());
      create.classList.remove('is-busy'); createStatus.textContent = '';
      el.classList.remove('is-connecting');
      hintEl.textContent = 'Cancelled';
      setMode(st.mode === 'connecting' ? 'entry' : st.mode);
      this._sfx('ui_back');
    };
    const doCreate = async () => {
      if (st.busy) return;
      const net = this._net();
      create.classList.remove('is-err');
      if (!net) { createStatus.textContent = 'Can’t reach the servers right now'; create.classList.add('is-err'); this._sfx('ui_error'); return; }
      st.busy = true;
      const tok = ++st.token;
      create.classList.add('is-busy');
      createStatus.textContent = 'Opening a room';
      el.classList.add('is-connecting');
      try {
        await net.create(this._profile().name);
        if (tok !== st.token || !st.alive) return;
        st.busy = false;
        this._sfx('splat_big');
        this.show('lobby', { wipe: true });
      } catch (e) {
        if (tok !== st.token || !st.alive) return;
        st.busy = false;
        create.classList.remove('is-busy');
        el.classList.remove('is-connecting');
        create.classList.add('is-err');
        const E = JOIN_ERR[e && e.message];
        createStatus.textContent = E ? `${E.title} — ${E.text}` : (e && e.message) || 'Couldn’t open a room';
        restartAnim(create, 'is-shake');
        this._sfx('ui_error');
      }
    };
    this._bind(create, { id: 'create', accept: () => { if (st.mode !== 'idle' && !st.busy) setMode('idle'); doCreate(); } });
    this._bind(join, {
      id: 'join', accept: (src) => {
        if (st.mode === 'connecting') return;
        if (st.mode === 'idle') { enterEntry(firstEmpty()); return; }
        if (src === 'key' && st.input === 'pad') { padAccept(); return; }
        doJoin();
      },
    });

    const onPaste = (e) => {
      const ae = document.activeElement;
      if (ae && ae.tagName === 'INPUT') return; // pasting into the name field
      const text = e.clipboardData && e.clipboardData.getData('text');
      if (!text) return;
      e.preventDefault();
      this._setFocus(join);
      pasteCode(text);
    };
    document.addEventListener('paste', onPaste);
    render();

    // explicit focus graph: cards on the left, you on the right
    const graph = new Map();
    graph.set(create, { down: join, up: null, right: () => nameRow });
    graph.set(join, { up: create, down: null, right: () => wChip });
    graph.set(wChip, { left: join, right: lChip, up: () => nameRow, down: null });
    graph.set(lChip, { left: wChip, right: null, up: () => nameRow, down: null });
    graph.set(nameRow, { down: wChip, left: create, up: null, right: null });

    return {
      el,
      initial: create,
      afterMount: () => {
        if (sc && sc.showHub) safeCall(() => sc.showHub(this._style(), (G.teamColors && G.teamColors[0]) || this._accent()[0], this._loadout().weapon));
      },
      onInputMode: (m) => { st.input = m; render(); },
      onKey: (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return false;          // ⌘V / Ctrl+V → the paste event
        const k = e.key;
        if (st.busy) { if (k === 'Escape' || k === 'Backspace') { cancelConnect(); return true; } return k.length === 1; }
        st.input = 'kbm';
        if (st.mode === 'entry' || st.mode === 'error') {
          if (/^[a-z0-9]$/i.test(k)) { if (!e.repeat) type(k.toUpperCase()); return true; }
          if (k === 'Backspace') { backspace(); return true; }
          if (k === 'Delete') { st.code[st.caret] = ''; render(); return true; }
          if (k === 'ArrowLeft') { moveCaret(-1); return true; }
          if (k === 'ArrowRight') { moveCaret(1); return true; }
          if (k === 'Enter' || k === 'NumpadEnter') { if (!e.repeat) doJoin(); return true; }
          if (k === 'Escape') { exitEntry(); return true; }
          if (k === 'Tab') { exitEntry(); return false; }
          if (k.length === 1 && k !== ' ') { type(k.toUpperCase()); return true; }
          return k === ' ';
        }
        // on the JOIN card, typing a code character jumps straight into the code; anywhere else on the hub, so does any
        // key a code can contain (codes skip W/A/S/D, which keep moving the cursor) — just type your friend's code
        if (/^[a-z0-9]$/i.test(k) && !e.repeat && (this._focus === join || CODE_ABC.includes(k.toUpperCase()))) {
          if (this._focus !== join) this._setFocus(join, { sound: false });
          enterEntry(firstEmpty()); type(k.toUpperCase()); return true;
        }
        return false;
      },
      onNav: (dir) => {
        if (st.busy) { if (dir === 'back') cancelConnect(); return true; }
        if (st.mode === 'entry' || st.mode === 'error') {
          if (this._focus !== join) { if (dir === 'back') { exitEntry(); return true; } return false; }
          if (dir === 'up' || dir === 'down') { st.input = this._input; cycle(dir === 'up' ? 1 : -1); return true; }
          if (dir === 'left' || dir === 'right' || dir === 'tab_prev' || dir === 'tab_next') { moveCaret(dir === 'left' || dir === 'tab_prev' ? -1 : 1); return true; }
          if (dir === 'accept') { if (this._input === 'pad') padAccept(); else doJoin(); return true; }
          if (dir === 'alt') { st.code = ['', '', '', '', '']; st.caret = 0; restartAnim(codeRow, 'is-shake'); this._sfx('ui_back'); render(); return true; }
          if (dir === 'back') { if (this._input === 'pad' && st.code.some(Boolean)) backspace(); else exitEntry(); return true; }
          return true;
        }
        return this._graphNav(graph, dir);
      },
      tick: () => {},
      destroy: () => {
        st.alive = false;
        clearTimeout(st.autoT);
        if (st.busy) { st.token++; st.busy = false; safeCall(() => this._net() && this._net().leave()); } // left mid-connect
        document.removeEventListener('paste', onPaste);
        const inp = nameRow._input;
        if (document.activeElement === inp) inp.blur();
        if (sc && !['loadout', 'locker', 'lobby'].includes(this.current)) safeCall(() => sc.hide());
      },
    };
  }

  // ================================================================ SCREEN: lobby (the room — line-up, settings, ready, start)
  _scr_lobby(opts = {}) {
    const reduced = prefersReducedMotion();
    const sc = this._sc();
    const net = this._net();
    const blank = { map: this._maps()[0].id, time: 'day', duration: 180, bots: true, difficulty: 'normal', mode: 'turf', players: [], maxPlayers: 8 };
    let lob = (net && net.lobby) || blank;
    const maps = this._maps(), diffs = this._diffs(), durations = MATCH.durations || [90, 180];
    const code = String((net && net.code) || '').toUpperCase().padEnd(5, '•').slice(0, 8);
    const players = () => (lob && lob.players) || [];
    const meP = () => players().find((p) => p.you) || null;
    const isHost = () => !!(net && net.isHost);
    const teamOf = (p) => (p && p.team === 1 ? 1 : 0);
    const colors = () => this._teamColors();
    const bossMode = () => lob.mode === 'boss';   // Boss Battle: one squad (team 0) vs HULLBREAKER (the session carries lobby.mode)
    const lobMode = () => modeOf(lob.mode);       // turf | zones | tower | boss
    const LOB_MODES = ['turf', 'zones', 'tower', 'boss'];
    const S = { launching: null, pendingTeam: null, teamPref: 'auto', emoteCd: 0, lastLobby: null, alive: true, copied: 0, subs: [], age: 0, joins: [], leaves: [], batchT: 0 };

    // ---- room code (top-left, big and proud)
    const tiles = [...code].map((c, i) => h('span', { class: 'iw-rc__tile', style: { '--i': i, '--tilt': `${[-4, 3, -2, 4, -3, 2, -3, 3][i]}deg` } }, c));
    const copyTxt = h('span', { class: 'iw-rc__copytxt' }, 'COPY');
    const copyBtn = h('button', { class: 'iw-rc__copy' }, h('i', { html: GLYPHS.copy }), copyTxt, this._hint('C', null));
    this._fx(copyBtn);
    const copied = h('span', { class: 'iw-rc__copied' }, h('i', { html: GLYPHS.check }), 'COPIED!');
    const leaveBtn = h('button', {
      class: 'iw-backbtn iw-lob__leave', type: 'button', tabindex: '-1',
      onmousedown: (e) => e.preventDefault(), onclick: () => askLeave(), onpointerenter: () => this._sfx('ui_hover', 0.05),
    }, h('span', { class: 'iw-backbtn__arrow', html: GLYPHS.back }), h('span', { class: 'iw-lob__leavetxt' }, 'LEAVE'), this._hint('Esc', 'B'));
    const roomCode = h('div', { class: 'iw-rc' },
      h('div', { class: 'iw-rc__ticket' },
        h('span', { class: 'iw-rc__back' }, h('i')),
        h('div', { class: 'iw-rc__label iw-tape' }, h('i', { html: GLYPHS.key }), 'ROOM CODE'),
        h('div', { class: 'iw-rc__row' }, h('div', { class: 'iw-rc__tiles' }, tiles), copyBtn, copied)),
      h('div', { class: 'iw-rc__share' }, 'Friends join from ', h('b', null, 'ONLINE › JOIN A ROOM')));
    const top = h('div', { class: 'iw-lob__top iw-in iw-in--down' }, leaveBtn, roomCode);

    // ---- room status (top-right): count, team pips, what we're waiting for
    const countEl = h('b');
    const pipsA = h('span', { class: 'iw-lob__pips is-a' }), pipsB = h('span', { class: 'iw-lob__pips is-b' });
    const statusTxt = h('span', { class: 'iw-lob__statustxt' });
    const status = h('div', { class: 'iw-lob__status iw-in iw-in--down' },
      h('div', { class: 'iw-lob__count' }, h('small', { class: 'iw-lob__countlbl' }, 'SQUIDKIDS'), countEl, h('small', null, '/8')),
      h('div', { class: 'iw-lob__teams' },
        h('div', { class: 'iw-lob__tline is-a' }, h('span', { class: 'iw-lob__tl is-a' }, TEAM_LABEL[0]), pipsA),
        h('em', { class: 'iw-lob__vs', html: splatSVG({ seed: 5, fill: '#15121c', r: 52, arms: 8, drops: 2 }) }, h('b', null, 'VS')),
        h('div', { class: 'iw-lob__tline is-b' }, h('span', { class: 'iw-lob__tl is-b' }, TEAM_LABEL[1]), pipsB)),
      statusTxt);
    const squadPips = h('span', { class: 'iw-lob__pips is-squad' });
    const bossVs = h('div', { class: 'iw-lob__bossvs' },
      h('div', { class: 'iw-lob__tline is-a' }, h('span', { class: 'iw-lob__tl is-a' }, 'SQUAD'), squadPips),
      h('em', { class: 'iw-lob__vs', html: splatSVG({ seed: 5, fill: '#15121c', r: 52, arms: 8, drops: 2 }) }, h('b', null, 'VS')),
      h('div', { class: 'iw-lob__bossside' }, h('span', { class: 'iw-lob__bossemb', html: bossEmblem() }), h('span', { class: 'iw-lob__bossname' }, h('small', null, 'BOSS'), h('b', null, BOSS_NAME))));
    status.insertBefore(bossVs, statusTxt);

    // ---- match settings (host edits; everyone sees)
    const hostName = h('b');
    const lock = h('span', { class: 'iw-lock' }, h('i', { html: GLYPHS.lock }), h('span', null, 'PICKED BY '), hostName);
    const hostChip = h('span', { class: 'iw-lock is-host' }, h('i', { html: GLYPHS.crown }), 'YOU’RE THE HOST');
    const stImgs = h('span', { class: 'iw-lstage__imgs' });
    const stName = h('span', { class: 'iw-lstage__name' });
    const stNum = h('span', { class: 'iw-lstage__num' });
    const stTime = h('span', { class: 'iw-lstage__time' }, h('i', { class: 'is-sun', html: GLYPHS.sun }), h('i', { class: 'is-moon', html: GLYPHS.moon }));
    const stArrows = h('span', { class: 'iw-lstage__arrows' }, h('i', { class: 'is-l', html: GLYPHS.back }), h('i', { class: 'is-r', html: GLYPHS.next }));
    const stage = h('div', { class: 'iw-lstage' }, stImgs, h('i', { class: 'iw-lstage__shade' }), stNum, h('span', { class: 'iw-lstage__tape' }, stName), stTime, stArrows);
    stArrows.children[0].addEventListener('click', (e) => { e.stopPropagation(); this._setFocus(stage); setMap(-1); });
    stArrows.children[1].addEventListener('click', (e) => { e.stopPropagation(); this._setFocus(stage); setMap(1); });
    const timeSeg = this._seg([['day', h('span', { class: 'iw-segico' }, h('i', { html: GLYPHS.sun }), 'DAY')], ['dusk', h('span', { class: 'iw-segico' }, h('i', { html: GLYPHS.moon }), 'DUSK')]], lob.time === 'dusk' ? 'dusk' : 'day', (v) => hostSet({ time: v }));
    const lenSegT = this._seg(durations.map((d) => [d, durLabel(d)]), lob.duration, (v) => hostSet({ duration: v }));
    const lenSegB = this._seg(BOSS_DURATIONS.map((d) => [d, durLabel(d)]), BOSS_DURATIONS.includes(lob.duration) ? lob.duration : 240, (v) => hostSet({ duration: v }));
    // Zone Control / Tower Command: a fixed 5:00 + overtime (as offline)
    const lenLockZB = h('b', null, `${Math.round(fixedDur(lobMode()) / 60)}:00`);
    const lenLockZ = h('div', { class: 'iw-lenlock' }, lenLockZB, h('span', null, '+ OVERTIME'));
    const lenZ = () => { if (fixedLen(lobMode())) { restartAnim(rLen, 'is-shake'); this._sfx('ui_error', 0.15); return true; } return false; };
    const lenSeg = { el: h('span', { class: 'iw-lob__lensegs' }, lenSegT.el, lenSegB.el, lenLockZ), adjust: (d) => lenZ() || (bossMode() ? lenSegB : lenSegT).adjust(d), cycle: () => lenZ() || (bossMode() ? lenSegB : lenSegT).cycle(),
      refresh: (v) => (bossMode() ? lenSegB : lenSegT).refresh(v) };
    const botTgl = this._toggle({ key: '_bots', onChange: (v) => hostSet({ bots: v }) }, lob.bots !== false);
    const dOpts = Object.values(diffs).map((d) => [d.id, h('span', { class: 'iw-diffopt' }, h('span', { class: 'iw-pips' }, Array.from({ length: 3 }, (_, k) => h('i', { class: k < (DIFF_INFO[d.id]?.pips || 2) ? 'on' : '' }))), d.name)]);
    const diffSeg = this._seg(dOpts, diffs[lob.difficulty] ? lob.difficulty : 'normal', (v) => hostSet({ difficulty: v }));
    const srow = (id, icon, label, ctl, extra) => {
      const r = h('div', { class: `iw-lset iw-lset--${id}` }, h('div', { class: 'iw-lset__label' }, h('i', { html: icon }), label, extra || null), ctl);
      r._id = id;
      return r;
    };
    const rStage = srow('stage', GLYPHS.map, 'STAGE', stage);
    // stage rules sticker (config onlineOnly / noBots — Cargo Terminal), slapped across the ticket's top edge
    const stRules = h('span', { class: 'iw-lstage__rules' }, h('i', { html: GLYPHS.users }), h('b'));
    rStage.querySelector('.iw-lset__label').appendChild(stRules);
    const rTime = srow('time', GLYPHS.sun, 'TIME', timeSeg.el);
    const rLen = srow('len', GLYPHS.clock, 'LENGTH', lenSeg.el);
    const rPair = h('div', { class: 'iw-lset__pair' }, rTime, rLen);
    // the room's ink colours (host picks; everyone's lobby and the match use them)
    const palIdx = () => (Number.isInteger(lob.palette) && TEAM_PALETTES[lob.palette] ? lob.palette : Math.max(0, TEAM_PALETTES.findIndex((p) => p.a.toLowerCase() === String(colors()[0]).toLowerCase())));
    const palSeg = this._seg(TEAM_PALETTES.map((p, i) => [i, h('span', { class: 'iw-palopt', title: p.names.join(' vs ') }, h('i', { style: { background: p.a } }), h('i', { style: { background: p.b } }))]), palIdx(), (v) => hostSet({ palette: v }));
    const palName = h('small', { class: 'iw-lset__note' });
    const rPal = srow('pal', GLYPHS.palette, 'INK', palSeg.el, palName);
    const botsNote = h('small', { class: 'iw-lset__note' });
    const rBots = srow('bots', GLYPHS.bot, 'FILL WITH BOTS', botTgl.el, botsNote);
    const rDiff = srow('diff', GLYPHS.swords, 'BOT SKILL', diffSeg.el);
    const diffLbl = rDiff.querySelector('.iw-lset__label');
    diffLbl.lastChild.textContent = '';   // label text lives in its own span so boss mode can rename it
    diffLbl.appendChild(h('span', { class: 'iw-lset__lbltxt' }, 'BOT SKILL'));
    // MODE (Turf War | Zone Control | Boss Battle): the panel's headline is the switch — ◀ ▶ for the host, read-only for guests
    const modeName = h('span', { class: 'iw-display iw-lob__modename' }, 'TURF WAR');
    const modeIco = h('b', { html: GLYPHS.flag });
    const modeArrows = h('span', { class: 'iw-lob__modearrows' }, h('i', { class: 'is-l', html: GLYPHS.back }), h('i', { class: 'is-r', html: GLYPHS.next }));
    const rMode = h('div', { class: 'iw-lset iw-lset--mode' },
      h('small', { class: 'iw-lob__modelbl' }, 'MODE'),
      h('span', { class: 'iw-lob__mode' }, h('i', { html: splatSVG({ seed: 12, cls: 'iw-fa', r: 56, arms: 8, drops: 3 }) }, modeIco), modeName, modeArrows),
      h('span', { class: 'iw-beta iw-beta--sm iw-lob__beta' }, 'PUBLIC BETA'));
    rMode._id = 'mode';
    modeArrows.children[0].addEventListener('click', (e) => { e.stopPropagation(); this._setFocus(rMode); setMode(-1); });
    modeArrows.children[1].addEventListener('click', (e) => { e.stopPropagation(); this._setFocus(rMode); setMode(1); });
    const setRows = [rMode, rStage, rTime, rLen, rPal, rBots, rDiff];
    for (const r of setRows) r.dataset.curPad = '2';   // the rail is dense: a tight ring that never covers the next label
    const side = h('div', { class: 'iw-lob__side iw-in iw-in--left' },
      h('div', { class: 'iw-lob__sidehead' }, rMode, lock, hostChip),
      h('div', { class: 'iw-lset__panel' }, rStage, rPair, rPal, rBots, rDiff,
        h('span', { class: 'iw-lset__drips', html: dripsSVG([[40, 1.2], [92, 0.7], [250, 1.6], [330, 0.9]], 'iw-fa') })));

    // ---- your controls (bottom bar)
    const Ws = this._weapons();
    const wIcon = h('span', { class: 'iw-wchip__icon' }), wName = h('b');
    const wChip = h('button', { class: 'iw-wchip iw-lob__wchip' }, wIcon, h('span', { class: 'iw-wchip__text' }, h('small', null, 'WEAPON'), wName), h('span', { class: 'iw-wchip__edit' }, h('i', { html: GLYPHS.pencil })));
    this._fx(wChip);
    const lookAv = h('span', { class: 'iw-lchip__av' }, h('span', { class: 'iw-lchip__blob', html: splatSVG({ seed: 17, cls: 'iw-fa', r: 62, arms: 8, drops: 0 }) }), h('span', { class: 'iw-lchip__squid', html: SQUID }));
    const lChip = h('button', { class: 'iw-wchip iw-lchip iw-lob__lchip', title: 'Locker' }, lookAv, h('span', { class: 'iw-lob__lbadge', html: GLYPHS.hanger }), h('small', { class: 'iw-lob__llbl' }, 'LOOK'));
    this._fx(lChip);
    this._portraitInto(lookAv, { kind: 'head', size: 128 });
    const teamSeg = this._seg([[0, h('span', { class: 'iw-teamopt is-a' }, h('i'), TEAM_LABEL[0])], ['auto', h('span', { class: 'iw-teamopt' }, h('i', { html: GLYPHS.rotate }), 'AUTO')], [1, h('span', { class: 'iw-teamopt is-b' }, h('i'), TEAM_LABEL[1])]], 'auto', (v) => requestTeam(v));
    const squadLock = h('span', { class: 'iw-lob__squadlock' }, h('i', { html: GLYPHS.lock }), h('b', null, 'SQUAD'), h('small', null, 'everyone vs the boss'));
    const teamRow = h('div', { class: 'iw-lob__team' }, h('small', { class: 'iw-lob__barlbl' }, 'TEAM', this._hint(['Q', 'E'], null)), teamSeg.el, squadLock);
    teamRow.querySelector('.iw-padg').innerHTML = padGlyph('LB') + padGlyph('RB');
    const emoteBtn = h('button', { class: 'iw-lob__emote' }, h('i', { class: 'iw-lob__emoteico', html: GLYPHS.smile }), h('span', null, 'EMOTE'), h('span', { class: 'iw-lob__emotekeys' }, this._hint(['1', '4'], null)), h('i', { class: 'iw-lob__cd' }));
    emoteBtn.querySelector('.iw-lob__emotekeys .iw-kbm').innerHTML = keycap('1') + '<em>–</em>' + keycap('4');
    this._fx(emoteBtn);
    const readySub = h('span', { class: 'iw-btn__sub' });
    const readyBtn = this._btn({ id: 'ready', label: 'READY?', icon: GLYPHS.check, cls: 'iw-btn--ready', sound: null, accept: () => toggleReady() });
    readyBtn.querySelector('.iw-btn__text').appendChild(readySub);
    readyBtn.append(h('span', { class: 'iw-ready__stamp', html: GLYPHS.check }), h('span', { class: 'iw-btn__key' }, this._hint('R', 'X')));
    const startSub = h('span', { class: 'iw-btn__sub' });
    const startBtn = this._btn({ id: 'start', label: 'START!', icon: GLYPHS.play, cls: 'iw-btn--start iw-btn--lobstart', sound: null, accept: () => tryStart() });
    startBtn.querySelector('.iw-btn__text').appendChild(startSub);
    startBtn.append(h('span', { class: 'iw-start__chev' }, h('i'), h('i'), h('i')), h('span', { class: 'iw-btn__key' }, this._hint('R', 'X')));
    const bar = h('div', { class: 'iw-lob__bar iw-in iw-in--up' },
      h('div', { class: 'iw-lob__you' }, wChip, lChip), teamRow, emoteBtn, h('span', { class: 'iw-lob__grow' }), readyBtn, startBtn);

    // ---- nameplates over the 3D line-up
    const platesEl = h('div', { class: 'iw-lob__plates', 'aria-hidden': 'true' });
    const plates = new Map();
    const open = Array.from({ length: 8 }, (_, k) => {
      const row = k >> 2, i = k & 3;
      const txt = h('b', null, 'OPEN');
      const e = h('div', { class: 'iw-plate is-open' + (row ? ' is-back' : '') }, h('div', { class: 'iw-plate__stack' }, h('div', { class: 'iw-plate__ghost' }, h('i', { class: 'iw-plate__plus', html: GLYPHS.plus }), txt)));
      platesEl.appendChild(e);
      return { el: e, row, i, txt, on: false, sig: '' };
    });

    // ---- countdown / launch overlay
    const cdNum = h('b', { class: 'iw-lcd__num' });
    const cdSub = h('span', { class: 'iw-lcd__sub' });
    const countdown = h('div', { class: 'iw-lcd', 'aria-live': 'assertive' }, h('span', { class: 'iw-lcd__rays' }), h('span', { class: 'iw-lcd__splat', html: splatSVG({ seed: 88, cls: 'iw-fself', r: 60, arms: 10, drops: 6 }) }), cdNum, cdSub);

    const prompts = this._prompts([['R', 'X', 'Ready'], [['1', '4'], null, 'Emote'], [['Q', 'E'], null, 'Team'], ['C', null, 'Copy code'], ['Esc', 'B', 'Leave']]);
    prompts.children[1].querySelector('.iw-kbm').innerHTML = keycap('1') + '<em class="iw-dash">–</em>' + keycap('4');
    prompts.children[1].classList.add('iw-kbm'); prompts.children[3].classList.add('iw-kbm'); // pad: emotes live on the EMOTE wheel
    prompts.children[2].querySelector('.iw-padg').innerHTML = padGlyph('LB') + padGlyph('RB');
    prompts.children[2].classList.add('iw-lob__teamprompt');   // hidden in boss mode (one squad)
    const el = h('div', { class: 'iw-screen iw-lobby' },
      h('div', { class: 'iw-lob__scrim' }), platesEl, h('div', { class: 'iw-lob__band iw-in iw-in--up', html: inkBand(9) }), top, status, side, bar, countdown, prompts);

    // ================================================ behaviour
    const hostSet = (o) => {
      if (!isHost() || S.launching) return;
      safeCall(() => net.setSettings(o));
      // remember the host's picks for the next room they open
      if (o.map) this._setSetting('lastStage', o.map);
      if (o.time) this._setSetting('stageTimes', { ...(this._settings().stageTimes || {}), [lob.map]: o.time });
    };
    // the stages this room's mode can use: Boss Battle never lists a noBoss stage
    const stageList = () => (bossMode() ? maps.filter((m) => mapBossOk(m.id)) : maps);
    const setMap = (d) => {
      if (!isHost()) { this._bump(stage, 'left'); this._sfx('ui_error', 0.15); return; }
      const list = stageList();
      const i = list.findIndex((m) => m.id === lob.map);
      const n = list[(i + d + list.length) % list.length];
      lob = { ...lob, map: n.id, bots: mapNoBots(n.id) ? false : lob.bots };
      renderStage(d);
      this._sfx('ui_toggle'); this._sfx('splat_small', 0.06);
      hostSet({ map: n.id });
    };
    const setMode = (d) => {
      if (!isHost()) { this._bump(rMode, d < 0 ? 'left' : 'right'); this._sfx('ui_error', 0.15); return; }
      const next = LOB_MODES[(LOB_MODES.indexOf(lobMode()) + (d < 0 ? -1 : 1) + LOB_MODES.length) % LOB_MODES.length];
      // keep the length sensible for the mode (boss fights run 3–5 min, 4 by default; Zone Control / Tower Command are 5:00 + overtime)
      const dur = next === 'boss' ? 240 : fixedLen(next) ? fixedDur(next) : (durations.includes(lob.duration) ? lob.duration : (MATCH.defaultDuration || 180));
      // a stage with no Boss Battle (Cargo Terminal) hands the room to a boss-eligible one (the session does the same)
      const was = maps.find((m) => m.id === lob.map);
      const map = next === 'boss' && !mapBossOk(lob.map) ? bossFallbackMap(lob.map) : lob.map;
      lob = { ...lob, mode: next, duration: dur, map };
      this._sfx('ui_toggle'); this._sfx(next === 'boss' ? 'splat_big' : 'splat_small', 0.06);
      restartAnim(rMode, 'is-hit');
      render(false);
      hostSet(map !== (was && was.id) ? { mode: next, duration: dur, map } : { mode: next, duration: dur });
      if (map !== (was && was.id)) { const n = maps.find((m) => m.id === map); this.toast(`${was ? was.name : 'That stage'} has no Boss Battle — switched to ${n ? n.name : 'another stage'}`, { icon: GLYPHS.map }); }
    };
    let shownMap = null, shownTime = null;
    const renderStage = (dir = 0) => {
      const m = maps.find((x) => x.id === lob.map) || maps[0], time = lob.time === 'dusk' ? 'dusk' : 'day';
      // (the count follows the mode's stage list, so it refreshes on a mode switch too)
      const list = stageList(), k = list.indexOf(m);
      stNum.innerHTML = `STAGE <b>${String((k < 0 ? maps.indexOf(m) : k) + 1).padStart(2, '0')}</b><em>/ ${String(list.length).padStart(2, '0')}</em>`;
      if (m.id === shownMap && time === shownTime) return;
      const first = shownMap === null;
      shownMap = m.id; shownTime = time;
      const img = h('img', { class: 'iw-lstage__img', alt: '', draggable: 'false' });
      img.addEventListener('error', () => { img.replaceWith(h('span', { class: 'iw-lstage__img iw-lstage__fb', html: m.thumb || mapThumb(m, 3) })); }, { once: true });
      img.src = stageArt(m.id, time, true);
      const olds = [...stImgs.children];
      if (!first && !reduced) img.style.setProperty('--dir', dir < 0 ? -1 : 1), img.classList.add(dir ? 'is-slide' : 'is-fade');
      stImgs.appendChild(img);
      setTimeout(() => olds.forEach((o) => o.remove()), first ? 0 : 520);
      stName.textContent = m.name;
      stage.dataset.time = time;
      const rules = [m.onlineOnly ? 'ONLINE ONLY' : '', m.noBots ? 'NO BOTS' : ''].filter(Boolean).join(' · ');
      stRules.lastChild.textContent = rules;
      rStage.classList.toggle('has-rules', !!rules);
      if (!first) { restartAnim(stage, 'is-hit'); restartAnim(stName, 'is-in'); }
    };
    const flash = (row) => { if (!isHost()) restartAnim(row, 'is-flash'); };

    const copyCode = () => {
      const c = (net && net.code) || code;
      const ok = () => {
        this._sfx('ui_confirm'); this._sfx('splat_small', 0.06);
        tiles.forEach((t) => restartAnim(t, 'is-wave'));
        restartAnim(copied, 'is-on'); copyTxt.textContent = 'COPIED'; S.copied = 2.2;
        this._burstAt(copyBtn, { count: 10, dist: 5, size: 0.8 });
      };
      const fallback = () => {
        let done = false;
        try {
          const ta = h('textarea', { style: 'position:fixed;left:-9999px;top:0;opacity:0' });
          ta.value = c; document.body.appendChild(ta); ta.select();
          done = document.execCommand && document.execCommand('copy');
          ta.remove();
        } catch (e) { done = false; }
        if (done) ok(); else { this._sfx('ui_error'); this.toast(`Couldn’t reach the clipboard — the code is ${c}`, { kind: 'error', icon: GLYPHS.copy }); }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c).then(ok, fallback);
      else fallback();
    };
    this._bind(copyBtn, { id: 'copy', accept: () => copyCode() });

    const askLeave = () => {
      if (S.launching || this._modal) return;
      const others = players().filter((p) => !p.you);
      const heir = isHost() && others.length ? others[0].name : null;
      this._openModal({
        title: 'LEAVE ROOM?', danger: true,
        text: heir ? `You’re the host — ${heir} takes over the room. You can come back with the code ${code}.`
          : others.length ? `You can rejoin any time with the code ${code} while the room is open.` : 'You’re the last one here — the room closes when you leave.',
        buttons: [
          { label: 'STAY', accept: () => this._closeModal(), sound: null },
          { label: 'LEAVE', cls: 'iw-btn--danger', sound: 'ui_confirm', accept: () => { this._closeModal(true); leaveRoom(); } },
        ],
      });
    };
    const leaveRoom = () => {
      this._leavingRoom = true;
      safeCall(() => net && net.leave());
      safeCall(() => sc && sc.leaveLobby && sc.leaveLobby());
      this._leavingRoom = false;
      this.show('online', { wipe: true, back: true });
    };

    const toggleReady = () => {
      if (isHost()) { tryStart(); return; }
      const me = meP();
      if (!me || S.launching) return;
      const v = !me.ready;
      safeCall(() => net.setMe({ ready: v }));
      me.ready = v; // optimistic
      this._sfx(v ? 'ui_confirm' : 'ui_back'); if (v) this._sfx('splat_small', 0.06);
      this._press(readyBtn);
      if (v) this._burstAt(readyBtn, { count: 14, dist: 8, size: 1.1, color: '#3ddc84' });
      renderBar();
    };
    const tryStart = () => {
      if (!isHost() || S.launching) return;
      if (!net.canStart()) {
        this._sfx('ui_error'); restartAnim(startBtn, 'is-shake');
        const waiting = players().filter((p) => !p.you && !p.ready && !p.host);
        const block = net.startBlock ? net.startBlock() : null;
        this.toast(block || (waiting.length ? `Waiting for ${listNames(waiting)} to ready up` : 'Not ready to start yet'), { kind: 'info', icon: block ? GLYPHS.users : GLYPHS.clock });
        return;
      }
      this._sfx('ui_confirm'); this._sfx('splat_big', 0.1);
      this._burstAt(startBtn, { count: 18, dist: 11, size: 1.4, ring: true });
      safeCall(() => net.start());
    };
    const listNames = (ps) => (ps.length <= 2 ? ps.map((p) => p.name).join(' & ') : `${ps.slice(0, 2).map((p) => p.name).join(', ')} +${ps.length - 2}`);

    const requestTeam = (v) => {
      if (bossMode()) { restartAnim(teamRow, 'is-shake'); this._sfx('ui_error', 0.15); return; }
      S.teamPref = v;
      teamRow.dataset.pick = String(v);
      const me = meP();
      if (!me || S.launching) return;
      safeCall(() => net.setMe({ team: v }));
      if (v !== 'auto' && teamOf(me) !== v) S.pendingTeam = { team: v, t: 0 };
    };

    const doEmote = (id) => {
      if (S.launching) return;
      if (S.emoteCd > 0) { restartAnim(emoteBtn, 'is-shake'); return; }
      S.emoteCd = 1.3;
      emoteBtn.style.setProperty('--cd', '1');
      restartAnim(emoteBtn, 'is-cd');
      safeCall(() => net.emote(id));
      this._sfx('ui_confirm', 0.05);
    };
    const openEmotes = () => {
      if (S.launching || this._modal) return;
      const btns = EMOTES.map((E) => {
        const b = h('button', { class: `iw-emo iw-emo--${E.dir}` }, h('i', { html: GLYPHS[E.icon] }), h('b', null, E.label), h('span', { class: 'iw-emo__key' }, h('span', { class: 'iw-kbm', html: keycap(E.key) }), h('span', { class: 'iw-padg', html: `<span class="iw-pad iw-pad--sys iw-dpad iw-dpad--${E.dir}">${GLYPHS.next}</span>` })));
        this._fx(b);
        this._bind(b, { id: 'emo-' + E.id, accept: () => { this._closeModal(true); doEmote(E.id); } });
        b._emo = E;
        return b;
      });
      const r = emoteBtn.getBoundingClientRect();
      const wheel = h('div', { class: 'iw-emowheel' }, h('div', { class: 'iw-emowheel__card', style: { left: `${r.left + r.width / 2}px`, top: `${r.top}px` } }, h('span', { class: 'iw-emowheel__hub', html: GLYPHS.smile }), btns));
      wheel.dataset.keys = '1';
      wheel.addEventListener('pointerdown', (e) => { if (e.target === wheel) this._closeModal(); });
      el.appendChild(wheel);
      this._modalPrev = emoteBtn;
      this._modal = wheel;
      this._setFocus(btns[0], { snap: true });
      this._sfx('ui_click');
    };
    this._bind(emoteBtn, { id: 'emote', accept: () => openEmotes() });

    const openLoadout = () => {
      if (S.launching || this._modal) return;
      const order = this._weaponOrder().filter((id) => Ws[id]);
      let equipped = this._loadout().weapon;
      const kind = h('span', { class: 'iw-wd__kind' }), nm = h('span', { class: 'iw-wd__name iw-display' }), blurb = h('p', { class: 'iw-wd__blurb' });
      const statEls = STAT_LABELS.map(([k, label], i) => {
        const bar = h('span', { class: 'iw-stat__bar' }, h('i', { class: 'iw-stat__ghost' }), h('i', { class: 'iw-stat__fill' }), h('i', { class: 'iw-stat__ticks' }));
        return { k, bar, row: h('div', { class: 'iw-stat', style: { '--i': i } }, h('span', { class: 'iw-stat__label' }, h('i', { html: STAT_ICONS[k] || GLYPHS.star }), label), bar) };
      });
      const kits = h('div', { class: 'iw-ldr__kits' });
      const show = (id) => {
        const w = Ws[id], eqW = Ws[equipped];
        kind.textContent = (w.class || KIND_LABEL[w.kind] || '').toUpperCase();
        nm.textContent = w.name; blurb.textContent = w.blurb || '';
        for (const s of statEls) {
          const v = clamp((w.stats && w.stats[s.k]) || 0), g = clamp((eqW.stats && eqW.stats[s.k]) || 0);
          s.bar.style.setProperty('--v', v.toFixed(3)); s.bar.style.setProperty('--g', (id === equipped ? 0 : g).toFixed(3));
          s.bar.classList.toggle('is-up', id !== equipped && v > g + 0.01); s.bar.classList.toggle('is-down', id !== equipped && v < g - 0.01);
        }
        const sp = this._specials()[w.special] || Object.values(this._specials())[0];
        const sub = (w.sub && (this.api.subs || SUB)[w.sub]) || this._sub();
        kits.innerHTML = '';
        kits.append(h('span', { class: 'iw-chip' }, h('i', { html: SUB_ICONS[sub.id] || SUB_ICONS.bomb }), sub.name), h('span', { class: 'iw-chip' }, h('i', { html: specialIcon(sp.id) }), sp.name));
        restartAnim(detail, 'is-swap');
      };
      const cards = order.map((id, i) => {
        const w = Ws[id];
        const c = h('button', { class: 'iw-wcard iw-rowin' + (id === equipped ? ' is-equipped' : ''), style: { '--i': i, '--tilt': `${[-1.5, 1, -0.8, 1.4, -1.1][i % 5]}deg` } },
          h('span', { class: 'iw-wcard__ink' }),
          h('span', { class: 'iw-wcard__blob', html: splatSVG({ seed: 40 + i * 3, cls: 'iw-fa', r: 58, arms: 8, drops: 0 }) }),
          h('span', { class: 'iw-wcard__icon', html: weaponIcon(w.kind || id) }),
          h('span', { class: 'iw-wcard__name' }, w.name),
          h('span', { class: 'iw-wcard__kind' }, w.class || KIND_LABEL[w.kind] || ''),
          h('span', { class: 'iw-wcard__eq', html: GLYPHS.check }), h('span', { class: 'iw-wcard__glare' }));
        c.dataset.cur = 'own'; c._wid = id;
        this._fx(c, { tilt: 12 });
        this._bind(c, { id: 'lw-' + id, accept: () => {
          if (id !== equipped) {
            equipped = id;
            safeCall(() => this.api.setLoadout && this.api.setLoadout({ weapon: id }));
            safeCall(() => net && net.setMe({ weapon: id }));
            cards.forEach((x) => x.classList.toggle('is-equipped', x === c));
            this._sfx('ui_confirm'); this._sfx('splat_small');
            this._burstAt(c, { count: 14, dist: 8, size: 1.1 });
            renderBar();
          } else this._sfx('ui_click');
          restartAnim(c, 'is-pick');
          setTimeout(() => { if (this._modal === drawer) this._closeModal(true); }, reduced ? 0 : 260);
        } });
        return c;
      });
      const detail = h('div', { class: 'iw-ldr__detail' }, h('div', { class: 'iw-wd__title' }, kind, nm), blurb, h('div', { class: 'iw-wd__stats' }, statEls.map((s) => s.row)), kits);
      const drawer = h('div', { class: 'iw-ldr' },
        h('div', { class: 'iw-ldr__card' },
          h('div', { class: 'iw-ldr__head' }, h('span', { class: 'iw-seclabel' }, h('i', { html: WEAPON_ICONS.shooter }), 'CHOOSE YOUR WEAPON'), h('span', { class: 'iw-ldr__hint' }, this._hint('Enter', 'A', 'Equip'), this._hint('Esc', 'B', 'Close'))),
          h('div', { class: 'iw-ldr__grid', style: { '--cols': order.length > 8 ? 5 : 4 } }, cards),
          detail));
      drawer.addEventListener('pointerdown', (e) => { if (e.target === drawer) this._closeModal(); });
      drawer._show = show;
      el.appendChild(drawer);
      this._modalPrev = wChip;
      this._modal = drawer;
      show(equipped);
      this._setFocus(cards[order.indexOf(equipped)] || cards[0], { snap: true });
      this._sfx('ui_click');
    };
    this._bind(wChip, { id: 'weapon', accept: () => openLoadout() });
    this._bind(lChip, { id: 'look', accept: () => { if (!S.launching) { this._sfx('ui_click'); this._go('locker'); } } });
    this._bind(teamRow, { id: 'team', type: 'row', adjust: (d) => (bossMode() ? requestTeam(0) : teamSeg.adjust(d)), accept: () => (bossMode() ? requestTeam(0) : teamSeg.cycle()) });
    // host settings rows (bound only for the host — guests' rows are read-only)
    const bindRows = () => {
      const host = isHost();
      for (const r of setRows) {
        if (host && !r.dataset.nav) {
          if (r === rMode) this._bind(r, { id: 'set-mode', type: 'row', adjust: (d) => setMode(d), accept: () => setMode(1) });
          else if (r === rStage) this._bind(r, { id: 'set-stage', type: 'row', adjust: (d) => setMap(d), accept: () => setMap(1) });
          else if (r === rTime) this._bind(r, { id: 'set-time', type: 'row', adjust: timeSeg.adjust, accept: timeSeg.cycle });
          else if (r === rPal) this._bind(r, { id: 'set-pal', type: 'row', adjust: palSeg.adjust, accept: palSeg.cycle });
          else if (r === rLen) this._bind(r, { id: 'set-len', type: 'row', adjust: lenSeg.adjust, accept: lenSeg.cycle });
          else if (r === rBots) this._bind(r, { id: 'set-bots', type: 'row', adjust: (d) => (botsLocked() ? lockedBots() : botTgl.adjust(d)), accept: () => (botsLocked() ? lockedBots() : botTgl.accept()) });
          else if (r === rDiff) this._bind(r, { id: 'set-diff', type: 'row', adjust: (d) => { if (lob.bots === false) { this._sfx('ui_error', 0.15); return; } diffSeg.adjust(d); }, accept: () => { if (lob.bots !== false) diffSeg.cycle(); } });
        } else if (!host && r.dataset.nav) { delete r.dataset.nav; if (this._focus === r) this._setFocus(wChip); }
      }
    };

    // humans-only stage (config noBots): the bots switch is locked off
    const botsLocked = () => mapNoBots(lob.map);
    const lockedBots = () => { this._sfx('ui_error', 0.15); restartAnim(rBots, 'is-shake'); this.toast('No bots on this stage — it’s humans only', { icon: GLYPHS.bot }); };

    // ---- render from the lobby state
    const renderPlates = () => {
      const ps = players();
      const seen = new Set();
      const [ca, cb] = colors();
      for (const p of ps) {
        seen.add(p.id);
        let P = plates.get(p.id);
        if (!P) {
          // a compact splashtag: banner art in the team's ink, title line + big name, weapon badge; host crown,
          // YOU and READY are stickers slapped on its corners
          const art = h('span', { class: 'iw-stag__art' });
          const title = h('span', { class: 'iw-stag__title' });
          const name = h('span', { class: 'iw-plate__name' });
          const crown = h('i', { class: 'iw-plate__crown', html: GLYPHS.crown });
          const w = h('i', { class: 'iw-plate__w' });
          const ping = h('span', { class: 'iw-plate__ping' }, h('i'), h('i'), h('i'));
          const ready = h('span', { class: 'iw-plate__ready' }, h('i', { html: GLYPHS.check }), 'READY!');
          const bubble = h('span', { class: 'iw-plate__bubble' });
          const you = h('span', { class: 'iw-plate__you' }, 'YOU');
          const e = h('div', { class: 'iw-plate' }, h('div', { class: 'iw-plate__stack' }, bubble,
            h('div', { class: 'iw-plate__tag iw-stag' }, art, w, h('span', { class: 'iw-stag__txt' }, title, name), crown, you, ready, ping)));
          platesEl.appendChild(e);
          P = { el: e, tag: e.querySelector('.iw-plate__tag'), art, title, name, crown, w, ping, ready, bubble, you, on: false, sig: '', bubT: 0, x: -1, y: -1, dy: 0, bw: 0 };
          plates.set(p.id, P);
        }
        const team = teamOf(p);
        const sig = `${p.name}|${p.host}|${p.ready}|${p.weapon}|${team}|${p.you}|${bossMode() ? 1 : 0}`;
        if (sig !== P.sig) {
          const was = P.sig ? P.sig.split('|') : null;
          P.sig = sig; P.bw = 0;   // re-measure for the overlap pass
          if (P.name.textContent !== p.name) {
            P.name.textContent = p.name; P.title.textContent = tagTitle(p.name);
            P.art.innerHTML = tagArt(fnv(String(p.name).toLowerCase()));
            P.el.classList.toggle('is-long', p.name.length > 7); P.el.classList.toggle('is-xlong', p.name.length > 11);   // names up to 16 fit the compact tag
          }
          P.el.classList.toggle('is-host', !!p.host);
          P.el.classList.toggle('is-you', !!p.you);
          P.el.classList.toggle('is-ready', !!p.ready || !!p.host);
          P.el.classList.toggle('is-hostready', !!p.host);
          const W = Ws[p.weapon];
          P.w.innerHTML = weaponIcon((W && W.kind) || p.weapon);
          colorVars(P.el, 'tc', team && !bossMode() ? cb : ca);
          if (was && was[2] !== String(p.ready) && p.ready) restartAnim(P.ready, 'is-stamp');
          if (was && was[1] !== String(p.host) && p.host) restartAnim(P.crown, 'is-stamp');
          if (was && was[3] !== p.weapon) restartAnim(P.w, 'is-pop');
        }
        const pingQ = p.ping == null || p.ping <= 0 ? 0 : p.ping < 70 ? 3 : p.ping < 140 ? 2 : 1;
        if (P.pingQ !== pingQ) { P.pingQ = pingQ; P.ping.dataset.q = pingQ; P.ping.title = p.ping ? `${Math.round(p.ping)} ms` : ''; }
      }
      for (const [id, P] of plates) if (!seen.has(id)) { P.gone = true; }
    };
    const renderStatus = () => {
      const ps = players();
      const na = ps.filter((p) => teamOf(p) === 0).length, nb = ps.length - na;
      countEl.textContent = String(ps.length);
      const pip = (host, n, t) => {
        if (host.childElementCount !== 4) { host.innerHTML = ''; for (let k = 0; k < 4; k++) host.appendChild(h('i', { html: GLYPHS.squidlet })); }
        [...host.children].forEach((c, k) => {
          const pl = ps.filter((p) => teamOf(p) === t)[k];
          const cls = pl ? (pl.ready || pl.host ? 'is-on is-ready' : 'is-on') : lob.bots !== false ? 'is-bot' : '';
          if (c._c === cls) return;
          const pop = c._c !== undefined && pl && !String(c._c).startsWith('is-on');   // a squidkid just took this spot
          c._c = cls; c.className = cls;
          if (pop) restartAnim(c, 'is-pop');
        });
        void n;
      };
      pip(pipsA, na, 0); pip(pipsB, nb, 1);
      if (bossMode()) {
        // one squad of 8: filled by the room's kids first, bots take the rest
        if (squadPips.childElementCount !== 8) { squadPips.innerHTML = ''; for (let k = 0; k < 8; k++) squadPips.appendChild(h('i', { html: GLYPHS.squidlet })); }
        [...squadPips.children].forEach((c, k) => {
          const pl = ps[k];
          const cls = pl ? (pl.ready || pl.host ? 'is-on is-ready' : 'is-on') : lob.bots !== false ? 'is-bot' : '';
          if (c._c === cls) return;
          const pop = c._c !== undefined && pl && !String(c._c).startsWith('is-on');
          c._c = cls; c.className = cls;
          if (pop) restartAnim(c, 'is-pop');
        });
      }
      status.classList.toggle('is-boss', bossMode());
      const waiting = ps.filter((p) => !p.ready && !p.host);
      const host = ps.find((p) => p.host);
      let txt;
      if (ps.length >= (lob.maxPlayers || 8)) txt = waiting.length ? `Room full · ${waiting.length} not ready` : 'Room full · everyone’s ready!';
      else if (ps.length <= 1) txt = 'Share the code to fill the room';
      else if (!waiting.length) txt = isHost() ? 'Everyone’s ready — start when you like!' : `Everyone’s ready — waiting for ${host ? host.name : 'the host'}`;
      else txt = `${ps.length - waiting.length} of ${ps.length} ready`;
      statusTxt.textContent = txt;
      status.classList.toggle('is-allready', ps.length > 1 && !waiting.length);
      el.classList.toggle('is-alone', ps.length <= 1);
    };
    const renderSettings = (prev) => {
      renderStage(prev && prev.map !== lob.map ? (maps.findIndex((m) => m.id === lob.map) > maps.findIndex((m) => m.id === prev.map) ? 1 : -1) : 0);
      timeSeg.refresh(lob.time === 'dusk' ? 'dusk' : 'day');
      lenSeg.refresh(lob.duration);
      palSeg.refresh(palIdx());
      { const P0 = TEAM_PALETTES[palIdx()]; palName.textContent = P0 ? P0.names.join(' vs ') : ''; }
      botTgl.refresh(lob.bots !== false);
      diffSeg.refresh(diffs[lob.difficulty] ? lob.difficulty : 'normal');
      const bm = bossMode(), md = lobMode(), zm = fixedLen(md);
      if (rMode._shown !== md) {
        const first = rMode._shown === undefined;
        rMode._shown = md;
        modeName.textContent = MODE_INFO[md].label;
        modeIco.innerHTML = bm ? BOSS_GLYPH : md === 'tower' ? TOWER_GLYPH : zm ? ZONE_GLYPH : GLYPHS.flag;
        el.classList.toggle('is-bossmode', bm);
        el.classList.toggle('is-zonemode', zm);   // (the fixed-length modes: Zone Control, Tower Command)
        el.classList.toggle('is-towermode', md === 'tower');
        lenLockZB.textContent = `${Math.round(fixedDur(md) / 60)}:00`;
        diffLbl.querySelector('.iw-lset__lbltxt').textContent = bm ? 'DIFFICULTY' : 'BOT SKILL';
        hostChip.lastChild.textContent = bm || zm ? 'HOST' : 'YOU’RE THE HOST';   // the longer headlines need the room
        lenSegT.el.style.display = bm || zm ? 'none' : ''; lenSegB.el.style.display = bm ? '' : 'none';
        rLen.classList.toggle('is-locked', zm);
        if (!first) { restartAnim(rMode, 'is-swap'); restartAnim(status, 'is-swap'); }
      }
      lenSeg.refresh(lob.duration);
      rDiff.classList.toggle('is-off', lob.bots === false);
      const humans = players().length;
      botsNote.textContent = botsLocked() ? 'No bots on this stage' : lob.bots !== false ? (humans < 8 ? `${8 - humans} bot${8 - humans === 1 ? '' : 's'} join ${bossMode() ? 'the squad' : 'in'}` : 'Room is full') : 'Empty spots stay empty';
      rBots.classList.toggle('is-locked', botsLocked());
      if (bossMode()) { const P1 = TEAM_PALETTES[palIdx()]; if (P1) palName.textContent = `${P1.names[0]} squad · ${P1.names[1]} boss`; }
      const host = players().find((p) => p.host);
      hostName.textContent = host ? host.name : 'the host';
      if (prev) {
        if (prev.map !== lob.map) flash(rStage);
        if (prev.time !== lob.time) flash(rTime);
        if (prev.duration !== lob.duration) flash(rLen);
        if (prev.palette !== lob.palette) flash(rPal);
        if (prev.bots !== lob.bots) flash(rBots);
        if (prev.difficulty !== lob.difficulty) flash(rDiff);
        if ((prev.mode || 'turf') !== (lob.mode || 'turf')) {
          flash(rMode);
          if (!isHost()) this.toast(`${host ? host.name : 'The host'} picked ${bossMode() ? `BOSS BATTLE — everyone vs ${BOSS_NAME}!` : MODE_INFO[lobMode()].label}`, { icon: bossMode() ? BOSS_GLYPH : MODE_INFO[lobMode()].icon === GLYPHS.drop ? GLYPHS.flag : MODE_INFO[lobMode()].icon });
        }
        if (!isHost() && (prev.map !== lob.map || prev.time !== lob.time)) {
          const m = maps.find((x) => x.id === lob.map);
          this.toast(`${host ? host.name : 'The host'} picked ${m ? m.name : 'a stage'}${lob.time === 'dusk' ? ' at dusk' : ''}`, { icon: GLYPHS.map });
        }
      }
    };
    const renderBar = () => {
      const me = meP();
      const lo = this._loadout();
      const wid = (me && me.weapon) || lo.weapon;
      const W = Ws[wid] || Ws[lo.weapon];
      if (wChip._wid !== wid) { wChip._wid = wid; wIcon.innerHTML = weaponIcon((W && W.kind) || wid); wName.textContent = W ? W.name : wid; if (wChip._init) restartAnim(wChip, 'is-pick'); wChip._init = true; }
      const host = isHost();
      el.classList.toggle('is-host', host);
      const ready = !!(me && me.ready);
      readyBtn.classList.toggle('is-on', ready);
      readyBtn.querySelector('.iw-btn__label').textContent = ready ? 'READY!' : 'READY?';
      readySub.textContent = ready ? 'Press again to cancel' : 'Let the host know you’re set';
      const ok = host && net && net.canStart();
      startBtn.classList.toggle('is-blocked', host && !ok);
      const waiting = players().filter((p) => !p.you && !p.ready && !p.host);
      const humans = players().length;
      const block = (net && net.startBlock ? net.startBlock() : noBotsStartBlock(lob)) || null;   // humans-only stage: 2+ players, one per side
      startSub.textContent = ok ? (humans <= 1 && lob.bots !== false ? 'Just you and the bots' : humans <= 1 ? 'Nobody to play against yet!' : 'Everyone’s ready — let’s ink!') : block || (waiting.length ? `Waiting for ${listNames(waiting)}` : 'Getting ready…');
      // team seg follows your actual side unless a request is pending
      if (me && !S.pendingTeam) teamSeg.refresh(S.teamPref === 'auto' ? 'auto' : teamOf(me));
      teamRow.dataset.pick = S.teamPref === 'auto' ? 'auto' : String(S.pendingTeam ? S.pendingTeam.team : teamOf(me));
      teamRow.classList.toggle('is-locked', bossMode());
      el.classList.toggle('is-team-b', teamOf(me) === 1 && !bossMode());
      const [ca, cb] = colors();
      colorVars(el, 'ta', ca); colorVars(el, 'tb', cb); colorVars(el, 'self', teamOf(me) && !bossMode() ? cb : ca);
    };
    // the 3D line-up has a row per team; in boss mode the squad fills both rows (you + 3 up front) in squad ink
    const lineup = () => {
      if (!bossMode()) return [players(), colors()];
      const ps = players(), me = ps.find((p) => p.you), others = ps.filter((p) => !p.you);
      const front = me ? [me, ...others.slice(0, 3)] : others.slice(0, 4);
      const ca = colors()[0];
      return [ps.map((p) => ({ ...p, team: front.includes(p) ? 0 : 1 })), [ca, ca]];
    };
    const render = (fromEvent) => {
      const prev = S.lastLobby;
      renderPlates();
      renderStatus();
      renderSettings(fromEvent ? prev : null);
      renderBar();
      bindRows();
      S.lastLobby = { map: lob.map, time: lob.time, duration: lob.duration, bots: lob.bots, difficulty: lob.difficulty, palette: lob.palette, mode: lob.mode };
      if (sc && sc.updateLobby) safeCall(() => sc.updateLobby(...lineup()));
      const me = meP();
      if (S.pendingTeam && me && teamOf(me) === S.pendingTeam.team) S.pendingTeam = null;
    };

    // ---- session events
    const sub = (ev, fn) => { if (net && net.on) S.subs.push(net.on(ev, fn)); };
    sub('lobby', (e) => { if (!S.alive) return; lob = (e && e.lobby) || net.lobby || lob; render(true); });
    // arrivals / departures are batched into one toast ("Otto, Glub +2 joined"); the room filling in as you arrive
    // is shown by the line-up itself, not by a pile of toasts
    sub('join', (e) => {
      const p = e && e.player;
      if (!p || p.id === net.myId || S.age < 1.6) return;
      S.joins.push(p); S.batchT = 0.35;
    });
    sub('leave', (e) => {
      const p = e && e.player;
      if (!p || p.id === net.myId) return;
      S.leaves.push(p); S.batchT = 0.35;
    });
    const names = (ps) => (ps.length === 1 ? ps[0].name : ps.length === 2 ? `${ps[0].name} & ${ps[1].name}` : `${ps[0].name}, ${ps[1].name} +${ps.length - 2}`);
    const flushBatch = () => {
      const j = S.joins.splice(0), l = S.leaves.splice(0).filter((p) => !j.some((x) => x.id === p.id));
      if (j.length === 1) { this.toast('joined!', { kind: 'join', color: colors()[teamOf(j[0])], tag: j[0] }); this._sfx('ui_toggle', 0.1); }
      else if (j.length) { this.toast(`${names(j)} joined the room`, { kind: 'join', color: colors()[teamOf(j[0])] }); this._sfx('ui_toggle', 0.1); }
      if (l.length) this.toast(`${names(l)} left`, { kind: 'leave' });
    };
    sub('host', (e) => {
      const p = players().find((x) => x.id === (e && e.hostId));
      if (!p) return;
      this.toast(p.you ? 'You’re the host now — the room is yours' : `${p.name} is the host now`, { kind: 'good', icon: GLYPHS.crown });
      if (p.you) this._sfx('special_ready', 0.2);
    });
    sub('emote', (e) => {
      if (!e) return;
      safeCall(() => sc && sc.lobbyEmote && sc.lobbyEmote(e.id, e.name));
      const P = plates.get(e.id), E = EMOTES.find((x) => x.id === e.name);
      if (P && E) { P.bubble.innerHTML = `<i>${GLYPHS[E.icon]}</i>${esc(E.label)}`; restartAnim(P.bubble, 'is-on'); P.bubT = 1.9; }
      if (e.id !== net.myId) this._sfx('ui_hover', 0.2);
    });
    sub('error', (e) => { const m = e && e.message; if (m && /full/i.test(m) && net.state === 'lobby') this.toast(m, { kind: 'error', icon: GLYPHS.users }); });

    // ---- launch: countdown, super-jumps, hand over (resolves launchLobby())
    const launch = (done) => {
      if (S.launching) { S.launching.done = done; return; }
      if (this._modal) this._closeModal(true);
      S.launching = { t: 0, step: -1, done, fired: false, end: 0 };
      el.classList.add('is-starting');
      safeCall(() => sc && sc.lobbyGetSet && sc.lobbyGetSet());
      this._setFocus(null);
      this._sfx('ui_confirm');
      G.audio?.duck?.(0.6, 4);
    };
    const cdStep = (n) => {
      const L = S.launching;
      if (!L || L.step === n) return;
      L.step = n;
      cdNum.textContent = n > 0 ? String(n) : 'GO!';
      cdSub.textContent = n === 3 ? 'GET READY' : n > 0 ? '' : '';
      countdown.classList.add('is-on');
      countdown.classList.toggle('is-go', n === 0);
      restartAnim(countdown, 'is-beat');
      this._sfx(n > 0 ? 'countdown_tick' : 'go_horn');
    };

    // ---- initial state
    lob = (net && net.lobby) || lob;
    const me0 = meP();
    if (me0) S.teamPref = 'auto';
    render(false);

    // explicit pad/keyboard focus graph: the bar is one row, the host's settings a column, the copy button on top
    const barItems = () => [wChip, lChip, teamRow, emoteBtn, isHost() ? startBtn : readyBtn];
    const hostRows = () => (isHost() ? setRows : []);
    const barNav = (f, dir) => {
      const items = barItems(), i = items.indexOf(f);
      if (i < 0) return undefined;
      if (dir === 'left') return items[i - 1] || null;
      if (dir === 'right') return items[i + 1] || null;
      if (dir === 'up') { const rows = hostRows(); return rows.length ? rows[rows.length - 1] : copyBtn; }
      if (dir === 'down') return null;
      return undefined;
    };
    const sideNav = (f, dir) => {
      const rows = hostRows(), i = rows.indexOf(f);
      if (i < 0) return undefined;
      if (f === rTime && dir === 'right') return rLen;
      if (f === rLen && dir === 'left') return rTime;
      if ((f === rTime || f === rLen) && dir === 'up') return rStage;
      if ((f === rTime || f === rLen) && dir === 'down') return rPal;
      if (f === rPal && dir === 'up') return rTime;
      if (f === rStage && dir === 'down') return rTime;
      if (dir === 'up') return rows[i - 1] || copyBtn;
      if (dir === 'down') return rows[i + 1] || wChip;
      if (dir === 'right') return i < 1 ? copyBtn : isHost() ? startBtn : readyBtn;
      return undefined;
    };

    return {
      el,
      initial: () => (isHost() ? (net && net.canStart() && players().length > 1 ? startBtn : rStage) : readyBtn),
      launch,
      afterMount: () => {
        this._syncMe(net);
        if (sc && sc.showLobby) safeCall(() => sc.showLobby(...lineup(), { quick: !!opts.back, reduced }));
        if (net && net.state === 'starting') this.launchLobby();
      },
      onKey: (e) => {
        if (S.launching || e.metaKey || e.ctrlKey || e.altKey) return !!S.launching && !e.metaKey && !e.ctrlKey;
        const k = e.key;
        if (this._modal && !this._modal.classList.contains('iw-emowheel')) return false;
        const E = EMOTES.find((x) => x.key === k);
        if (E) { if (this._modal) this._closeModal(true); if (!e.repeat) doEmote(E.id); return true; }
        if ((k === 'c' || k === 'C') && !this._modal) { if (!e.repeat) { this._setFocus(copyBtn); copyCode(); } return true; }
        return false;
      },
      onNav: (dir) => {
        if (S.launching) return true;
        if (this._modal && this._modal.classList.contains('iw-emowheel')) {
          const E = EMOTES.find((x) => x.dir === dir);
          if (E) { this._closeModal(true); doEmote(E.id); return true; }
          return false;
        }
        if (this._modal) return false;
        if (dir === 'alt') { toggleReady(); return true; }
        if (dir === 'tab_prev' || dir === 'tab_next') { if (bossMode()) requestTeam(0); else teamSeg.adjust(dir === 'tab_next' ? 1 : -1); return true; }
        if (dir === 'up' || dir === 'down' || dir === 'left' || dir === 'right') {
          const f = this._focus;
          // rows with a control: ←/→ adjust it; TIME and LENGTH share a line, so pushing past the edge crosses over
          if ((dir === 'left' || dir === 'right') && f && setRows.includes(f) && (this._binds.get(f) || {}).adjust) {
            const edgeR = f === rTime && dir === 'right' && lob.time === 'dusk', edgeL = f === rLen && dir === 'left' && lob.duration === durations[0];
            if (edgeR) { this._moveFocus(rLen, dir); return true; }
            if (edgeL) { this._moveFocus(rTime, dir); return true; }
            return false;
          }
          let t = f ? barNav(f, dir) : undefined;
          if (t === undefined && f) t = sideNav(f, dir);
          if (t === undefined && f === copyBtn) t = dir === 'down' ? (hostRows()[0] || wChip) : dir === 'right' || dir === 'left' ? null : undefined;
          if (t === undefined) return false;
          if (t && t.isConnected && t.offsetParent !== null) this._moveFocus(t, dir); else if (f) this._bump(f, dir);
          return true;
        }
        return false;
      },
      onFocus: (f) => {
        if (this._modal && this._modal.classList.contains('iw-ldr') && f._wid) this._modal._show(f._wid);
        this.cursorEl.classList.toggle('is-nodrip', setRows.includes(f) || f === teamRow);
      },
      onBack: () => { if (!S.launching) askLeave(); },
      tick: (dt) => {
        // nameplates follow the 3D kids
        if (sc && sc.lobbyAnchor) {
          const A = this._anc || (this._anc = {});
          const vis = [];
          for (const [id, P] of plates) {
            const a = P.gone ? null : sc.lobbyAnchor(id, A);
            const on = !!(a && a.vis > 0.5 && !a.behind);
            if (on !== P.on) { P.on = on; P.el.classList.toggle('is-on', on); }
            if (P.gone && !on) { if (!P.rm) P.rm = setTimeout(() => { P.el.remove(); }, 400); plates.delete(id); continue; }
            if (a) { P.ax = a.x; P.ay = a.y; P.as = clamp(a.s || 1, 0.6, 1.25); P.has = true; if (on) vis.push(P); }
            if (P.bubT > 0) { P.bubT -= dt; if (P.bubT <= 0) P.bubble.classList.remove('is-on'); }
          }
          // the dock row stands in the gaps of the front row, so tags can collide: you and the nearer (bigger) kids
          // keep their spot, a tag further back hops up above the one it would cover
          vis.sort((p, q) => (q.el.classList.contains('is-you') - p.el.classList.contains('is-you')) || (q.as - p.as));
          const placed = [];
          for (const P of vis) {
            // offset* ignore the scale; the margins cover the crown / YOU stickers above and the READY stamp below
            if (!P.bw && P.tag) { const u = P.tag.offsetHeight / 3; P.bw = P.tag.offsetWidth + u * 1.4; P.bh = P.tag.offsetHeight + u * 1.3; P.bb = u * 0.9; }
            const w = P.bw * P.as, hh = P.bh * P.as, bb = P.bb * P.as;
            let y = P.ay;
            for (let it = 0; it < 6; it++) {
              let hit = false;
              for (const Q of placed) if (Math.abs(P.ax - Q.x) < (w + Q.w) / 2 && y + bb > Q.y - Q.h && y - hh < Q.y + Q.b) { y = Q.y - Q.h - bb; hit = true; }
              if (!hit) break;
            }
            placed.push({ x: P.ax, y, w, h: hh, b: bb });
            P.dy += (y - P.ay - P.dy) * Math.min(1, dt * 12);
          }
          for (const P of plates.values()) {
            if (!P.has) continue;
            if (!P.on) P.dy = 0;
            const x = Math.round(P.ax * 2) / 2, y = Math.round((P.ay + P.dy) * 2) / 2, s = P.as;
            if (x !== P.x || y !== P.y || s !== P.s) {
              if (s !== P.s) P.el.style.zIndex = P.el.classList.contains('is-you') ? 300 : Math.round(s * 100);   // nearer kids' tags on top
              P.x = x; P.y = y; P.s = s; P.el.style.transform = `translate3d(${x}px,${y}px,0) scale(${s.toFixed(3)})`;
            }
          }
          const bots = lob.bots !== false;
          for (const O of open) {
            const a = sc.lobbySlotAnchor ? sc.lobbySlotAnchor(O.row, O.i, A) : null;
            const on = !!(a && a.vis > 0.5 && !S.launching);
            if (on !== O.on) { O.on = on; O.el.classList.toggle('is-on', on); }
            if (a) O.el.style.transform = `translate3d(${Math.round(a.x)}px,${Math.round(a.y)}px,0) scale(${clamp(a.s || 1, 0.6, 1.25).toFixed(3)})`;
            const sig = bots ? 'bot' : 'open';
            if (O.sig !== sig) { O.sig = sig; O.txt.textContent = bots ? 'BOT' : 'OPEN'; O.el.classList.toggle('is-bot', bots); O.el.querySelector('.iw-plate__plus').innerHTML = bots ? GLYPHS.bot : GLYPHS.plus; }
          }
        }
        S.age += dt;
        if (S.batchT > 0) { S.batchT -= dt; if (S.batchT <= 0) flushBatch(); }
        { const acc = colors().join() + (bossMode() ? '|b' : ''); if (acc !== S.acc) { const first = !S.acc; S.acc = acc; if (!first) { for (const P of plates.values()) P.sig = ''; render(false); } } }
        if (S.copied > 0) { S.copied -= dt; if (S.copied <= 0) copyTxt.textContent = 'COPY'; }
        if (S.emoteCd > 0) { S.emoteCd = Math.max(0, S.emoteCd - dt); emoteBtn.style.setProperty('--cd', (S.emoteCd / 1.3).toFixed(3)); }
        if (S.pendingTeam) {
          S.pendingTeam.t += dt;
          if (S.pendingTeam.t > 1.1) {
            const want = S.pendingTeam.team; S.pendingTeam = null;
            const me = meP();
            if (me && teamOf(me) !== want) {
              this.toast(`Team ${TEAM_LABEL[want][0]}${TEAM_LABEL[want].slice(1).toLowerCase()} is full`, { kind: 'error', icon: GLYPHS.users });
              S.teamPref = 'auto'; teamSeg.refresh('auto'); restartAnim(teamRow, 'is-shake'); this._sfx('ui_error', 0.2);
            }
          }
        }
        // countdown → GO → super-jumps → hand over
        const L = S.launching;
        if (L) {
          if (net && net.state === 'lobby' && L.t > 0.3 && !L.fired) { // the start was called off
            S.launching = null; el.classList.remove('is-starting'); countdown.classList.remove('is-on'); safeCall(L.done); return;
          }
          L.t += dt;
          const T = L.t;
          if (T >= 0.35 && T < 1.2) cdStep(3); else if (T >= 1.2 && T < 2.05) cdStep(2); else if (T >= 2.05 && T < 2.9) cdStep(1);
          else if (T >= 2.9 && !L.fired) {
            cdStep(0); L.fired = true;
            const dur = sc && sc.lobbyLaunch ? sc.lobbyLaunch() : 0;
            L.end = T + Math.max(0.5, Math.min(1.3, dur)) + 0.1;
            if (!reduced) this._burstAt(cdNum, { count: 22, dist: 16, size: 2.2, ring: true, color: 'var(--self)' });
          }
          if (L.fired && T >= L.end && !L.handed) { L.handed = true; safeCall(L.done); }
        }
      },
      destroy: () => {
        S.alive = false;
        for (const off of S.subs) safeCall(off);
        if (S.launching && !S.launching.handed) { S.launching.handed = true; safeCall(S.launching.done); }
        this.cursorEl.classList.remove('is-nodrip');
        // the line-up stays parked in the showcase (locker trip / match); leaving the room disposes it (leaveRoom)
        if (sc && this.current !== 'locker' && sc.mode === 'lobby') safeCall(() => sc.hide());
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
        let zones = null;
        if (m.mode === 'zones' && m.zones && m.zones.state) {
          const z = m.zones.state();
          zones = { count: z.count, penalty: z.penalty.map((p) => Math.max(0, Math.ceil(p - 1e-6))), owner: z.owner, active: z.active, overtime: !!z.overtime, overtimeT: z.overtimeT };
        }
        let tower = null;
        if (m.mode === 'tower' && m.tower && m.tower.state) {
          const t = m.tower.state();
          tower = { count: t.count.map((c) => Math.max(0, Math.ceil(c - 1e-6))), penalty: [0, 0], owner: t.owner, contested: !!t.contested, returning: !!t.returning, homing: !!t.homing,
            riders: t.riders, next: t.next, emptyT: t.emptyT, overtime: !!t.overtime, overtimeT: t.overtimeT };
        }
        return {
          live: true, time: Math.max(0, +m.time || 0), duration: Math.max(1, +m.duration || 180), mode: modeOf(m.mode), zones, tower,
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
    if (safeCall(() => this.api.isPractice && this.api.isPractice())) return this._scr_pausePractice();
    const snap = this._matchSnapshot();
    const zoneMode = snap.mode === 'zones' && !!snap.zones;
    const towerMode = snap.mode === 'tower' && !!snap.tower;
    // online the match keeps running underneath this menu, and quitting leaves the room
    const online = !!(G.netm || (G.net && G.net.state === 'match'));
    const items = [
      { id: 'resume', label: online ? 'BACK TO THE MATCH' : 'RESUME', icon: GLYPHS.play, cls: 'iw-btn--menu iw-btn--primary', accept: () => this._resume(), sound: null },
      { id: 'settings', label: 'SETTINGS', icon: GLYPHS.gear, cls: 'iw-btn--menu', accept: () => this._go('settings') },
      { id: 'howto', label: 'HOW TO PLAY', icon: GLYPHS.question, cls: 'iw-btn--menu', accept: () => this._go('howto') },
      { id: 'quit', label: online ? 'LEAVE ROOM' : 'QUIT MATCH', icon: online ? GLYPHS.exit : GLYPHS.close, cls: 'iw-btn--menu iw-btn--danger', accept: () => this._openModal({
        title: online ? 'LEAVE ROOM?' : 'QUIT MATCH?', danger: true,
        text: online ? 'You’ll leave the match and the room — a bot takes over your squidkid for the team.'
          : zoneMode || towerMode ? `You will leave this ${MODE_INFO[snap.mode].name} match and head back to the lobby. It will not count.` : 'You will leave this Turf War and head back to the lobby. Your turf will not count.',
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
    const selfP = snap.players.find((p) => p.isSelf) || snap.players[0] || { team: 0, name: 'You' };
    const diff = snap.difficulty && this._diffs()[snap.difficulty];
    const clockNum = h('b', { class: 'iw-pclock__num' }, fmtTime(snap.time));
    const clockArc = h('i', { class: 'iw-pclock__arc' });
    const clockLbl = h('small', null, 'LEFT');
    const clock = h('div', { class: 'iw-pclock' }, h('span', { class: 'iw-pclock__ring' }, clockArc), h('div', { class: 'iw-pclock__txt' }, clockNum, clockLbl));
    // Zone Control: both teams' countdowns (+ penalty), who holds the live objective, overtime
    // Tower Command: the same strip: both teams' counts, who's riding the tower and what it's doing
    let zoneStrip = null, zoneRefresh = null;
    if (zoneMode || towerMode) {
      const side = (t) => {
        const num = h('b', { class: 'iw-pzone__num' }), pen = h('span', { class: 'iw-pzone__pen' });
        const el = h('div', { class: `iw-pzone__team iw-pzone__team--${t ? 'b' : 'a'}` },
          h('span', { class: 'iw-pzone__name' }, h('i', { class: 'iw-roster__dot' }), snap.names[t] || TEAM_NAMES[t], h('i', { class: 'iw-pzone__crown', html: GLYPHS.crown })),
          h('span', { class: 'iw-pzone__score' }, num, pen));
        return { el, num, pen };
      };
      const za = side(0), zb = side(1);
      const objName = h('b'), objState = h('span', { class: 'iw-pzone__state' });
      const obj = h('div', { class: 'iw-pzone__obj' }, h('i', { class: 'iw-pzone__ico', html: towerMode ? TOWER_GLYPH : ZONE_GLYPH }), objName, objState);
      zoneStrip = h('div', { class: 'iw-pzone' }, za.el, obj, zb.el);
      zoneRefresh = (z) => {
        for (const [t, x] of [[0, za], [1, zb]]) {
          x.num.textContent = String(z.count[t]);
          x.pen.textContent = z.penalty[t] > 0 ? `+${z.penalty[t]}` : '';
          x.el.classList.toggle('has-pen', z.penalty[t] > 0);
          x.el.classList.toggle('is-ahead', z.count[t] < z.count[1 - t]);   // the count is the score (not + penalty)
          x.el.classList.toggle('is-holding', z.owner === t);
        }
        const names = snap.names, tn = (t) => (names[t] || TEAM_NAMES[t]).toUpperCase();
        if (towerMode) {
          objName.textContent = z.contested ? 'CONTESTED' : z.owner >= 0 ? `${tn(z.owner)} RIDING` : 'TOWER';
          objState.textContent = z.contested ? 'BOTH TEAMS ABOARD' : z.owner < 0 ? (z.returning ? 'ROLLING BACK' : 'NEUTRAL')
            : z.next && z.next.at ? `CHECKPOINT · ${Math.max(0, Math.ceil(z.next.left - 1e-6))}` : z.riders[z.owner] > 0 ? `${z.riders[z.owner]} ABOARD` : z.homing ? 'ROLLING HOME' : 'EMPTY';
        } else {
          objName.textContent = z.active === 'center' ? 'CENTRE ZONE' : `${tn(z.active === 'sideA' ? 0 : 1)} SIDE`;
          objState.textContent = z.owner >= 0 ? `HELD BY ${tn(z.owner)}` : 'NEUTRAL';
        }
        obj.dataset.owner = z.owner < 0 ? 'n' : z.owner ? 'b' : 'a';
        zoneStrip.classList.toggle('is-ot', !!z.overtime);
      };
    }
    const stat = (cls, icon, label) => {
      const b = h('b');
      const n = h('span', { class: `iw-pstat ${cls}` }, h('i', { html: icon }), b, h('small', null, label));
      return { el: n, b };
    };
    const sTurf = stat('iw-pstat--turf', GLYPHS.drop, 'TURF'), sSplat = stat('', SPLAT_ICON, 'SPLATS'), sDeath = stat('', DEATH_ICON, 'SPLATTED'), sSp = stat('iw-pstat--sp', specialIcon((G.local && G.local.specialId) || (this._weapons()[selfP.weapon] || {}).special), 'SPECIAL');
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
          h('div', { class: 'iw-pmatch__mode' }, h('span', { class: 'iw-pmatch__tag' }, MODE_INFO[towerMode ? 'tower' : zoneMode ? 'zones' : 'turf'].label), diff ? h('span', { class: 'iw-pmatch__diff' }, h('i', { html: GLYPHS.bot }), `${diff.name} bots`) : null),
          h('div', { class: 'iw-pmatch__map' }, h('i', { html: GLYPHS.map }), snap.map || MODE_INFO[towerMode ? 'tower' : zoneMode ? 'zones' : 'turf'].name)),
        clock),
      zoneStrip, you, teams, ctlWrap);
    colorVars(matchPanel, 'ta', snap.colors[0]);
    colorVars(matchPanel, 'tb', snap.colors[1]);
    colorVars(matchPanel, 'self', snap.colors[selfP.team] || snap.colors[0]);

    const refresh = (s) => {
      const tLeft = s.time, frac = clamp(tLeft / s.duration);
      const obj = zoneMode ? s.zones : towerMode ? s.tower : null;
      const ot = !!(obj && obj.overtime);
      clockNum.textContent = ot ? 'OT' : fmtTime(tLeft);
      clockLbl.textContent = ot ? 'OVERTIME' : 'LEFT';
      clock.style.setProperty('--f', ot ? '1' : frac.toFixed(4));
      clock.classList.toggle('is-low', tLeft <= 60 || ot);
      clock.classList.toggle('is-ot', ot);
      if (zoneRefresh && obj) zoneRefresh(obj);
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
        h('div', { class: 'iw-pause__title iw-in iw-in--down' }, h('span', { class: 'iw-pause__blob', html: splatSVG({ seed: 3, cls: 'iw-fa', r: 60, arms: 8, drops: 4 }) }), h('span', { class: 'iw-display' }, online ? 'MENU' : 'PAUSED'),
          online ? h('span', { class: 'iw-pause__live' }, h('i'), 'MATCH STILL ON') : null),
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

  // Practice pause: loadout swaps, a clean stage, a new stage — never a trip back to the lobby
  _scr_pausePractice() {
    const info = safeCall(() => this.api.practiceInfo && this.api.practiceInfo()) || {};
    const items = [
      { id: 'resume', label: 'RESUME', icon: GLYPHS.play, cls: 'iw-btn--menu iw-btn--primary', accept: () => this._resume(), sound: null },
      { id: 'loadout', label: 'CHANGE LOADOUT', icon: weaponIcon((this._weapons()[info.weapon] || {}).kind || info.weapon || 'shooter'), cls: 'iw-btn--menu', accept: () => this._go('loadout') },
      { id: 'reset', label: 'RESET STAGE', icon: GLYPHS.reset, cls: 'iw-btn--menu', accept: () => { safeCall(() => this.api.practiceReset && this.api.practiceReset()); this._resume(); } },
      { id: 'stage', label: 'NEW STAGE', icon: GLYPHS.map, cls: 'iw-btn--menu', accept: () => {
        if (this._starting) return;
        this._starting = true;
        this._runWipe(() => { this._starting = false; safeCall(() => this.api.practiceNewStage && this.api.practiceNewStage()); if (this.current === 'pause') this.show(null, { instantLeave: true }); });
      } },
      { id: 'settings', label: 'SETTINGS', icon: GLYPHS.gear, cls: 'iw-btn--menu', accept: () => this._go('settings') },
      { id: 'quit', label: 'END PRACTICE', icon: GLYPHS.close, cls: 'iw-btn--menu iw-btn--danger', accept: () => { safeCall(() => this.api.quitPractice && this.api.quitPractice()); } },
    ];
    const tilts = [-1.8, 1.2, -1, 1.4, -1.2, 1];
    const btns = items.map((it, i) => { const b = this._btn({ ...it, tilt: tilts[i] }); b.classList.add('iw-in', 'iw-in--left'); return b; });

    const W = this._weapons()[info.weapon] || {};
    const S = (this.api.subs || {})[info.sub] || this._sub();
    const sp = this._specials()[info.special] || this._specials()[W.special] || {};
    const kit = (label, icon, name, blurb) => h('div', { class: 'iw-kit' }, h('span', { class: 'iw-kit__icon', html: icon }), h('div', null, h('small', null, label), h('b', null, name || ''), h('span', null, blurb || '')));
    const [a] = this._accent();
    const hex = (G.teamHex || [])[0];
    const ctlWrap = h('div', { class: 'iw-pctl' }, h('div', { class: 'iw-seclabel' }, h('i', { html: GLYPHS.gamepad }), 'QUICK CONTROLS'), this._controlsList(this._input, true));
    const panel = this._panel('iw-pmatch iw-ppractice iw-panel--flat iw-in iw-in--right',
      h('div', { class: 'iw-pmatch__top' },
        h('div', { class: 'iw-pmatch__info' },
          h('div', { class: 'iw-pmatch__mode' }, h('span', { class: 'iw-pmatch__tag' }, 'PRACTICE'), h('span', { class: 'iw-pmatch__diff' }, 'No enemies · no clock')),
          h('div', { class: 'iw-pmatch__map' }, h('i', { html: GLYPHS.map }), info.map || 'Practice'))),
      h('div', { class: 'iw-seclabel' }, h('i', { html: WEAPON_ICONS.shooter }), 'YOUR LOADOUT'),
      h('div', { class: 'iw-wd__kits' },
        kit('WEAPON', weaponIcon(W.kind || info.weapon || 'shooter'), W.name, W.blurb),
        kit('SUB', SUB_ICONS[S.id] || SUB_ICONS.bomb, S.name, S.blurb),
        kit('SPECIAL', specialIcon(sp.id || W.special), sp.name, sp.blurb)),
      h('p', { class: 'iw-ppractice__tip' }, h('b', null, 'L'), ' swaps your loadout any time · ', h('b', null, 'Reset stage'), ' wipes the ink and refills your special'),
      ctlWrap);
    colorVars(panel, 'self', toHex(hex || a));

    const el = h('div', { class: 'iw-screen iw-pause' },
      h('div', { class: 'iw-pause__dim' }),
      h('div', { class: 'iw-pause__col' },
        h('div', { class: 'iw-pause__title iw-in iw-in--down' }, h('span', { class: 'iw-pause__blob', html: splatSVG({ seed: 5, cls: 'iw-fa', r: 60, arms: 8, drops: 4 }) }), h('span', { class: 'iw-display' }, 'PRACTICE')),
        h('nav', { class: 'iw-pause__menu' }, btns)),
      panel,
      this._prompts([['Enter', 'A', 'Select'], ['Esc', 'Start', 'Resume']]));
    return {
      el, wrap: true, initial: btns[0],
      onBack: () => { if (performance.now() - this._shownAt > 200) this._resume(); },
      onInputMode: (mode) => { const old = ctlWrap.querySelector('.iw-ctl'); if (old) old.replaceWith(this._controlsList(mode, true)); },
    };
  }

  // ================================================================ SCREEN: results
  _scr_results() {
    const d = this._results || this._demoResults();
    const boss = d.mode === 'boss';   // Boss Battle: VICTORY / DEFEAT vs HULLBREAKER, one squad ranked by damage
    const colors = (d.colors || [TEAM_PALETTES[0].a, TEAM_PALETTES[0].b]).map((c) => toHex(c));
    const [pa, pb] = pct(...(d.percents || [50, 50]));
    const names = d.teamNames || TEAM_NAMES;
    const win = !!d.win;
    const raw = d.players || [];
    const awards = boss ? computeBossAwards(raw) : computeAwards(raw, { win, percents: [pa, pb] });
    const all = raw.map((p, i) => ({ ...p, _aw: awards.byPlayer[i] || [] }));
    const players = boss ? all.slice().sort((x, y) => ((y.damage || 0) - (x.damage || 0)) || ((y.turf || 0) - (x.turf || 0)))
      : all.slice().sort((x, y) => (x.team - y.team) || (y.turf - x.turf));
    const B = boss ? { name: BOSS_NAME, defeated: win, time: 0, hpLeft: win ? 0 : 1, phase: 1, ...(d.boss || {}) } : null;
    if (B) B.name = String(B.name || BOSS_NAME).toUpperCase();
    const self = all.find((p) => p.isSelf) || null;
    const selfTeam = self ? self.team : 0;
    const winTeam = win ? selfTeam : 1 - selfTeam;
    const reduced = prefersReducedMotion();
    // Zone Control: final countdowns + how it was decided (the coverage-margin tags are a Turf War thing)
    // Tower Command: the same race to 0 — each team's count is how far it still had to push (no penalties)
    const td = d.mode === 'tower' && d.tower ? d.tower : null;
    const zd = td ? { ...td, penalty: [0, 0] } : d.mode === 'zones' && d.zones ? d.zones : null;
    const resMode = boss ? 'boss' : td ? 'tower' : zd ? 'zones' : 'turf';
    if (zd) {
      const REASON = td ? TOWER_REASON : ZONE_REASON;
      const why = REASON[zd.reason] || REASON.time;
      const icon = zd.reason === 'knockout' ? 'star' : zd.reason === 'time' ? 'stopwatch' : zd.reason === 'comeback' || zd.reason === 'sudden-death' ? 'wave' : 'shield';
      awards.match = [{ id: 'zreason', icon, label: why[win ? 0 : 1].toUpperCase(), value: '' }];
      if (zd.overtime) awards.match.push({ id: 'zot', icon: 'stopwatch', label: 'OVERTIME', value: zd.overtimeT > 0 ? `+${fmtTime(zd.overtimeT)}` : '' });
    }

    // ---- title block: VICTORY/DEFEAT, stage, match tags, your medals
    const titleEl = h('div', { class: 'iw-res__title iw-display' }, win ? 'VICTORY!' : 'DEFEAT');
    const clock = (t) => { t = Math.max(0, +t || 0); const m = Math.floor(t / 60), ss = Math.floor(t % 60); return `${m}:${ss < 10 ? '0' : ''}${ss}`; };
    const tags = boss
      ? [B.defeated
        ? h('span', { class: 'iw-res__tag iw-res__tag--sunk' }, h('i', { html: awardIcon('stopwatch') }), `${B.name} SUNK`, h('small', null, `in ${clock(B.time)}`))
        : h('span', { class: 'iw-res__tag iw-res__tag--escaped' }, h('i', { html: BOSS_GLYPH }), 'IT GOT AWAY', h('small', null, `${Math.max(1, Math.round((B.hpLeft || 0) * 100))}% HP left`))]
      : awards.match.map((t) => h('span', { class: `iw-res__tag iw-res__tag--${t.id}` }, h('i', { html: awardIcon(t.icon) }), t.label, t.value ? h('small', null, t.value) : null));
    const myAwards = (self ? self._aw : []).slice(0, 4);
    const medals = myAwards.map((aw, i) => { const m = h('div', { class: 'iw-medalwrap', html: medalMarkup(aw, i) }).firstElementChild; return m; });
    const medalRow = medals.length ? h('div', { class: 'iw-res__medals' + (medals.length > 3 ? ' is-4' : '') }, h('div', { class: 'iw-res__medalcap' }, 'YOUR MEDALS'), h('div', { class: 'iw-res__medallist' }, medals)) : null;
    const head = h('div', { class: 'iw-res__head iw-in iw-in--pop' + (win ? ' is-win' : ' is-lose') },
      h('div', { class: 'iw-res__splat', html: splatSVG({ seed: win ? 9 : 14, cls: 'iw-fta', r: 60, arms: 10, drops: 4 }) }),
      titleEl,
      h('div', { class: 'iw-res__metarow' }, h('div', { class: 'iw-res__meta' }, h('i', { html: GLYPHS.map }), `${d.mapName || MODE_INFO[resMode].name} · ${MODE_INFO[resMode].name}`), tags,
        boss ? h('span', { class: 'iw-beta iw-res__beta' }, 'PUBLIC BETA') : null),
      medalRow);

    // ---- coverage bar (JS-driven growth so the numbers + sound land together)
    const crownA = h('i', { class: 'iw-cover__crown', html: GLYPHS.crown });
    const crownB = h('i', { class: 'iw-cover__crown', html: GLYPHS.crown });
    const numA = h('b', null, '0.0%'), numB = h('b', null, '0.0%');
    const coverBar = h('div', { class: 'iw-cover', style: { '--pa': (pa / 100).toFixed(4), '--pb': (pb / 100).toFixed(4), '--ga': reduced ? 1 : 0 } },
      h('div', { class: 'iw-cover__a' }, h('i', { class: 'iw-cover__shine' })),
      h('div', { class: 'iw-cover__b' }, h('i', { class: 'iw-cover__shine' })),
      h('i', { class: 'iw-cover__mid' }));
    let cover = boss ? null : h('div', { class: 'iw-res__cover iw-in' + (pa >= pb ? ' is-a' : ' is-b') },
      h('div', { class: 'iw-cover__names' },
        h('span', { class: 'ta' + (pa >= pb ? ' is-win' : '') }, pa >= pb ? crownA : null, names[0] || 'Alpha', numA),
        h('span', { class: 'tb' + (pb > pa ? ' is-win' : '') }, numB, names[1] || 'Bravo', pb > pa ? crownB : null)),
      coverBar);
    // Zone Control: a race to the middle — each bar is how far that team counted down from 100 (the score; hatched block
    // ahead of it = the penalty it still had to count off, not part of the score); the numbers count down from 100 to
    // the final count, then the penalty stamps on
    let zc = null;
    if (zd) {
      const ZC = (td ? TOWER.count : ZONES.count) || 100, W = zd.winner === 1 ? 1 : 0;
      const cnt = zd.counts.map((c) => Math.max(0, Math.ceil(c - 1e-6))), pen = zd.penalty;
      const done = (t) => clamp((ZC - cnt[t]) / ZC) * 0.5, penW = (t) => clamp(Math.min(pen[t], cnt[t]) / ZC) * 0.5;
      const pens = [0, 1].map((t) => h('em', { class: 'iw-zres__pen' + (pen[t] > 0 ? '' : ' is-none') }, `+${pen[t]}`));
      numA.textContent = String(ZC); numB.textContent = String(ZC);
      zc = { ZC, cnt, pens };
      coverBar.classList.add('iw-cover--zones');
      coverBar.style.setProperty('--pa', done(0).toFixed(4)); coverBar.style.setProperty('--pb', done(1).toFixed(4));
      coverBar.style.setProperty('--qa', penW(0).toFixed(4)); coverBar.style.setProperty('--qb', penW(1).toFixed(4));
      coverBar.append(h('i', { class: 'iw-zbar__pen is-a' }), h('i', { class: 'iw-zbar__pen is-b' }));
      cover = h('div', { class: 'iw-res__cover iw-res__cover--zones iw-in' + (W === 0 ? ' is-a' : ' is-b') },
        h('div', { class: 'iw-cover__names' },
          h('span', { class: 'ta' + (W === 0 ? ' is-win' : '') }, W === 0 ? crownA : null, names[0] || 'Alpha', numA, pens[0]),
          h('span', { class: 'iw-zres__mid' }, h('i', { html: td ? TOWER_GLYPH : ZONE_GLYPH }), td ? 'PUSH TO THE GOAL' : 'COUNT TO ZERO'),
          h('span', { class: 'tb' + (W === 1 ? ' is-win' : '') }, pens[1], numB, names[1] || 'Bravo', W === 1 ? crownB : null)),
        coverBar);
    }
    // boss: HULLBREAKER's HP drains to what was left, the clock counts up, then SUNK! / ESCAPED is stamped on it
    let bossP = null;
    if (boss) {
      const fill = h('i', { class: 'iw-rb__fill' });
      const hpNum = h('b', null, '100%'), tNum = h('b', null, '0:00');
      const pips = [1, 2, 3].map((n) => h('i', { class: 'iw-rb__pip' + (n <= (B.phase || 1) ? ' is-on' : '') }));
      const stamp = h('span', { class: 'iw-rb__stamp iw-display' }, B.defeated ? 'SUNK!' : 'ESCAPED');
      const panel = h('div', { class: 'iw-res__cover iw-res__boss iw-in' + (B.defeated ? ' is-win' : ' is-lose') },
        h('span', { class: 'iw-rb__emb', html: bossEmblem({ cracked: !!B.defeated || (B.phase || 1) >= 3 }) }),
        h('div', { class: 'iw-rb__main' },
          h('div', { class: 'iw-rb__row' }, h('span', { class: 'iw-rb__name iw-display' }, B.name), h('span', { class: 'iw-rb__phase' }, h('small', null, 'PHASE'), pips), h('span', { class: 'iw-rb__hp' }, h('small', null, 'HP'), hpNum)),
          h('div', { class: 'iw-rb__bar' }, fill, h('i', { class: 'iw-rb__notch', style: { left: '66.67%' } }), h('i', { class: 'iw-rb__notch', style: { left: '33.33%' } }))),
        h('div', { class: 'iw-rb__time' }, h('i', { html: awardIcon('stopwatch') }), h('small', null, B.defeated ? 'CLEAR TIME' : 'TIME UP'), tNum),
        stamp);
      const endHp = clamp(+B.hpLeft || 0), endT = Math.max(0, +B.time || 0);
      let lastHp = -1, lastT = -1;
      bossP = {
        el: panel,
        set: (k) => {
          const hp = 1 + (endHp - 1) * k;
          fill.style.transform = `scaleX(${hp.toFixed(4)})`;
          const hv = Math.round(hp * 100), tv = Math.floor(endT * k);
          if (hv !== lastHp) { lastHp = hv; hpNum.textContent = `${hv}%`; }
          if (tv !== lastT) { lastT = tv; tNum.textContent = clock(tv); }
        },
        land: (silent) => { panel.classList.add('is-landed'); if (!silent) { this._sfx(B.defeated ? 'splat_big' : 'ui_error'); } },
      };
    }

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

    // ---- boss: the squad ranked by damage, split over two columns (4 + 4) with the same row timeline as turf
    const bossTable = (rows, start) => {
      const best = Math.max(...players.map((p) => p.damage || 0), 1);
      const colIco = (html, title) => h('span', { class: 'iw-ttable__col', title }, h('i', { html }));
      return h('div', { class: `iw-ttable iw-ttable--a iw-ttable--boss ${win ? 'is-win' : 'is-lose'}` },
        h('div', { class: 'iw-ttable__head iw-in' },
          h('span', { class: 'iw-ttable__team' }, h('i', { class: 'iw-ttable__dot' }), start ? 'SQUAD · 5–8' : 'SQUAD · TOP 4', !start && win ? h('em', { class: 'iw-ttable__win' }, h('i', { html: GLYPHS.crown }), 'SUNK IT') : null),
          h('span', { class: 'iw-ttable__col', title: 'Damage to the boss' }, h('i', { html: awardIcon('pow') }), 'DAMAGE'),
          colIco(awardIcon('crit'), 'Weak-point hits'), colIco(SPLAT_ICON, 'Splats (crablets)'), colIco(DEATH_ICON, 'Times splatted'),
          h('span', { class: 'iw-ttable__col', title: 'Turf inked' }, h('i', { html: GLYPHS.drop }), 'TURF')),
        rows.map((p, ri) => {
          const dmgNum = h('b', null, '0');
          const dmgBar = h('i', { class: 'iw-prow__turfbar' });
          const nWeak = h('span', { class: 'iw-prow__n is-wait' }, String(p.weakHits || 0));
          const nSplat = h('span', { class: 'iw-prow__n is-wait' }, String(p.splats || 0));
          const nDeath = h('span', { class: 'iw-prow__n is-wait' }, String(p.deaths || 0));
          const nTurf = h('span', { class: 'iw-prow__n iw-prow__sm is-wait' }, fmtInt(p.turf || 0), h('small', null, 'p'));
          const badges = h('span', { class: 'iw-prow__aw' });
          const isMvp = p._aw.some((a) => a.id === 'mvp');
          const row = h('div', { class: 'iw-prow iw-in iw-in--left' + (p.isSelf ? ' is-self' : '') + (isMvp ? ' is-mvp' : '') },
            h('span', { class: 'iw-prow__w', html: weaponIcon((this._weapons()[p.weapon] || {}).kind || p.weapon) }),
            h('span', { class: 'iw-prow__name' }, h('span', { class: 'iw-prow__rank' }, String(start + ri + 1)), h('span', { class: 'iw-prow__nm' }, p.name), p.isSelf ? h('em', null, 'YOU') : null, badges),
            h('span', { class: 'iw-prow__turf' }, dmgBar, dmgNum),
            nWeak, nSplat, nDeath, nTurf,
            isMvp ? h('span', { class: 'iw-prow__stamp iw-display' }, 'MVP') : null);
          rowFx.push({ row, turfNum: dmgNum, turfBar: dmgBar, waits: [nWeak, nSplat, nDeath, nTurf], badges, turf: p.damage || 0, rel: (p.damage || 0) / best, aws: p._aw.slice(0, 3), start: 0.8 + (start + ri) * 0.1, shown: -1, done: false });
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
    if (self && Array.isArray(xp.parts)) {
      // the engine's own breakdown (Zone Control), shown when it adds up to the reported gain
      if (xp.gained > 0 && Math.abs(xp.parts.reduce((a, p) => a + (+p[1] || 0), 0) - xp.gained) <= 2) for (const [label, v] of xp.parts) if (v > 0) bd.push([label, v]);
    } else if (self) {
      const base = win ? PROGRESSION.xpWin : PROGRESSION.xpLose;
      const tx = Math.round((self.turf || 0) * PROGRESSION.xpPerTurfPoint), sx = Math.round((self.splats || 0) * PROGRESSION.xpPerSplat);
      const dx = boss ? Math.round((self.damage || 0) * 0.04) : 0;   // main.js _bossResults: damage × 0.04 XP
      if (xp.gained > 0 && Math.abs(base + tx + sx + dx - xp.gained) <= 2) {
        bd.push([win ? 'WIN BONUS' : 'MATCH', base]);
        if (dx) bd.push(['DAMAGE', dx]);
        bd.push([`TURF`, tx]);
        if (sx) bd.push(['SPLATS', sx]);
      }
    }
    let acc = 0;
    const bdEls = bd.map(([label, v]) => { const at = acc / Math.max(1, xp.gained); acc += v; return { at, el: h('span', { class: 'iw-xpb' }, h('small', null, label), h('b', null, `+${fmtInt(v)}`)) }; });
    const xpPanel = this._panel('iw-xp iw-in iw-in--up' + (bdEls.length ? ' has-bd' : ''), lvl,
      h('div', { class: 'iw-xp__mid' }, h('div', { class: 'iw-xp__row' }, h('span', null, gainEl, lvUp), nextEl), bar,
        bdEls.length ? h('div', { class: 'iw-xp__bd' }, bdEls.map((b) => b.el)) : null));

    // online: the room comes back to its lobby on its own (the host's clock) — show when, and offer to leave instead
    const online = !!(d.online || G.netm || (G.net && (G.net.state === 'match' || G.net.state === 'starting')));
    const backIn = online ? 12 : 0;
    const lobbySecs = h('b', null, String(backIn));
    const lobbyPill = online ? h('div', { class: 'iw-res__lobby iw-in iw-in--pop' }, h('span', { class: 'iw-res__lobbyring', style: { '--f': 1 } }), h('span', { class: 'iw-res__lobbytxt' }, h('small', null, 'BACK TO THE ROOM IN'), lobbySecs)) : null;
    const hostBack = online && G.net && G.net.isHost && typeof this.api.netBackToLobby === 'function';
    const rematch = hostBack
      ? this._btn({ id: 'toroom', label: 'TO THE ROOM', icon: GLYPHS.users, cls: 'iw-btn--wide iw-btn--primary iw-btn--toroom iw-in iw-in--pop', sound: 'ui_confirm', accept: () => safeCall(() => this.api.netBackToLobby()) })
      : online ? null : this._btn({ id: 'rematch', label: 'REMATCH', icon: GLYPHS.reset, cls: 'iw-btn--wide iw-btn--primary iw-in iw-in--pop', sound: 'ui_confirm', accept: () => {
        safeCall(() => this.api.rematch && this.api.rematch());
      } });
    if (hostBack) rematch.querySelector('.iw-btn__text').appendChild(h('span', { class: 'iw-btn__sub' }, 'Everyone comes with you'));
    const home = online
      ? this._btn({ id: 'leave', label: 'LEAVE ROOM', icon: GLYPHS.exit, cls: 'iw-btn--wide iw-in iw-in--pop', sound: 'ui_click', accept: () => this._openModal({
        title: 'LEAVE ROOM?', danger: true, text: 'You\u2019ll head back to the main menu. Your friends stay in the room.',
        buttons: [
          { label: 'STAY', accept: () => this._closeModal(), sound: null },
          { label: 'LEAVE', cls: 'iw-btn--danger', sound: 'ui_confirm', accept: () => { this._closeModal(true); safeCall(() => this.api.quitMatch && this.api.quitMatch()); } },
        ],
      }) })
      : this._btn({ id: 'home', label: 'MAIN MENU', icon: GLYPHS.back, cls: 'iw-btn--wide iw-in iw-in--pop', sound: 'ui_click', accept: () => {
        safeCall(() => this.api.toMainMenu && this.api.toMainMenu());
        if (this.current === 'results') this.show('main', { wipe: true });
      } });

    const el = h('div', { class: 'iw-screen iw-results' + (win ? ' is-win' : ' is-lose') + (boss ? ' is-boss' : '') },
      h('div', { class: 'iw-res__scrim' }),
      head,
      h('div', { class: 'iw-res__body' + (boss ? ' is-boss' : '') },
        boss ? bossP.el : cover,
        boss ? h('div', { class: 'iw-res__teams is-boss' }, bossTable(players.slice(0, 4), 0), bossTable(players.slice(4, 8), 4))
          : h('div', { class: 'iw-res__teams' }, table(0), table(1)),
        h('div', { class: 'iw-res__foot' }, xpPanel, h('div', { class: 'iw-res__btns' }, hostBack ? null : lobbyPill, rematch, home))),
      this._prompts([['Enter', 'A', 'Skip · Select'], [['←', '→'], 'DPad', 'Move']]));
    colorVars(el, 'ta', colors[0]);
    colorVars(el, 'tb', colors[1]);
    colorVars(el, 'tw', boss && !win ? colors[1] : colors[0]);   // boss defeat: the title splat is the boss's ink
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
    let T = -INTRO, coverDone = false, tickAcc = 0, lastA = -1, lastB = -1, badgeQueue = null, lobbyT = 0;
    const endIntro = (silent) => { if (!el.classList.contains('is-intro')) return; el.classList.remove('is-intro'); if (!silent) this._sfx('ui_confirm', 0.1); };

    const setCover = (k) => {
      if (bossP) { bossP.set(k); return; }
      coverBar.style.setProperty('--ga', k.toFixed(4));
      if (zc) {
        const va = Math.round(zc.ZC - (zc.ZC - zc.cnt[0]) * k), vb = Math.round(zc.ZC - (zc.ZC - zc.cnt[1]) * k);
        if (va !== lastA) { lastA = va; numA.textContent = String(va); }
        if (vb !== lastB) { lastB = vb; numB.textContent = String(vb); }
        return;
      }
      const va = Math.round(pa * k * 10), vb = Math.round(pb * k * 10);
      if (va !== lastA) { lastA = va; numA.textContent = (va / 10).toFixed(1) + '%'; }
      if (vb !== lastB) { lastB = vb; numB.textContent = (vb / 10).toFixed(1) + '%'; }
    };
    const landCover = (silent) => {
      if (coverDone) return;
      coverDone = true;
      setCover(1);
      if (bossP) { bossP.land(silent); return; }
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
      (r.waits || [r.nSplat, r.nDeath]).forEach((e) => e.classList.remove('is-wait'));
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
      if (boss && b.aw.id === 'mvp') { b.r.row.classList.add(silent ? 'has-stamp' : 'is-stamping', 'has-stamp'); if (!silent) this._sfx('splat_big', 0.08); }
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
      el, initial: rematch || home,
      onNav: (dir) => {
        if (dir === 'accept' && !done) { finish(); this._sfx('ui_click'); return true; } // first press skips the count-ups (no accidental rematch)
        if (dir === 'back') return true;
        return false;
      },
      tick: (dt) => {
        if (lobbyPill && lobbyPill.isConnected) {
          lobbyT += dt;
          const left = Math.max(0, backIn - lobbyT), sec = Math.ceil(left);
          if (String(sec) !== lobbySecs.textContent && sec > 0) { lobbySecs.textContent = String(sec); if (sec <= 3) restartAnim(lobbySecs, 'is-tick'); }
          if (left <= 0 && !lobbyPill.classList.contains('is-due')) { lobbyPill.classList.add('is-due'); lobbyPill.querySelector('small').textContent = 'HEADING BACK'; lobbySecs.textContent = '\u2026'; }
          lobbyPill.firstChild.style.setProperty('--f', (left / backIn).toFixed(4));
        }
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
