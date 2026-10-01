// INKWAVE — who's ahead, on the top bar. The HUD owns one: `hud.lead = new LeadHud(hud)`, driven by hud.update(dt, frame).
//
// Each team's roster group (hud.squads: yours on the left, theirs on the right) has three sizes — grown (LEAD.grow),
// normal, shrunk (LEAD.shrink), scaled from its inner edge so it never runs into the timer or the count badges — plus a
// small bouncing banner hung under it (LEAD / DANGER, in that team's ink). When a team takes the lead a callout says
// so — "WE TOOK THE LEAD!" / "WE LOST THE LEAD!" (the HUD's callout banner, in the new leader's ink) — and a short
// synthesized sting plays: lead_ours rising, lead_theirs falling
// (src/audio/audio.js; through the SFX bus, so the game's volume / mute apply).
//
//   • Turf War: the live share of the inked turf (G.paint.coverage(): O(1), sampled LEAD.turf.sampleHz times a second).
//     A close game (e.g. 45 vs 40 % of the map) → both normal. One side visibly ahead (≥ 58 % of the inked turf, or
//     10 points more of the map) → it grows a little and the other shrinks a little, and the leader gets a short LEAD
//     pop when it takes it. A near-landslide (twice the other team's turf, ≈ 67 / 33) → a bouncing DANGER banner on the
//     losing side as well.
//   • Tower Command: the lead is the better score (TowerCommand.scores(): the lower count; equal counts are split by
//     who got there first, as the badges show; 100 / 100 = nobody). The leader grows and has a LEAD banner. The team
//     behind shrinks while the leader controls the tower (not contested) on the trailing team's half of the track,
//     i.e. is pushing into its side; otherwise — the trailing team riding it on the leader's half included — it's normal.
//   • Zone Control: the lead is the better (lower) count; level = nobody. The leader grows and has a LEAD banner. The
//     team behind shrinks while the leader holds the live objective, and is back to normal as soon as it contests it
//     (inks ≥ ZONES.warn of a held zone, the zones:contest line, with its re-arm hysteresis) or the objective isn't the
//     leader's.
// Nothing flickers: every change needs to hold for a moment (LEAD.hold) and the turf thresholds have hysteresis. The
// sting plays once per real lead change (a team that dips to level and comes back doesn't sting again).
//
// Everything is read from synced match state — ink is replicated splat-for-splat online, zone counts / control follow the
// host's records and the tower's position / control / scores too — so every screen shows the same thing. Off in
// practice and boss mode. hud.lead.state() reports it all (tests: tools/botlab/tests/hud-lead.js).
import { h } from './ui-util.js';
import { G } from '../core/ctx.js';
import { ZONES } from '../config.js';

export const LEAD = {
  grow: 1.18, shrink: 0.86,   // (styles/hud.css .iw-squad.is-grow / .is-shrink use these)
  // Turf War: s = a team's share of the inked turf (a / (a + b)); gap = the difference in whole-map coverage (a − b).
  // (Tuned on all-bot matches: 45 vs 40 % of the map reads as close; 44 vs 34 or 30 vs 20 as a lead; 2 : 1 as a rout.)
  turf: {
    sampleHz: 2,
    minInked: 0.2,                 // nothing shows until a fifth of the map is inked (the opening base-painting is noise)
    ahead: 0.58, aheadGap: 0.05,   // a visible lead: ≥ 58 % of the inked turf (and ≥ 5 points more of the map) …
    wideGap: 0.1, wideShare: 0.555,  //   … or 10 points more of the map at ≥ 55.5 % (late on, most of it inked)
    stay: 0.545, stayGap: 0.03,    // … and it's kept while ≥ 54.5 % and ≥ 3 points more
    slide: 0.665, slideOff: 0.64,  // DANGER: a near-landslide — twice the other team's turf — and where it ends
    slideGap: 0.08,
    show: 2.8,                     // s the LEAD pop stays up after a team takes the lead (turf has no standing banner)
  },
  hold: { lead: 0.4, none: 1.0, size: 0.45, turf: 1.0 },   // s a new state must hold before it shows
  towerHalf: 0.3,                  // m past the centre before the tower counts as on a team's half
  stingGap: 3,                     // s between two stings at least
};
const WARN = ZONES.warn ?? 0.3;
const K = '#15121c';
const LEAD_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4.5 11.5 L10.5 17.5 L16 6.5 L21.5 17.5 L27.5 11.5 L25 26 H7 Z" fill="#fff" stroke="${K}" stroke-width="3.4" stroke-linejoin="round"/><circle cx="16" cy="21" r="2.1" fill="${K}"/></svg>`;
const DANGER_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.5 L30 28 H2 Z" fill="#fff" stroke="${K}" stroke-width="3.4" stroke-linejoin="round"/><path d="M16 12 V19" stroke="${K}" stroke-width="3.8" stroke-linecap="round"/><circle cx="16" cy="23.6" r="2.2" fill="${K}"/></svg>`;

