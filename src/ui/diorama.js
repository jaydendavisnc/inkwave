// Map diorama overlay. While the map is held, the camera rig swoops the RENDERED view up into a tilted overhead shot of
// the real stage (the live scene with its live ink — nothing is rebuilt; see CameraRig.mapK / _diorama). This layer
// pins the people and places onto that view, Splatoon-style:
//   · you (arrow = facing), your three teammates (weapon badge, name, [1]–[3]; greyed with a countdown while splatted),
//     your base ([4]) and your team's Hop Beacons ([5]–[9], [0], oldest first) — enemies are not shown
//   · a virtual map cursor (pointer stays locked: mouse deltas / right stick) that snaps to pins and tilts the diorama a
//     touch toward itself; click / A on a pin, or the number keys, to Super Jump — an ink arc previews the jump, and
//     once you (or a teammate) jump it stays up as the travel line: drawn out while charging, travelled in flight with
//     the jumper's pin riding it, a landing ring on the floor (_liveJumps)
//   · a miniature finish: tilt-shift blur bands, a soft vignette, the stage name
//   · death markers (squid-skulls in the victim's ink where anyone was just splatted — main.js G.deathMarks)
//   · splatted: the map still opens to PLAN the Super Jump you'll take on respawn — picks queue it (player.js
//     queueJump), the queued pin is marked, the arc runs from your base, and a panel shows the respawn countdown + plan
// Per frame it only projects a handful of points and writes transforms / CSS vars when they change.
import { h, clamp } from './ui-util.js';
import { keycap, weaponIcon, richText, SUB_ICONS } from './ui-icons.js';
import { DEATH_MARK_SVG } from './hud.js';
import { G } from '../core/ctx.js';
import { superJumpInfo } from '../game/minimap.js';
import * as THREE from 'three';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
// the super-jump lob on screen: a quadratic from (x0,y0) to (x1,y1) bowed out to the side facing up-screen (a straight
// up/down jump bows sideways instead of folding back). Shared by the planned-jump preview and the live travel line.
function lobCtl(x0, y0, x1, y1, out) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  let nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
  if (ny > 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
  const lift = Math.min(170, len * 0.4 + 30);
  out.x = (x0 + x1) / 2 + nx * lift; out.y = (y0 + y1) / 2 + ny * lift - lift * 0.25;
  return out;
}
const qAt = (a, c, b, u) => (1 - u) * (1 - u) * a + 2 * u * (1 - u) * c + u * u * b;
const f1 = (n) => n.toFixed(1);
// the quadratic's piece [u0, u1] as its own quadratic (De Casteljau), as an SVG path
function qPiece(x0, y0, cx, cy, x1, y1, u0, u1) {
  const ax = qAt(x0, cx, x1, u0), ay = qAt(y0, cy, y1, u0), bx = qAt(x0, cx, x1, u1), by = qAt(y0, cy, y1, u1);
  // control of the sub-curve: the tangent lines at both ends meet there
  const tx0 = (1 - u0) * cx + u0 * x1 - ((1 - u0) * x0 + u0 * cx), ty0 = (1 - u0) * cy + u0 * y1 - ((1 - u0) * y0 + u0 * cy);
  const k = (u1 - u0);
  return `M${f1(ax)} ${f1(ay)} Q${f1(ax + tx0 * k)} ${f1(ay + ty0 * k)} ${f1(bx)} ${f1(by)}`;
}
function qLen(x0, y0, cx, cy, x1, y1, u0, u1) {
  let L = 0, px = qAt(x0, cx, x1, u0), py = qAt(y0, cy, y1, u0);
  for (let i = 1; i <= 8; i++) { const u = u0 + ((u1 - u0) * i) / 8, x = qAt(x0, cx, x1, u), y = qAt(y0, cy, y1, u); L += Math.hypot(x - px, y - py); px = x; py = y; }
  return L;
}
const _jf = { x: 0, y: 0, z: 0 }, _jt = { x: 0, y: 0, z: 0 }, _ji = { phase: '', k: 0, e: 0, home: false }, _ctl = { x: 0, y: 0 };
const NJ = 4;             // live super-jump lines: you + three teammates
const K = '#15121c';
const HOME_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="46" rx="22" ry="8.5" fill="none" stroke="${K}" stroke-width="8"/><ellipse cx="32" cy="46" rx="22" ry="8.5" fill="none" stroke="#fff" stroke-width="4"/><path d="M32 8 L32 34 M21 24 L32 36 L43 24" fill="none" stroke="${K}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 8 L32 34 M21 24 L32 36 L43 24" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ARROW = `<svg viewBox="-16 -16 32 32" aria-hidden="true"><path d="M0 -12 L10 10 L0 5 L-10 10 Z" fill="${K}" stroke="${K}" stroke-width="5" stroke-linejoin="round"/><path d="M0 -12 L10 10 L0 5 L-10 10 Z" fill="#fff"/></svg>`;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// Zone Control tag icon (the HUD's zone box): fill = currentColor
const ZONE_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="7" width="18" height="18" rx="3.5" fill="currentColor" stroke="${K}" stroke-width="3"/><path d="M3.5 11 V6 a2.5 2.5 0 0 1 2.5 -2.5 H11 M21 3.5 H26 a2.5 2.5 0 0 1 2.5 2.5 V11 M28.5 21 V26 a2.5 2.5 0 0 1 -2.5 2.5 H21 M11 28.5 H6 a2.5 2.5 0 0 1 -2.5 -2.5 V21" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>`;
// Tower Command tag icon (the HUD's tower): fill = currentColor
const TOWER_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="14.6" y="7" width="2.8" height="14" fill="#fff" stroke="${K}" stroke-width="2"/><circle cx="16" cy="7" r="3.3" fill="currentColor" stroke="${K}" stroke-width="2.4"/><path d="M4.5 20 h23 l-2.6 7.5 h-17.8 z" fill="currentColor" stroke="${K}" stroke-width="3" stroke-linejoin="round"/></svg>`;
const NPIN = 11;          // 0–2 allies, 3 base, 4 you, 5–10 team Hop Beacons
const beaconsOf = (team) => (G.subs ? G.subs.beaconsFor(team).sort((x, y) => x.born - y.born) : []);