// a value that only changes once the new one has been wanted for `hold` s
class Settle {
  constructor(v) { this.set(v); }
  set(v) { this.v = this.c = v; this.t = 0; }
  feed(want, dt, hold) {
    if (want === this.v) { this.c = want; this.t = 0; return false; }
    if (want !== this.c) { this.c = want; this.t = 0; }
    this.t += dt;
    if (this.t + 1e-9 < hold) return false;
    this.v = want; this.t = 0;
    return true;
  }
}

export class LeadHud {
  constructor(hud) {
    this.hud = hud;
    this.sides = hud.squads.map((sq, side) => this._buildSide(sq, side));
    this.stings = 0;
    this._reset(null);
  }

  _buildSide(sq, side) {
    const ico = h('i', { class: 'iw-lead__ico', html: LEAD_ICON });
    const txt = h('b', { class: 'iw-lead__txt iw-display' }, 'LEAD');
    const el = h('div', { class: `iw-lead iw-lead--${side ? 'b' : 'a'}` },
      h('span', { class: 'iw-lead__tag' }, h('span', { class: 'iw-lead__in' }, ico, txt)));
    sq.append(el);   // (after the four badges: hud._updSquads only walks children 0–3)
    return { sq, el, ico, txt, size: 'norm', kind: null };
  }

  _reset(m) {
    this.m = m;
    this.mode = null;
    this.me = 0;
    this.t = 0;
    this.leader = new Settle(-1);      // team ids (-1 = nobody)
    this.slide = new Settle(false);    // turf: the team behind is close to a landslide
    this.shrink = new Settle(false);   // tower / zones: the team behind is being pushed (shrunk)
    this.zCon = false;                 // zones: the team behind is contesting the leader's zone
    this.sampT = 0;
    this.turf = null;
    this.stung = -1;                   // the last team that took the lead (callout + sting)
    this.stingT = -99;
    this.showUntil = -1;
    this.log = [];
  }

  update(dt, f) {
    const hud = this.hud, m = G.match || null;
    if (m !== this.m) this._reset(m);
    this.t += dt;
    const mode = !m || m.practice || m.attract || m.mode === 'boss' || hud.boss?.on || hud._practice ? null
      : f.tower ? 'tower' : f.zones ? 'zones' : m.mode === 'turf' ? 'turf' : null;
    if (mode !== this.mode) { this._reset(m); this.mode = mode; }
    const v = f.tower ? f.tower.viewer : f.zones ? f.zones.viewer : null;
    this.me = v === 0 || v === 1 ? v : hud._zMe();
    if (mode && m.state === 'playing') {
      if (mode === 'turf') this._turf(dt);
      else if (mode === 'tower' && f.tower.winner == null) this._tower(f.tower, dt);
      else if (mode === 'zones' && f.zones.winner == null) this._zones(f.zones, dt);
    }
    this._show();
  }

  // ---- the rules (all in team ids)
  _lead(want, dt, hold) {
    if (!this.leader.feed(want, dt, hold ?? (want < 0 ? LEAD.hold.none : LEAD.hold.lead))) return;
    const L = this.leader.v;
    this.log.push({ t: +this.t.toFixed(2), leader: L });
    this.shrink.set(false);            // (the trailer's states were about the other team)
    this.slide.set(false);
    this.zCon = false;
    if (L >= 0 && L !== this.stung) this._took(L);
  }

  _turf(dt) {
    const C = LEAD.turf, step = 1 / C.sampleHz;
    if ((this.sampT -= dt) > 0) return;
    this.sampT = Math.max(this.sampT + step, 0.001);
    const cov = G.paint?.coverage?.();
    if (!cov) return;
    const a = +cov[0] || 0, b = +cov[1] || 0, tot = a + b, sh = [tot > 0 ? a / tot : 0.5, tot > 0 ? b / tot : 0.5];
    const L = this.leader.v, ge = (x, y) => x >= y - 1e-4;   // (45 − 35 of the map is 0.0999…)
    let want = -1;
    for (let t = 0; t < 2; t++) {
      const gap = cov[t] - cov[1 - t];
      if (t === L ? ge(sh[t], C.stay) && ge(gap, C.stayGap)
        : ge(tot, C.minInked) && ge(gap, C.aheadGap) && (ge(sh[t], C.ahead) || (ge(gap, C.wideGap) && ge(sh[t], C.wideShare)))) want = t;
    }
    this._lead(want, step, LEAD.hold.turf);
    const Lc = this.leader.v;
    let slide = false;
    if (Lc >= 0) slide = this.slide.v ? ge(sh[Lc], C.slideOff) : ge(sh[Lc], C.slide) && ge(cov[Lc] - cov[1 - Lc], C.slideGap);
    this.slide.feed(slide, step, LEAD.hold.turf);
    this.turf = { cov: [+a.toFixed(4), +b.toFixed(4)], share: +sh[0].toFixed(4) };
  }