export class DioramaOverlay {
  constructor(root) {
    this.pins = Array.from({ length: NPIN }, (_, i) => this._pin(i));
    // (parsed as markup so the <svg> + paths get the SVG namespace — an h('svg') element is an HTML element and never drew)
    this.arcWrap = h('div', { class: 'iw-dio__arcw', html: '<svg class="iw-dio__arc" aria-hidden="true"><path class="o"/><path class="i"/></svg>'
      + `<svg class="iw-dio__jumps" aria-hidden="true">${'<g class="iw-dio-j"><path class="r"/><path class="o"/><path class="d"/><path class="i"/></g>'.repeat(NJ)}</svg>` });
    this.arc = this.arcWrap.firstChild;
    // super jumps in progress on your team (yours + teammates'): the planned arc's lob, travelled live
    this.jumps = [...this.arcWrap.lastChild.children].map((g) => { g.style.display = 'none'; return { g, r: g.children[0], o: g.children[1], d: g.children[2], i: g.children[3], on: false, key: '', dk: '', cls: '', x: 0, y: 0 }; });
    this.jpos = new Map();   // actor → { x, y } where its pin rides its travel line
    this.cursor = h('div', { class: 'iw-dio__cur' }, h('i'));
    this.title = h('b', { class: 'iw-dio__name iw-display' }, '');
    this.when = h('small', { class: 'iw-dio__when' }, '');
    this.foot = h('div', { class: 'iw-dio__foot' });
    // death markers (a fixed pool ↔ main.js's pooled records)
    this.dms = Array.from({ length: 12 }, () => ({ el: h('i', { class: 'iw-dio-dm', html: DEATH_MARK_SVG }), on: false, id: 0 }));
    // splatted: respawn countdown + the planned Super Jump
    this.planN = h('b', { class: 'iw-dio-plan__n' }, '5');
    this.planT = h('b', { class: 'iw-dio-plan__t' });
    this.planS = h('small', { class: 'iw-dio-plan__s' });
    this.plan = h('div', { class: 'iw-dio-plan' },
      h('span', { class: 'iw-dio-plan__ring' }, this.planN, h('small', null, 'RESPAWN')),
      h('span', { class: 'iw-dio-plan__txt' }, this.planT, this.planS));
    this.el = h('div', { class: 'iw-dio', 'aria-hidden': 'true' },
      h('div', { class: 'iw-dio__tilt iw-dio__tilt--top' }), h('div', { class: 'iw-dio__tilt iw-dio__tilt--bot' }),
      h('div', { class: 'iw-dio__vig' }),
      this.arcWrap,
      (this.zLayer = h('div', { class: 'iw-dio__zones' })),
      h('div', { class: 'iw-dio__pins' }, this.pins.map((p) => p.el)),
      // (over the pins: what you just splatted is usually right in front of you — under your own badge)
      h('div', { class: 'iw-dio__dms' }, this.dms.map((d) => d.el)),
      this.cursor,
      h('div', { class: 'iw-dio__head' }, h('small', { class: 'iw-dio__kicker' }, 'STAGE MAP'), this.title, this.when),
      this.plan,
      this.foot);
    root.prepend(this.el);
    this.k = 0; this.on = false;
    this.cx = 0.5; this.cy = 0.62; this.hover = -1; this.hasCursor = false;
    this._last = {};
    this.ztags = [];
  }

  _pin(i) {
    const self = i === 4, home = i === 3, beacon = i >= 5;
    const icon = h('span', { class: 'iw-pin__icon', html: self ? ARROW : home ? HOME_ICON : beacon ? (SUB_ICONS.beacon || '') : '' });
    const name = h('span', { class: 'iw-pin__name' }, self ? 'YOU' : home ? 'BASE' : beacon ? 'BEACON' : '');
    const state = h('span', { class: 'iw-pin__state' });
    const el = h('div', { class: 'iw-pin' + (self ? ' iw-pin--self' : '') + (home ? ' iw-pin--home' : '') + (beacon ? ' iw-pin--beacon' : '') },
      h('span', { class: 'iw-pin__ground' }), h('span', { class: 'iw-pin__stem' }),
      h('span', { class: 'iw-pin__badge' }, icon, h('span', { class: 'iw-pin__pulse' })),
      self ? null : h('span', { class: 'iw-pin__key', html: keycap(String(beacon ? i % 10 : i + 1)) }),
      name, state,
      self || home ? null : h('span', { class: 'iw-pin__queue' }, 'ON RESPAWN'));
    return { el, icon, name, state, x: 0, y: 0, vis: false, key: '', weapon: null, target: null, ok: false, queued: false };
  }

  update(dt, k) {
    const was = this.on;
    this.k = k;
    this.on = k > 0.002;
    if (this.on !== was) {
      this.el.classList.toggle('is-on', this.on);
      document.body.classList.toggle('iw-dio-on', this.on);
      if (this.on) { this.cx = 0.5; this.cy = 0.62; this.hover = -1; G.audio?.play?.('ui_toggle', { volume: 0.4, pitch: 0.85 }); this._head(); }
      else if (G.rig) { G.rig.dioLook.x = 0; G.rig.dioLook.y = 0; }
    }
    if (!this.on) return;
    const a = smooth(0.3, 0.95, k);
    if (Math.abs(a - (this._last.a ?? -1)) > 0.004) { this._last.a = a; this.el.style.opacity = a.toFixed(3); this.el.style.setProperty('--pinK', smooth(0.62, 1, k).toFixed(3)); }
    const me = G.match?.local;
    const cam = G.camera, W = innerWidth, H = innerHeight;
    if (!me || !cam) return;
    const allies = (G.actors || []).filter((o) => o.team === me.team && o !== me);
    const col = G.teamHex?.[me.team] || '#ff8a14';
    if (col !== this._last.col) { this._last.col = col; this.el.style.setProperty('--c', col); }
    const canJump = !!(me.alive && me.canSuperJump && me.canSuperJump());
    // splatted in a live round: picks plan the respawn's Super Jump instead (player.js queueJump)
    const ctl = G.match?.controller;
    const planning = !!(ctl && ctl.queueJump && !me.alive && G.match.state === 'playing');
    const q = planning ? ctl.jumpQueue : null;
    if (planning !== this._planning) { this._planning = planning; this.el.classList.toggle('is-planning', planning); this._head(); this._last.plan = null; }
    const beacons = beaconsOf(me.team);
    this._liveJumps(dt, me, cam, W, H);
    // ---- pins
    for (let i = 0; i < NPIN; i++) {
      const p = this.pins[i];
      let tgt = null, ok = false, label = '', st = '', dead = false, weapon = null;
      if (i >= 5) {
        const b = beacons[i - 5];
        // (its jumps left as lights, like the ones over the beacon: ●● fresh, ●○ its last jump)
        if (b) { tgt = b.pos; ok = true; label = 'BEACON'; st = '●'.repeat(Math.max(0, b.uses)) + '○'.repeat(Math.max(0, (b.sub?.uses || 2) - b.uses)); }
        p.target = b || null;
        p.queued = !!(q && b && q.kind === 'beacon' && q.target === b);
      } else if (i < 3) {
        const o = allies[i];
        if (o) {
          // (planning: a teammate mid Super Jump can be picked — you'd land where they come down)
          tgt = o.pos; ok = !!(o.alive && (planning || !o.superJumpState)); label = o.name; weapon = o.weaponId || o.weapon?.kind || 'shooter';
          dead = !o.alive; if (dead) st = String(Math.max(1, Math.ceil(o.respawnTimer || 0)));
          else if (o.superJumpState) st = '↑';
        }
      } else if (i === 3) { tgt = G.level?.spawnPads?.[me.team] || null; ok = !!tgt; }
      else { tgt = me.visualPos ? me.visualPos(_v2) : me.pos; ok = true; dead = !me.alive; }
      if (i < 5) { p.target = i < 3 ? allies[i] || null : null; p.queued = !!(q && i < 3 && q.kind === 'ally' && q.target === allies[i]); }
      p.ok = ok && (canJump || planning) && i !== 4;
      if (!tgt) { if (p.vis) { p.vis = false; p.el.style.display = 'none'; } continue; }
      _v.set(tgt.x, tgt.y + 0.1, tgt.z).project(cam);
      const behind = _v.z > 1;
      let x = (_v.x * 0.5 + 0.5) * W, y = (0.5 - _v.y * 0.5) * H;
      // a Super Jump in the air: the pin rides its travel line
      const ride = i === 4 ? this.jpos.get(me) : i < 3 && allies[i] ? this.jpos.get(allies[i]) : null;
      if (ride) { x = ride.x; y = ride.y; }
      p.x = x; p.y = y;
      if (behind) { if (p.vis) { p.vis = false; p.el.style.display = 'none'; } continue; }
      if (!p.vis) { p.vis = true; p.el.style.display = ''; }
      p.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      if (i === 4) {
        // facing arrow: screen-space direction of the player's forward
        const f = me.yaw || 0;
        _v2.set(tgt.x + Math.sin(f) * 3, tgt.y + 0.1, tgt.z + Math.cos(f) * 3).project(cam);
        const sx = (_v2.x - _v.x) * W, sy = -(_v2.y - _v.y) * H;   // screen space, y down
        p.icon.style.transform = `rotate(${Math.atan2(sx, -sy).toFixed(3)}rad)`;   // the arrow art points up
      }
      const key = `${label}|${st}|${dead ? 1 : 0}|${p.ok ? 1 : 0}|${this.hover === i ? 1 : 0}|${weapon}|${p.queued ? 1 : 0}`;
      if (key !== p.key) {
        p.key = key;
        if (i < 3) {
          p.name.textContent = label;
          if (weapon !== p.weapon) { p.weapon = weapon; p.icon.innerHTML = weaponIcon(weapon); }
        }
        p.state.textContent = st;
        p.el.classList.toggle('is-dead', dead);
        p.el.classList.toggle('is-ok', p.ok);
        p.el.classList.toggle('is-hover', this.hover === i);
        if (p.queued !== p._q) { p._q = p.queued; p.el.classList.toggle('is-queued', p.queued); if (p.queued) this._flash(i); }
      }
    }
    this._zones(cam, W, H, me);
    this._tower(cam, W, H, me);
    this._deathMarks(cam, W, H);
    if (planning) this._plan(me, q);
    // ---- map cursor (pointer stays locked in play: steer with mouse deltas / right stick; snaps to pins)
    const inp = G.input;
    let moved = false;
    if (inp) {
      const mdx = inp.locked ? inp.mouse.dx || 0 : 0, mdy = inp.locked ? inp.mouse.dy || 0 : 0;
      let sx = 0, sy = 0;
      if (inp.pad && inp.padAxis) { sx = inp.padAxis(2) || 0; sy = inp.padAxis(3) || 0; if (Math.hypot(sx, sy) < 0.15) sx = sy = 0; }
      if (mdx || mdy || sx || sy) {
        this.cx = clamp(this.cx + mdx / W * 1.1 + sx * dt * 0.75, 0.02, 0.98);
        this.cy = clamp(this.cy + mdy / H * 1.1 + sy * dt * 0.75, 0.04, 0.96);
        moved = true; this.hasCursor = true;
      }
    }
    // snap: nearest jumpable pin within reach
    let best = -1, bd = 72;
    for (let i = 0; i < NPIN; i++) {
      if (i === 4) continue;
      const p = this.pins[i];
      if (!p.vis) continue;
      const d = Math.hypot(p.x - this.cx * W, p.y - 34 - this.cy * H);
      if (d < bd) { bd = d; best = i; }
    }
    if (best !== this.hover) {
      this.hover = best;
      if (best >= 0 && this.k > 0.7) G.audio?.play?.('ui_hover', { volume: 0.4 });
    }
    const cxp = this.cx * W, cyp = this.cy * H;
    if (this.hasCursor !== this._last.hc) { this._last.hc = this.hasCursor; this.cursor.classList.toggle('is-on', this.hasCursor); }
    this.cursor.style.transform = `translate3d(${cxp.toFixed(1)}px,${cyp.toFixed(1)}px,0)`;
    this.cursor.classList.toggle('is-snap', this.hover >= 0);
    // parallax: the diorama leans a touch toward where you point
    if (G.rig) { G.rig.dioLook.x = (this.cx - 0.5) * 2; G.rig.dioLook.y = (this.cy - 0.55) * 2; }
    // click / A on a pin → super jump (number keys are handled by the player controller; flash their pin)
    if (inp && this.k > 0.7) {
      const click = (inp.locked && inp.mouse.leftPressed) || inp.padPressed?.has?.(0);
      if (click && this.hover >= 0) this._jump(this.hover, me);
      for (let i = 0; i < 4; i++) if (inp.wasPressed?.('Digit' + (i + 1))) this._flash(i);
      for (let i = 5; i < NPIN; i++) if (this.pins[i].vis && inp.wasPressed?.('Digit' + (i % 10))) this._flash(i);
    }
    // ---- jump arc preview (splatted: from your base — where you'll respawn — to the hovered pin, else the planned one)
    let sp = this.pins[4], hp = this.hover >= 0 ? this.pins[this.hover] : null, showArc;
    if (planning) {
      sp = this.pins[3];
      if (!(hp && hp.ok && this.hover !== 3)) hp = this.pins.find((pp) => pp.queued) || null;
      showArc = !!(hp && hp.vis && sp.vis && hp !== sp);
    } else showArc = !!(hp && hp.vis && sp.vis && canJump && (this.hover === 3 || hp.ok));
    if (showArc !== this._last.arc) { this._last.arc = showArc; this.arc.classList.toggle('is-on', showArc); }
    if (showArc) {
      // a lob bowed out to the side facing up-screen (lobCtl) — the live travel line keeps this shape once you jump
      const x0 = sp.x, y0 = sp.y, x1 = hp.x, y1 = hp.y;
      const { x: cx, y: cy } = lobCtl(x0, y0, x1, y1, _ctl);
      const d = `M${x0.toFixed(1)} ${y0.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
      if (d !== this._last.d) { this._last.d = d; for (const path of this.arc.children) path.setAttribute('d', d); }
    }
    if (moved) this._last.mv = 1;
  }

  // Super jumps in progress on your team — yours bold, teammates' thin: the planned arc's lob from where the jump took
  // off to where it lands, with a landing ring on the floor. Charging, the line draws out to the landing and the ring
  // closes in on it; in flight the flown part fades to a thin trail, ink dots stream on ahead (anchored to the line, not
  // to its moving start) and the jumper's pin rides the line (this.jpos → the pins loop).
  _liveJumps(dt, me, cam, W, H) {
    this.jpos.clear();
    this._jclk = (this._jclk || 0) + dt;
    const t = this._jclk;
    const acts = G.match && !G.match.attract ? G.match.actors : null;
    let n = 0;
    if (acts) for (let pass = 0; pass < 2 && n < NJ; pass++) for (const a of acts) {
      if (n >= NJ) break;
      if ((pass === 0) !== (a === me) || !a.alive || a.team !== me.team || !a.superJumpState || !superJumpInfo(a, _jf, _jt, _ji)) continue;
      _v.set(_jf.x, _jf.y + 0.1, _jf.z).project(cam);
      if (_v.z > 1) continue;
      const x0 = (_v.x * 0.5 + 0.5) * W, y0 = (0.5 - _v.y * 0.5) * H;
      _v.set(_jt.x, _jt.y + 0.1, _jt.z).project(cam);
      if (_v.z > 1) continue;
      const x1 = (_v.x * 0.5 + 0.5) * W, y1 = (0.5 - _v.y * 0.5) * H;
      const { x: cx, y: cy } = lobCtl(x0, y0, x1, y1, _ctl);
      const J = _ji, flight = J.phase === 'flight', self = a === me;
      const reach = flight ? 1 : 1 - Math.pow(1 - J.k, 3);
      const done = flight ? J.e : 0;
      const S = this.jumps[n++];
      if (flight) { S.x = qAt(x0, cx, x1, done); S.y = qAt(y0, cy, y1, done); this.jpos.set(a, S); }
      if (!S.on) { S.on = true; S.g.style.display = ''; }
      const cls = `iw-dio-j${self ? '' : ' is-ally'}${flight ? '' : ' is-charge'}`;
      if (cls !== S.cls) { S.cls = cls; S.g.setAttribute('class', cls); }
      const ahead = reach - done > 0.002 ? qPiece(x0, y0, cx, cy, x1, y1, done, reach) : '';
      if (ahead !== S.key) { S.key = ahead; S.o.setAttribute('d', ahead); S.i.setAttribute('d', ahead); }
      const trail = done > 0.002 ? qPiece(x0, y0, cx, cy, x1, y1, 0, done) : '';
      if (trail !== S.dk) { S.dk = trail; S.d.setAttribute('d', trail); }
      // dash period 15 px (2 on / 13 off); flowing toward the landing at 40 px/s
      const off = done > 0 ? qLen(x0, y0, cx, cy, x1, y1, 0, done) : 0;
      S.i.style.strokeDashoffset = ((((off - t * 40) % 15) + 15) % 15).toFixed(1);
      // landing ring on the floor (none for an Ink Jet / Zipline jump home: its beacon marks the spot)
      let ring = '';
      if (!J.home) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 9);
        const R = (self ? 1.2 + 0.3 * pulse : 0.9 + 0.15 * pulse) * (1 + (flight ? 0 : Math.pow(1 - J.k, 2) * 1.8));
        for (let s = 0; s < 20; s++) {
          const ang = (s / 20) * Math.PI * 2;
          _v.set(_jt.x + Math.cos(ang) * R, _jt.y + 0.06, _jt.z + Math.sin(ang) * R).project(cam);
          ring += `${s ? 'L' : 'M'}${f1((_v.x * 0.5 + 0.5) * W)} ${f1((0.5 - _v.y * 0.5) * H)}`;
        }
        ring += 'Z';
      }
      S.r.setAttribute('d', ring);
    }
    for (let i = n; i < NJ; i++) { const S = this.jumps[i]; if (S.on) { S.on = false; S.g.style.display = 'none'; } }
  }

  // Zone Control: a tag over every zone — the operational objective's in its holder's ink (light grey while neutral) with
  // its name, the others small and faint so the next rotation isn't a surprise. The zones themselves are drawn on the
  // stage floor (src/fx/zoneMarks.js), which the map view is looking straight down at.
  _zones(cam, W, H, me) {
    const Z = G.match && !G.match.attract ? G.match.zones : null;
    const n = Z ? Z.zones.length : 0;
    while (this.ztags.length < n) {
      const icon = h('i', { class: 'iw-dio-z__i', html: ZONE_ICON }), label = h('span', { class: 'iw-dio-z__l' });
      const el = h('div', { class: 'iw-dio-z' }, h('span', { class: 'iw-dio-z__tag' }, icon, label));
      this.zLayer.appendChild(el);
      this.ztags.push({ el, icon, label, vis: true, key: '' });
    }
    for (let i = 0; i < this.ztags.length; i++) {
      const tg = this.ztags[i], z = i < n ? Z.zones[i] : null;
      if (z) _v.set(z.center[0], z.center[1] + 0.3, z.center[2]).project(cam);
      if (!z || _v.z > 1) { if (tg.vis) { tg.vis = false; tg.el.style.display = 'none'; } continue; }
      if (!tg.vis) { tg.vis = true; tg.el.style.display = ''; }
      tg.el.style.transform = `translate3d(${((_v.x * 0.5 + 0.5) * W).toFixed(1)}px,${((0.5 - _v.y * 0.5) * H).toFixed(1)}px,0)`;
      const active = Z.active.zones.includes(z);
      const held = z.owner === 0 || z.owner === 1;
      const col = active && held ? (G.teamHex?.[z.owner] || '#fff') : '#dcd7e6';
      // a two-zone centre: one label (on its first zone), the other zone just its icon
      const first = z.kind !== 'center' || Z.zones.find((q) => q.kind === 'center') === z;
      const label = !first ? '' : z.kind === 'center' ? 'CENTRE' : z.home === me.team ? 'YOUR SIDE' : 'ENEMY SIDE';
      const key = `${active ? 1 : 0}|${col}|${label}`;
      if (key === tg.key) continue;
      tg.key = key;
      tg.label.textContent = label;
      tg.el.style.setProperty('--zc', col);
      tg.el.classList.toggle('is-active', active);
      tg.el.classList.toggle('is-held', active && held);
      tg.el.classList.toggle('is-icon', !label);
    }
  }

  // Tower Command: one tag over the tower, in the ink of the team in control (warm yellow while neutral)
  _tower(cam, W, H, me) {
    const T = G.match && !G.match.attract ? G.match.tower : null;
    if (!this.ttag) {
      const label = h('span', { class: 'iw-dio-z__l' }, 'TOWER');
      this.ttag = { el: h('div', { class: 'iw-dio-z is-active is-held' }, h('span', { class: 'iw-dio-z__tag' }, h('i', { class: 'iw-dio-z__i', html: TOWER_ICON }), label)), label, vis: true, col: '' };
      this.zLayer.appendChild(this.ttag.el);
    }
    const tg = this.ttag;
    if (T) _v.set(T.pos.x, T.top + 1.4, T.pos.z).project(cam);
    if (!T || _v.z > 1) { if (tg.vis) { tg.vis = false; tg.el.style.display = 'none'; } return; }
    if (!tg.vis) { tg.vis = true; tg.el.style.display = ''; }
    tg.el.style.transform = `translate3d(${((_v.x * 0.5 + 0.5) * W).toFixed(1)}px,${((0.5 - _v.y * 0.5) * H).toFixed(1)}px,0)`;
    const col = T.owner >= 0 ? (G.teamHex?.[T.owner] || '#fff') : '#ffd54a';
    if (col !== tg.col) { tg.col = col; tg.el.style.setProperty('--zc', col); }
    const txt = T.owner < 0 ? 'TOWER' : T.owner === me?.team ? 'OUR TOWER' : 'THEIR TOWER';
    if (tg.label.textContent !== txt) tg.label.textContent = txt;
  }

  _jump(i, me) {
    const p = this.pins[i];
    // splatted: plan (queue) the jump for the respawn — never a jump now (player.js queueJump plays the cue)
    const ctl = G.match?.controller;
    if (me && !me.alive && ctl?.queueJump && G.match.state === 'playing') {
      if (i !== 4) { ctl.queueJump(i === 3 ? 'base' : i >= 5 ? 'beacon' : 'ally', i === 3 ? null : p.target); this._flash(i); }
      return;
    }
    if (!me || !me.canSuperJump || !me.canSuperJump()) { G.audio?.play?.('ui_error', { volume: 0.5 }); return; }
    let ok = false;
    if (i === 3) { const pad = G.level?.spawnPads?.[me.team]; ok = pad ? me.superJump(pad.clone()) : false; }
    else if (i >= 5) ok = !!(p.target && G.subs && G.subs.jumpToBeacon(me, p.target));
    else if (p.target && p.target.alive && !p.target.superJumpState) ok = me.superJump(p.target);
    this._flash(i);
    G.audio?.play?.(ok ? 'ui_confirm' : 'ui_error', { volume: 0.55 });
  }

  _flash(i) {
    const el = this.pins[i]?.el; if (!el) return;
    el.classList.remove('is-press'); void el.offsetWidth; el.classList.add('is-press');
  }

  _head() {
    const m = G.game?.mapDef;
    this.title.textContent = (m?.name || 'Stage').toUpperCase();
    this.when.textContent = G.game?.time === 'dusk' ? 'DUSK' : 'DAY';
    const pad = G.input?.lastDevice === 'pad';
    const plan = !!this._planning;
    this.foot.innerHTML = pad
      ? richText(plan ? 'Right stick to point · A or D-pad to plan your Super Jump · release VIEW to close' : 'Right stick to point · A or D-pad to Super Jump · release VIEW to close')
      : `${keycap('1')}${keycap('2')}${keycap('3')} <span>${plan ? 'Plan a jump to a teammate' : 'Super Jump to a teammate'}</span> ${keycap('4')} <span>${plan ? 'Base (no jump)' : 'Base'}</span>` +
        (G.match?.local && beaconsOf(G.match.local.team).length ? ` ${keycap('5')}–${keycap('0')} <span>Beacons</span>` : '') +
        ` <em>·</em> <span>Point + click a pin</span> <em>·</em> <span>release</span> ${keycap('TAB')}`;
  }

  // death markers: a squid-skull in the victim's ink on the spot, fading with the record (main.js G.deathMarks)
  _deathMarks(cam, W, H) {
    const list = G.deathMarks;
    for (let i = 0; i < this.dms.length; i++) {
      const e = this.dms[i], d = list && list[i];
      let show = !!(d && d.on);
      if (show) { _v.set(d.x, d.y + 0.05, d.z).project(cam); show = _v.z < 1; }
      if (!show) { if (e.on) { e.on = false; e.el.style.display = 'none'; } continue; }
      if (!e.on) { e.on = true; e.el.style.display = 'block'; }
      if (e.id !== d.id) {
        e.id = d.id;
        e.el.style.setProperty('--dc', G.teamHex?.[d.team] || '#fff');
        e.el.classList.remove('is-new'); void e.el.offsetWidth; e.el.classList.add('is-new');
      }
      e.el.style.transform = `translate3d(${((_v.x * 0.5 + 0.5) * W).toFixed(1)}px,${((0.5 - _v.y * 0.5) * H).toFixed(1)}px,0)`;
      e.el.style.opacity = d.k.toFixed(2);
    }
  }

  // splatted: the respawn countdown + what's planned
  _plan(me, q) {
    const n = String(Math.max(1, Math.ceil(me.respawnTimer || 0)));
    if (n !== this._last.planN) { this._last.planN = n; this.planN.textContent = n; }
    const key = q ? `${q.kind}|${q.name}` : '';
    if (key === this._last.plan) return;
    const first = this._last.plan == null;
    this._last.plan = key;
    this.plan.classList.toggle('is-queued', !!q);
    this.planT.textContent = q ? `SUPER JUMP \u2192 ${q.name.toUpperCase()}` : 'PLAN YOUR SUPER JUMP';
    this.planS.textContent = q ? 'Launches on respawn \u00b7 pick again to change' : 'Pick a teammate or beacon to jump to on respawn';
    if (!first) this.plan.animate([{ scale: '1.08' }, { scale: '1' }], { duration: 320, easing: 'cubic-bezier(.34,1.8,.64,1)' });
  }
}