  _tower(st, dt) {
    const sc = st.score || st.count || [100, 100];
    this._lead(sc[0] === sc[1] ? -1 : sc[0] < sc[1] ? 0 : 1, dt);
    const L = this.leader.v, tr = 1 - L;
    // the leader controls the tower (nobody of the trailing team on it) on the trailing team's half: s > 0 is Bravo's
    const pushed = L >= 0 && st.owner === L && !st.contested && (tr === 1 ? st.s : -st.s) > LEAD.towerHalf;
    this.shrink.feed(pushed, dt, LEAD.hold.size);
  }

  _zones(z, dt) {
    const c = z.count || [100, 100];
    this._lead(c[0] === c[1] ? -1 : c[0] < c[1] ? 0 : 1, dt);
    const L = this.leader.v, tr = 1 - L;
    let con = 0;
    if (L >= 0) for (const q of z.zones || []) if (q.owner === L) con = Math.max(con, (q.share && q.share[tr]) || 0);
    this.zCon = this.zCon ? con >= WARN - 0.08 : con >= WARN;   // (zones.js _contest's warn / re-arm lines)
    this.shrink.feed(L >= 0 && z.owner === L && !this.zCon, dt, LEAD.hold.size);
  }

  // a team took the lead: the callout ("WE TOOK / LOST THE LEAD!", in the new leader's ink) + the sting (rising for us,
  // falling for them) — both at most once per stingGap
  _took(t) {
    this.stung = t;
    if (this.mode === 'turf') this.showUntil = this.t + LEAD.turf.show;
    const hud = this.hud;
    if (this.t - this.stingT >= LEAD.stingGap && hud._live()) {
      this.stingT = this.t;
      this.stings++;
      this.lastCall = t === this.me ? 'WE TOOK THE LEAD!' : 'WE LOST THE LEAD!';
      hud._zCall(this.lastCall, { team: t, icon: LEAD_ICON });
      hud._snd(t === this.me ? 'lead_ours' : 'lead_theirs');
    }
  }

  // ---- drawing: sizes + banners per side (dirty-checked; the rest is CSS)
  _targets() {
    const size = ['norm', 'norm'], banner = [null, null], L = this.leader.v;
    if (!this.mode || L < 0) return { size, banner };
    const tr = 1 - L;
    size[L] = 'grow';
    if (this.mode === 'turf') {
      size[tr] = 'shrink';
      if (this.slide.v) banner[tr] = 'danger';
      if (this.t < this.showUntil) banner[L] = 'lead';
    } else {
      size[tr] = this.shrink.v ? 'shrink' : 'norm';
      banner[L] = 'lead';
    }
    return { size, banner };
  }

  _show() {
    const tg = this._targets();
    for (let t = 0; t < 2; t++) {
      const S = this.sides[t ^ this.me], size = tg.size[t], kind = tg.banner[t];
      if (S.size !== size) {
        S.size = size;
        S.sq.classList.toggle('is-grow', size === 'grow');
        S.sq.classList.toggle('is-shrink', size === 'shrink');
        S.sq.dataset.lead = size;
      }
      if (S.kind !== kind) {
        S.kind = kind;
        S.el.dataset.kind = kind || '';
        if (kind) {
          S.txt.textContent = kind === 'danger' ? 'DANGER' : 'LEAD';
          S.ico.innerHTML = kind === 'danger' ? DANGER_ICON : LEAD_ICON;
          S.el.classList.toggle('is-danger', kind === 'danger');
          this.hud._restart(S.el, 'is-on');
        } else S.el.classList.remove('is-on');
      }
    }
  }

  /** Snapshot for tests / debugging: sides are [yours (left), theirs (right)]. */
  state() {
    return {
      mode: this.mode, me: this.me, leader: this.leader.v, slide: this.slide.v, shrink: this.shrink.v, contested: this.zCon,
      turf: this.turf, stung: this.stung, stings: this.stings, lastCall: this.lastCall || null, log: this.log.slice(-20),
      sides: this.sides.map((S) => ({ size: S.size, banner: S.kind, scale: +(getComputedStyle(S.sq).scale || 1) || 1 })),
    };
  }
}
