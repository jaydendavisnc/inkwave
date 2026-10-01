// Bot brain: picks turf to claim, paths there (swimming through its own ink), paints on the move, spots and
// fights enemies with human-ish reaction time and aim error, refills ink, throws bombs and uses specials.
// Motion (stream 4): aim is a critically-damped spring with a turn-rate cap and a smoothly wandering error (plus an
// acquisition over/undershoot that settles), shots follow the bot's *actual* aim ray, the move command slews its
// heading (no twitch at waypoint switches / strafe flips), strafes ease, bots dodge-hop when hit, swim in to close
// distance and retreat through own ink to heal when they're losing a duel.
// Perception (botSight.js): a bot knows where a foe is only while it sees it (a sight line, in its view cone and range;
// squids under their own ink are hard to spot) or has it located (tracked, a super jump's landing marker). Out of sight
// the foe is a memory — the last place / time / heading it was seen — that the bot may pre-aim, spray briefly, lob a sub
// at, go and check, or give up on; it never follows the foe's real position through walls. The fight code reads the
// target through its view (this.tv: the actor in sight, the memory out of it). Team plans use teamKnown().
import * as THREE from 'three';
import { G, clamp, angleDiff } from '../core/ctx.js';
import { PLAYER, DIFFICULTY, SUB, SPECIALS, TOWER, weaponRange } from '../config.js';
import { Hit } from './physics.js';
import { MAIN_KITS, SUB_KITS } from './kits/registry.js';
import { Sight, SIGHT, SIGHT_STATS, teamKnown } from './botSight.js';
import { SpecialSense, SPECIAL_AI, SPECIAL_STATS } from './botSpecials.js';   // enemy specials: dangers, the untouchable
export { SIGHT, SIGHT_STATS, teamKnown, SPECIAL_AI, SPECIAL_STATS };

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _walkHit = new Hit();
const _stats = { own: 0, enemy: 0, empty: 0, n: 0 };
// weapon families the brain treats alike: close-range pushers, and charge-then-release weapons
// (exported so kit weapons / subs (src/game/kits/*.js) can add their kinds to these tables)
export const MELEE = { roller: true, brush: true };
export const CHARGES = { charger: true, spinner: true, splatling: true };
// Wall climbs (nav 'climb' edges, BotBrain._climb): at the wall, a column that makes no headway for `stall` s — no new
// strip of our ink up it, no height gained swimming up it — or that it has no ink left to finish is given up, and routes
// plan round climbs for `off` s (noClimbUntil). A bot that can't ink a column now — under `ink` of its tank, or
// refilling — plans a climb only where there's no way round within `dry` m more (BotBrain._climbRule). CLIMB_STATS
// counts the attempts at a wall: done (on top), stalled, dry (no ink for the rest of it), long (over `max` s)
// `reach`: per weapon kind, the walls it can ink a column up (m of rise), where that's not every one: the brush's swipes
// fly low and short (nothing over 2 m, even from a hop's top); a roller's flick leaves at head height rising, so over a
// wall much under 1.8 m it just sails onto the top (tools/botlab/tests/bot-climb.js, forced climbs). Routes take another
// climb — or the one that just failed — only with no way round within `unreach` m more (a pit whose only way out is up
// a wall: a try beats standing there)
export const CLIMB = { stall: 1.75, off: 12, max: 8, ink: 0.2, dry: 40, unreach: 150, reach: { brush: { max: 2.0 }, roller: { min: 1.8 } } };
export const CLIMB_STATS = { tries: 0, done: 0, stalled: 0, dry: 0, long: 0 };

// ============================================================================================ Zone Control team plan
// Shared by every bot in a zones match (one per ZoneControl): each zone's paint cells mapped to the nav nodes you'd
// stand on to ink them, built once; the live zones' ink re-scanned ~3×/s into per-node "need" (cells not yet ours,
// enemy ink weighted up); and per-team roles, re-dealt on every rotation / change of hands (and every 2 s):
//   paint — ink the zone's neediest patches (everyone, when the zone isn't ours; rollers / brushes / buckets always)
//   guard — hold it: stand on its enemy-facing edge, touch up and re-ink enemy ink (2–3 bots while we hold it)
//   watch — chargers / spinners: a perch on our side with a sightline over the zone, inking it from range
//   push  — 1–2 bots press forward past the zone while we hold it
// Two-zone centres split the team, more bodies on the zone we don't hold.
// Retaking (anti-snowball, no number fudging): while the other team holds the objective, bots off the zone regroup at
// a staging point just outside it on our side (role 'stage'), then push together once ≥ 3 are gathered or a
// teammate's special is ready ('push' wave: everyone inks one zone — on a two-zone centre the weaker one, which is
// enough to break the hold), chaining specials one after another; bombs go onto the zone's enemy ink; respawners super
// jump to the group.
export const LONG = { charger: true, spinner: true, splatling: true };
export const THROWN = { bomb: true, sticky: true, burst: true, mist: true, seeker: true };
// aim pitch that lobs a thrown sub (weapons.js throwVelocity: pitch + 0.28, +1.5 up, from 1.35 m, gravity 24) d metres out
// to a spot dy above our feet; null when out of reach
function lobPitch(d, dy, speed) {
  let best = null, be = Infinity;
  for (let p = -0.5; p <= 0.75; p += 0.025) {
    const tp = clamp(p + 0.28, -0.3, 1.1), vx = Math.cos(tp) * speed, vy = Math.sin(tp) * speed + 1.5, disc = vy * vy + 48 * (1.35 - dy);
    if (disc < 0) continue;
    const e = Math.abs((vx * (vy + Math.sqrt(disc))) / 24 - d);
    if (e < be) { be = e; best = p; }
  }
  return be < 1.2 ? best : null;
}
export const PAINTERS = { roller: true, brush: true, bucket: true, slosher: true };
// steady-trigger weapons that may spray a spot a foe just went out of sight at (BotBrain._spray)
const SPRAY = { shooter: true, blaster: true, dualies: true, twins: true, slosher: true, bucket: true };
// Counter-play vs enemy devices and shields (BotBrain "threats" section): tests flip `enabled` off for an A/B on the
// same code; THREAT_STATS counts what the bots did (engagements, not frames — holdFire is seconds)
export const THREAT_AI = { enabled: true };
export const THREAT_STATS = { noticed: 0, shoot: 0, evade: 0, swim: 0, sidestep: 0, gone: 0, steer: 0, breakWall: 0, flank: 0, holdFire: 0, shieldSub: 0 };
const _thrList = [];
const _thrAim = { yaw: 0, pitch: 0, dist: 6 };
const _evP = new THREE.Vector3();
const _wander = (x) => Math.sin(x) * 0.6 + Math.sin(x * 2.27 + 1.3) * 0.4;
const _plans = new WeakMap();
export function zonePlan() {
  const m = G.match, Z = m && m.zones;
  if (!Z || m.attract || m.practice || !G.nav || !G.paint) return null;
  let P = _plans.get(Z);
  if (!P) { P = new ZonePlan(Z); _plans.set(Z, P); }
  P.tick();
  return P;
}

class ZonePlan {
  constructor(Z) {
    this.Z = Z;
    const faces = G.level.faces.filter((f) => f.turf && f.atlas).sort((x, y) => x.grid - y.grid);
    const starts = faces.map((f) => f.grid);
    this.info = Z.zones.map((z) => this._build(z, faces, starts));
    this.t = -1; this.roleT = -1; this.sig = '';
    this.roles = [new Map(), new Map()];
    // per-team retake wave: 'free' (we hold it / it's neutral) · 'stage' (regrouping) · 'push' (going in together)
    this.waves = [0, 1].map(() => ({ state: 'free', t0: 0, zone: -1, pushes: 0 }));
    this.spNext = [0, 0];   // chained specials on a push: the next one may go at this time
  }
  // the team's wave state, and (staging / pushing) the zone it's going for
  waveOf(t) { return this.waves[t]; }

  _build(z, faces, starts) {
    const nav = G.nav, cells = z.cells, n = cells.length, idx = new Map(), nodes = [], cellNode = new Int32Array(n).fill(-1);
    const [cx, cy, cz] = z.center;
    let R = 2;
    for (let i = 0; i < n; i++) {
      const k = cells[i];
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= k) lo = mid; else hi = mid - 1; }
      const f = faces[lo], loc = k - f.grid, s = ((loc % f.nu) + 0.5) * f.cu, t = (((loc / f.nu) | 0) + 0.5) * f.cv;
      const x = f.origin.x + f.u.x * s + f.v.x * t, y = f.origin.y + f.u.y * s + f.v.y * t, zz = f.origin.z + f.u.z * s + f.v.z * t;
      R = Math.max(R, Math.hypot(x - cx, zz - cz));
      const id = nav.nearest(_v.set(x, y, zz), 1.0);
      if (id < 0) continue;
      const nd = nav.nodes[id];
      if (Math.hypot(nd.x - x, nd.z - zz) > 2.2 || Math.abs(nd.y - y) > 1.8) continue;   // nowhere to stand near it
      let li = idx.get(id);
      if (li === undefined) { li = nodes.length; idx.set(id, li); nodes.push(id); }
      cellNode[i] = li;
    }
    let reach = 0; for (let i = 0; i < n; i++) if (cellNode[i] >= 0) reach++;
    // neighbourhoods (≤ 2.3 m, same level) so a pick weighs the patch round a node, not one square metre
    const nb = nodes.map((id) => {
      const a = nav.nodes[id], out = [];
      nodes.forEach((jd, j) => { const b = nav.nodes[jd]; if (Math.abs(a.x - b.x) < 2.4 && Math.abs(a.z - b.z) < 2.4 && Math.abs(a.y - b.y) < 1 && Math.hypot(a.x - b.x, a.z - b.z) <= 2.3) out.push(j); });
      return out;
    });
    // nav nodes round the zone: ring (on / by it: guard + watch spots), far (3–18 m out: push)
    const ring = [], far = [];
    for (const id of nav.validIds) {
      const q = nav.nodes[id], d = Math.hypot(q.x - cx, q.z - cz);
      if (q.zone >= 0) continue;
      if (d <= R + 16) ring.push(id);
      if (d >= R + 3 && d <= R + 18) far.push(id);
    }
    const parts = z.def.polys || [z.def.poly];
    // staging spots: a patch of ground 3–9 m outside the zone on each team's own side (toward its spawn)
    const stage = [0, 1].map((t) => {
      const p = G.level.spawnPads[t], ex = p.x - cx, ez = p.z - cz, el = Math.hypot(ex, ez) || 1;
      let best = -1, bs = -Infinity;
      for (const id of ring) {
        const q = nav.nodes[id], dx = q.x - cx, dz = q.z - cz, d = Math.hypot(dx, dz);
        if (d < R + 3 || d > R + 9 || q.wet === 2) continue;
        const sc = ((dx * ex + dz * ez) / (d * el)) * 3 - Math.abs(d - (R + 5)) * 0.3 - Math.abs(q.y - cy) * 0.35 - (q.wet ? 1 : 0);
        if (sc > bs) { bs = sc; best = id; }
      }
      if (best < 0) return null;
      const b = nav.nodes[best], spots = ring.filter((id) => { const q = nav.nodes[id]; return Math.hypot(q.x - b.x, q.z - b.z) < 3.2 && Math.abs(q.y - b.y) < 1.2 && q.wet !== 2; });
      return { x: b.x, y: b.y, z: b.z, spots: spots.length ? spots : [best] };
    });
    return { cellNode, nodes, nb, reach, R, ring: ring.length ? ring : nodes.slice(), far: far.length ? far : ring.slice(), parts, y0: z.def.y0 ?? -2, y1: z.def.y1 ?? 6, stage,
      need: [new Float32Array(nodes.length), new Float32Array(nodes.length)], needSum: [0, 0], ink: [new Uint16Array(nodes.length), new Uint16Array(nodes.length)] };
  }

  isActive(zi) { return this.Z.active.zones.some((z) => z.id === zi); }
  roleOf(a) { return this.roles[a.team].get(a) || { role: 'paint', zone: this.Z.active.zones[0].id }; }
  // unit xz direction from a zone toward team t's enemy spawn
  enemyDir(zone, t) {
    const p = G.level.spawnPads[1 - t], dx = p.x - zone.center[0], dz = p.z - zone.center[2], l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }
  // standing on (or right at the edge of) zone zi?
  onZone(zi, p) {
    const I = this.info[zi], c = this.Z.zones[zi].center;
    return Math.hypot(p.x - c[0], p.z - c[2]) < I.R + 1.5 && p.y > I.y0 - 1.5 && p.y < I.y1 + 2.5;
  }
  // is (x, y, z) on a live zone?
  onActive(x, y, z) {
    for (const zn of this.Z.active.zones) {
      const I = this.info[zn.id];
      if (y < I.y0 - 1.5 || y > I.y1 + 2.5) continue;
      for (const poly of I.parts) {
        let ins = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, zi] = poly[i], [xj, zj] = poly[j];
          if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
        }
        if (ins) return true;
      }
    }
    return false;
  }
  // the most-needed spot of zone zi for team t (e.g. a Vortex Strike's landing point)
  hotspot(zi, t) {
    if (!(zi >= 0) || !this.isActive(zi)) zi = this.Z.active.zones[0].id;
    const I = this.info[zi], need = I.need[t];
    let bv = -1, bi = -1;
    for (let li = 0; li < I.nodes.length; li++) { let v = 0; for (const k of I.nb[li]) v += need[k]; if (v > bv) { bv = v; bi = li; } }
    return bi >= 0 ? G.nav.nodes[I.nodes[bi]] : null;
  }

  tick() {
    const now = G.time;
    if (this.t >= 0 && now - this.t < 0.33 && now >= this.t) return;
    this.t = now;
    const grid = G.paint.grid, Z = this.Z;
    for (const z of Z.active.zones) {
      const I = this.info[z.id], c = z.cells, cn = I.cellNode, n0 = I.need[0], n1 = I.need[1], k0 = I.ink[0], k1 = I.ink[1];
      n0.fill(0); n1.fill(0); k0.fill(0); k1.fill(0);
      let s0 = 0, s1 = 0;
      for (let i = 0; i < c.length; i++) {
        const li = cn[i];
        if (li < 0) continue;
        const g = grid[c[i]];
        if (g === 1) k0[li]++; else if (g === 2) k1[li]++;
        if (g !== 1) { const v = g === 2 ? 1.5 : 1; n0[li] += v; s0 += v; }
        if (g !== 2) { const v = g === 1 ? 1.5 : 1; n1[li] += v; s1 += v; }
      }
      I.needSum[0] = s0; I.needSum[1] = s1;
    }
    this._wave(0, now); this._wave(1, now);
    const sig = Z.active.id + ':' + Z.owner + ':' + Z.active.zones.map((z) => z.owner).join(',') + ':' + this.waves[0].state + this.waves[1].state;
    if (sig !== this.sig || now - this.roleT > 2 || now < this.roleT) { this.sig = sig; this.roleT = now; this._assign(0); this._assign(1); }
  }

  // retake waves for team t (only while the other team holds the objective)
  _wave(t, now) {
    const Z = this.Z, W = this.waves[t];
    if (Z.owner !== 1 - t) { W.state = 'free'; W.zone = -1; return; }
    if (W.state === 'free') {
      // go for one zone: on a two-zone centre the one they hold least firmly (neutralising either breaks their hold)
      const zs = Z.active.zones;
      W.zone = zs.reduce((b, z) => (z.share[1 - t] < b.share[1 - t] ? z : b), zs[0]).id;
      W.state = 'stage'; W.t0 = now;
    }
    const I = this.info[W.zone], st = I.stage[t], c = Z.zones[W.zone].center;
    let alive = 0, gathered = 0, sp = false;
    for (const a of G.actors) {
      if (a.team !== t || !a.bot || !a.alive) continue;
      alive++;
      const near = (st && Math.hypot(a.pos.x - st.x, a.pos.z - st.z) < 8) || Math.hypot(a.pos.x - c[0], a.pos.z - c[2]) < I.R + 2;
      if (near) gathered++;
      if (a.specialReady() && Math.hypot(a.pos.x - c[0], a.pos.z - c[2]) < I.R + 18) sp = true;
    }
    if (W.state === 'stage') {
      const waited = now - W.t0;
      if ((alive >= 3 && gathered >= 3) || (sp && gathered >= 2) || (gathered >= alive && alive > 0 && waited > 7) || waited > 15) {
        W.state = 'push'; W.t0 = now; W.pushes++; this.spNext[t] = now;
      }
    } else if (W.state === 'push' && alive <= 1 && now - W.t0 > 4) { W.state = 'stage'; W.t0 = now; }   // wiped out: regroup
  }

  _assign(t) {
    const Z = this.Z, act = Z.active.zones, prev = this.roles[t], out = new Map();
    const bots = G.actors.filter((a) => a.team === t && a.bot);
    const holdAll = Z.owner === t;
    // 0 mid · 1 painter · 2 long range (chargers always keep a perch; spinners only while we hold — else they ink it)
    const kind = (a) => (a.weapon.kind === 'charger' || (LONG[a.weapon.kind] && holdAll) ? 2 : PAINTERS[a.weapon.kind] ? 1 : 0);
    // pushers, only while we hold the whole objective: one, or two once it's safely inked (mid-range kits first)
    let nPush = 0;
    if (holdAll && bots.length >= 3) nPush = bots.length >= 4 && act.every((z) => z.share[t] >= 0.9) ? 2 : 1;
    const pushers = new Set(bots.filter((a) => kind(a) !== 2)
      .sort((x, y) => ((prev.get(y)?.role === 'push') - (prev.get(x)?.role === 'push')) || (kind(x) - kind(y)) || (x.slot - y.slot)).slice(0, nPush));
    // zone per bot on a two-zone centre: one bot keeps a zone we hold, the rest go for the other; holding neither, 3
    // pile onto the one we're closest to taking (then move on) rather than splitting 2 / 2 (hysteresis: bots stay put
    // unless the other zone is clearly closer)
    const zoneOf = new Map();
    if (act.length === 1) for (const a of bots) zoneOf.set(a, act[0].id);
    else {
      const [z0, z1] = act;
      let w0 = z0.owner === t ? 1 : 3, w1 = z1.owner === t ? 1 : 3;
      if (w0 === 3 && w1 === 3) {
        const pf = this.focus?.[t], f0 = z0.share[t] + (pf === z0.id ? 0.1 : 0), f1 = z1.share[t] + (pf === z1.id ? 0.1 : 0);
        if (f0 >= f1) w1 = 1; else w0 = 1;
        (this.focus || (this.focus = []))[t] = f0 >= f1 ? z0.id : z1.id;
      }
      const cap0 = Math.round((bots.length * w0) / (w0 + w1));
      const pos = (a) => (a.alive ? a.pos : G.level.spawnPads[t]);
      const dd = (a, z) => Math.hypot(pos(a).x - z.center[0], pos(a).z - z.center[2]);
      const key = (a) => dd(a, z0) - dd(a, z1) + (prev.get(a)?.zone === z0.id ? -5 : prev.get(a)?.zone === z1.id ? 5 : 0);
      const order = [...bots].sort((x, y) => key(x) - key(y));
      order.forEach((a, i) => zoneOf.set(a, i < cap0 ? z0.id : z1.id));
    }
    const W = this.waves[t];
    for (const a of bots) {
      let role = pushers.has(a) ? 'push' : kind(a) === 2 ? 'watch' : holdAll && kind(a) !== 1 ? 'guard' : 'paint', zone = zoneOf.get(a);
      if (W.state !== 'free') {
        // locked out: everyone goes for the one zone; off it, wait at the staging spot until the push
        zone = W.zone;
        if (role !== 'watch' && W.state === 'stage' && !(a.alive && this.onZone(W.zone, a.pos))) role = 'stage';
      }
      out.set(a, { role, zone });
    }
    // painters (rollers / brushes / buckets) guard by re-inking when we hold it: 'paint' already does that
    this.roles[t] = out;
  }
}

// ============================================================================================ Tower Command team plan
// Shared by every bot in a tower match (one per TowerCommand): the track sampled every metre (its 3D length: climbs
// and drops count) with the nav node by each point; per team how the other team stands round the tower, and roles
// re-dealt ~2×/s and on every change of hands, contest, empty held tower or change of stance.
// Stance (per team, `steam`): the tower is an escort job while any of theirs is up and near it as the team knows it
// (botSight.js teamKnown: seen, located or remembered) — within ~30 m of it (or closing on it to within that in 1.5 s),
// or with a sightline to its deck from within 36 m — and full steam ahead only once none is and every one of theirs
// that's up is accounted for: seen in the last 4 s, or respawned at its base in the last 4 s (splats are announced).
// Genuinely safe, 2.5 s of quiet first. Back to escorting 0.5 s after one of theirs is known within ~22 m (or seeing
// its deck from 28 m), 1.5 s after one comes within 30 m.
//   ride   — get on the platform and stay on it (beside the pillar in its middle), shooting from the top; knocked off
//            while it's still ours → back on. Full steam: everyone (more riders, faster; chargers too). Escorting —
//            ours: ONE (whoever's on it already, else shooters / twins / splatlings first, rollers / brushes last,
//            chargers only if nobody else is up; a second only while we're 2 up on them, or 1 up with two on it
//            already), plus the backup the moment it's left empty; neutral: the nearest 2; theirs: 2 to get on it (one
//            of ours on it stops it) while the rest shoot theirs off it. Humans of ours riding it count. On it while
//            escorted: under in our ink on its deck (dodging, healing, refilling — a rider submerged there is still
//            riding), up to shoot when there's a foe in range or one climbing on, down again after; the deck kept
//            inked for it. Rolling home (ours, on our half, one of theirs within 14 m, 7 m or more to the centre): the
//            rider hops off to fight while the one of ours right by it climbs on in its place — it rolls on by itself
//            meanwhile (tower.js); anyone near gets on at 2.5 s empty if that hasn't worked.
//   escort — on the ground with it, each in a slot along the track (the way it's heading: ours / neutral → our push,
//            theirs → their push, toward our goal): `cp` holds the next checkpoint's pad before it gets there (when
//            it's within 35 m), `lead` walks the route 6–14 m ahead inking it, `flank` 1–7 m ahead and 3–7 m off to the
//            side, `backup` (held and escorted: the next best rider) 0–3 m ahead, 2–4 m off it, ready to climb on. All
//            take the fights round it (peeling off for one within 18 m of it, never chasing past 20 m) and go back to
//            their slot after; while painting they ink the route ahead of it (the long-range painters from afar)
//   perch  — chargers: a spot with a sightline over the tower (theirs / neutral) or over the route ahead of it (ours),
//            off to its side (not trailing it: a new one once it's rolled 3 m past)
// Getting on (BotBrain _towerBoardNav / _towerMove / _towerClimb): its deck is higher than a jump, so — as a player
// does — ink a column of one of its walls in our ink and swim up it (the actor's own wall climb; the engine carries
// climbers with it). The nav graph doesn't know the tower (a moving collider): pick a wall — open to a floor at its
// base with room to stand 1.2 m out, not a grate (a squid drops through), not the front of a rolling tower, one with a
// column of ours inked to the top already first — path to that spot, then steer straight to it: ink the lowest bare /
// enemy patch up the column (re-inked whenever their ink covers it), then turn squid and swim in. A floor a hop reaches
// the deck from (a step or ledge beside it): hop on. Far off with a teammate on it: super jump to them.
// kinds that ride best (lower first): steady fire from a small platform; chargers only in a pinch
export const RIDE_PREF = { shooter: 0, twins: 0, splatling: 0, dualies: 0.3, blaster: 0.4, brolly: 0.4, slosher: 0.5, spinner: 0.6, mitts: 0.8, bow: 0.8, bucket: 1, blade: 1.2, roller: 1.5, brush: 1.5, charger: 5 };
// specials that carry the body off the platform (a rider saves them for when it's off)
const BODY_SP = { kraken: true, stamp: true, crab: true, jetpack: true, zipcaster: true };
// stance thresholds (m from the tower, s of dwell)
const TW_NEAR = 30, TW_CLOSE = 22, TW_SEE = 36, TW_SEE_IN = 28, TW_FACE = 14, TW_COVER_T = 0.5, TW_NEAR_T = 1.5, TW_STEAM_T = 2.5;
// rolling home: a rider swap that hasn't worked by this much empty time is off (it goes neutral at TOWER.idleNeutral),
// no new hop-off for TW_HOME_CD s after one; the next checkpoint gets an escort once the tower's within TW_CP_AHEAD m of it
const TW_HOME_T = 2.5, TW_HOME_CD = 8, TW_CP_AHEAD = 35;
const TW_KNOWN = 4;   // s: a foe the team last saw (or had located) this long ago still counts where it was
const TW_SPAWN_KNOWN = 4;   // s: a foe that respawned this long ago is still placed by its base (the splat is public)
const _tp = new THREE.Vector3(), _tn = new THREE.Vector3(), _tq = new THREE.Vector3();
export function towerPlan() {
  const m = G.match, T = m && m.tower;
  if (!T || m.attract || m.practice || !G.nav) return null;
  let P = _plans.get(T);
  if (!P) { P = new TowerPlan(T); _plans.set(T, P); }
  P.tick();
  return P;
}

class TowerPlan {
  constructor(T) {
    this.T = T;
    const nav = G.nav;
    // the path every metre from Bravo's goal (s0) to Alpha's: its point and the nav node on / by it (-1: none near)
    this.s0 = -T.path.len[1];
    this.pts = []; this.node = [];
    for (let s = this.s0; s <= T.path.len[0] + 1e-6; s += 1) {
      const p = T.path.at(s, new THREE.Vector3());
      this.pts.push(p);
      const id = nav.nearest(_v.set(p.x, p.y + 0.3, p.z), 1.0);
      const n = id >= 0 ? nav.nodes[id] : null;
      this.node.push(n && n.zone < 0 && Math.hypot(n.x - p.x, n.z - p.z) < 2.5 && Math.abs(n.y - p.y) < 1.5 ? id : -1);
    }
    this.t = -1; this.roleT = -1; this.sig = '';
    this.roles = [new Map(), new Map()];
    // stance per team: full steam ahead (true) or escorting it (false); the time its switch condition has held, the
    // time since the last switch; the other team round the tower ({ n, alive, near, close, closeIn }); the backup rider
    // (a hit for the wall-open test)
    this.steam = [false, false]; this.swT = [0, 0]; this.stT = [9, 9];
    this.thr = [{ n: 0, alive: 0, near: 0, close: 0, closeIn: 0, unk: 0 }, { n: 0, alive: 0, near: 0, close: 0, closeIn: 0, unk: 0 }];
    this.upAt = new Map();   // foe → when it was (re)spawned, as far as anyone can tell (splats are announced)
    this.backup = [null, null];
    // escort slots per team (bot → 'cp' | 'lead' | 'flank' | 'backup'); rolling home: riders off (per team), and when the
    // next hop-off may be
    this.slots = [new Map(), new Map()];
    this.homeOff = [false, false]; this.homeCd = [0, 0]; this.homeRider = [null, null]; this.homeIn = [null, null];
    this._h = new Hit();
  }
  idx(s) { return clamp(Math.round(s - this.s0), 0, this.pts.length - 1); }
  at(s) { return this.pts[this.idx(s)]; }
  // the nav node by the path nearest s (looking out along it both ways)
  nodeAt(s) {
    const k0 = this.idx(s), N = this.node.length;
    for (let r = 0; r < 16; r++) {
      if (k0 + r < N && this.node[k0 + r] >= 0) return this.node[k0 + r];
      if (k0 - r >= 0 && this.node[k0 - r] >= 0) return this.node[k0 - r];
    }
    return -1;
  }
  dirOf(t) { return t === 0 ? 1 : -1; }   // the way team t pushes it along s
  // where (x, y, z) is along the track: the nearest of its metre points within 40 m of s0 (round its corners) → into
  // out { s, off: m off the track there }
  proj(x, y, z, s0, out) {
    const k0 = this.idx(s0), P = this.pts;
    let bk = k0, bd = Infinity;
    for (let k = Math.max(0, k0 - 40), k1 = Math.min(P.length - 1, k0 + 40); k <= k1; k++) {
      const q = P[k], d = Math.hypot(q.x - x, q.z - z) + Math.abs(q.y - y) * 0.5;
      if (d < bd) { bd = d; bk = k; }
    }
    out.s = this.s0 + bk; out.off = bd;
    return out;
  }
  // (x, z) in the platform's frame, and how far outside its square edge that is (negative: over it)
  edge(x, z) {
    const T = this.T, dx = x - T.pos.x, dz = z - T.pos.z, c = Math.cos(T.yaw), s = Math.sin(T.yaw);
    return Math.max(Math.abs(dx * c - dz * s), Math.abs(dx * s + dz * c)) - TOWER.platformR;
  }
  // standing on the platform (the engine's rider test, a touch looser: a toe over the edge still counts)
  onTower(a) {
    const dy = a.pos.y - this.T.top;
    return a.alive && dy > -0.35 && dy < TOWER.riderUp + 0.2 && this.edge(a.pos.x, a.pos.z) < 0.12;
  }
  riding(a) { return this.T.riderList.includes(a); }
  // swimming up one of its walls
  climbing(a) { return !!(a.alive && a.climbing && a.wallHit && a.wallHit.block === this.T.block.id); }
  // (a brain flagged `human` — a test stand-in for a player — is left out of the plan like a player, playing its own
  // role: that string, else escort)
  roleOf(a) { return this.roles[a.team].get(a) || (a.bot && typeof a.bot.human === 'string' ? a.bot.human : 'escort'); }

  // wall f of the platform (0 +x, 1 −x, 2 +z, 3 −z in its own frame): its outward normal (nx, nz) and the way along it
  // (tx, tz), in the world, into F
  face(f, F) {
    const c = Math.cos(this.T.yaw), s = Math.sin(this.T.yaw);   // (its local +x is (c, −s), +z is (s, c))
    if (f === 0) { F.nx = c; F.nz = -s; F.tx = s; F.tz = c; } else if (f === 1) { F.nx = -c; F.nz = s; F.tx = -s; F.tz = -c; }
    else if (f === 2) { F.nx = s; F.nz = c; F.tx = -c; F.tz = s; } else { F.nx = -s; F.nz = -c; F.tx = c; F.tz = -s; }
    return F;
  }
  // the lowest height (m over its base, from y0 up) of wall f's column at u (m along it) that isn't team t's ink — what
  // a climber there would stop under; null: ours to the top
  gap(f, u, y0, t) {
    const T = this.T, F = this.face(f, this._F || (this._F = {})), R = TOWER.platformR, H = TOWER.platformH;
    _tp.set(T.pos.x + F.nx * R + F.tx * u, 0, T.pos.z + F.nz * R + F.tz * u); _tn.set(F.nx, 0, F.nz);
    for (let y = Math.max(0.15, y0); ; y = Math.min(H - 0.04, y + 0.14)) {
      _tp.y = T.pos.y + y;
      if (T.paint.wallTeam(_tp, _tn) !== t + 1) return Math.min(y, H - 0.12);
      if (y >= H - 0.04) return null;
    }
  }

  tick() {
    const now = G.time, T = this.T;
    if (this.t >= 0 && now - this.t < 0.25 && now >= this.t) return;
    const dt = this.t >= 0 && now > this.t ? Math.min(0.5, now - this.t) : 0;
    this.t = now;
    for (let t = 0; t < 2; t++) this._stance(t, dt);
    const sig = T.owner + ':' + (T.contested ? 1 : 0) + ':' + (T.emptyT > 0.3 ? 1 : 0) + ':' + (this.steam[0] ? 1 : 0) + (this.steam[1] ? 1 : 0);
    if (sig !== this.sig || now - this.roleT > 0.5 || now < this.roleT) { this.sig = sig; this.roleT = now; this._assign(0); this._assign(1); }
  }

  // how the other team stands round the tower for team t, and t's stance (with hysteresis)
  _stance(t, dt) {
    const T = this.T, o = this.thr[t];
    o.n = 0; o.alive = 0; o.near = 0; o.close = 0; o.closeIn = 0; o.face = 0; o.unk = 0;
    for (const e of G.actors) {
      if (e.team !== 1 - t) continue;
      o.n++;
      if (!e.alive) { this.upAt.delete(e); continue; }
      if (!this.upAt.has(e)) this.upAt.set(e, G.time);                       // (up again: at its base now)
      o.alive++;
      // (where the team knows it to be — seen, located or remembered — never where it really is)
      const k = teamKnown(t, e, TW_KNOWN);
      if (!k) {
        // not seen lately: just respawned, it's by its base — as far out as a run since could have brought it; else
        // it could be anywhere (unaccounted for: no piling on while one is)
        const up = G.time - this.upAt.get(e);
        if (up > TW_SPAWN_KNOWN) { o.unk++; continue; }
        const pad = G.level.spawnPads[e.team], d = Math.max(0, Math.hypot(pad.x - T.pos.x, pad.z - T.pos.z) - PLAYER.runSpeed * up);
        if (d < TW_NEAR) o.near++;
        if (d < TW_CLOSE) { o.close++; o.closeIn++; }
        continue;
      }
      const kp = k.pos, kv = k.seen || G.time - k.t < 0.5 ? k.vel : _tn.set(0, 0, 0);
      const dx = kp.x - T.pos.x, dz = kp.z - T.pos.z, d = Math.hypot(dx, dz);
      // (closing on it: where it'll be in 1.5 s — no piling on just before they arrive)
      const dp = d - Math.max(0, -(kv.x * dx + kv.z * dz) / Math.max(d, 0.1)) * 1.5;
      if (Math.min(d, dp) < TW_NEAR) o.near++;
      if (d < TW_FACE) o.face++;
      if (d < TW_CLOSE) { o.close++; o.closeIn++; continue; }
      if (d > TW_SEE) continue;
      // a sightline from their eyes to a rider's body on the near half of the deck (the pillar would block its middle)
      _tp.set(kp.x, kp.y + 1.3, kp.z); _tq.set(T.pos.x + (dx / d) * 0.8, T.top + 1.0, T.pos.z + (dz / d) * 0.8);
      if (G.physics.los(_tp, _tq)) { o.close++; if (d < TW_SEE_IN) o.closeIn++; }
    }
    // full steam only when it's genuinely safe: none of theirs up and near (however many of them are down), and every one
    // that's up accounted for — seen lately, or just respawned by its base (one that could be anywhere could be here)
    const wantSteam = o.near === 0 && o.close === 0 && o.unk === 0;
    this.stT[t] += dt;
    const on = this.steam[t], sw = on ? o.near > 0 || o.closeIn > 0 : wantSteam;
    this.swT[t] = sw ? this.swT[t] + dt : 0;
    // piling on: a moment of quiet first; escorting again: at once for one of theirs close (or seeing its deck from 28 m),
    // after a moment for one coming within 30 m
    const go = on ? this.swT[t] >= (o.closeIn > 0 ? TW_COVER_T : TW_NEAR_T) : this.swT[t] >= TW_STEAM_T && this.stT[t] >= 1.5;
    if (go) { this.steam[t] = !on; this.swT[t] = 0; this.stT[t] = 0; }
  }

  _assign(t) {
    const T = this.T, prev = this.roles[t], out = new Map(), o = this.thr[t];
    const bots = G.actors.filter((a) => a.team === t && a.bot && !a.bot.human), up = bots.filter((a) => a.alive);
    const ours = T.owner === t, steam = this.steam[t];
    const dT = (a) => Math.hypot(a.pos.x - T.pos.x, a.pos.z - T.pos.z) + Math.abs(a.pos.y - T.top) * 1.5;
    // (a human of ours on it already does the job)
    const humans = G.actors.filter((a) => a.team === t && !(a.bot && !a.bot.human) && this.riding(a)).length;
    // rolling home (tower.js: ours, on our half, it rolls on to the centre with nobody on it): with one of theirs within
    // 14 m of it, 7 m or more still to go and one of ours right by it (6 m) to take its place, the rider hops off to fight
    // while that one climbs on — it rolls on home by itself meanwhile. Over once the new rider's on, after TW_HOME_T s
    // empty (then anyone near gets on, before it goes neutral), within 4 m of the centre, or once none of theirs is
    // within 22 m; not again for TW_HOME_CD s
    const homeOk = ours && !steam && T.homeSide?.(t, T.s + this.dirOf(t) * 4);
    let hr = this.homeRider[t], hi = this.homeIn[t];
    if (hr) {
      if (!homeOk || T.emptyT >= TW_HOME_T || o.close === 0 || !hi || !hi.alive || T.riderList.some((a) => a.team === t && a !== hr)) {
        hr = hi = this.homeRider[t] = this.homeIn[t] = null; this.homeCd[t] = this.t + TW_HOME_CD;
      }
    } else if (homeOk && T.homeSide(t, T.s + this.dirOf(t) * 7) && o.face > 0 && T.riders[t] === 1 && this.t >= this.homeCd[t]) {
      const r = up.find((a) => this.riding(a));
      const inn = r && up.filter((a) => a !== r && !this.riding(a) && a.weapon.kind !== 'charger' && dT(a) < 6).sort((x, y) => dT(x) - dT(y))[0];
      if (inn) { hr = this.homeRider[t] = r; hi = this.homeIn[t] = inn; }
    }
    this.homeOff[t] = !!hr;
    // (escorting ours: one — a second only while we're 2 up on them, or 1 up with two on it already: a spare gun on it)
    const foes = o.alive, on2 = up.filter((a) => this.riding(a) || this.climbing(a)).length >= 2;
    const two = up.length >= foes + 2 || (on2 && up.length > foes);
    const n = Math.max(0, (steam ? 4 : ours ? (two ? 2 : 1) : 2) - humans);
    let can = steam ? up : up.filter((a) => a.weapon.kind !== 'charger');
    if (!can.length && ours) can = up;
    if (hr) can = can.filter((a) => a !== hr);
    const key = (a) => (a === hi ? -9 : 0) + (this.riding(a) ? -4 : this.climbing(a) ? -3 : 0) + (prev.get(a) === 'ride' ? -1.5 : 0)
      + (RIDE_PREF[a.weapon.kind] ?? 0.8) * (ours ? 1 : 0.3) + dT(a) * (ours ? 0.06 : 0.12);
    const riders = can.sort((x, y) => key(x) - key(y)).slice(0, n);
    // held, and nobody on it (the rider splatted / knocked off): the backup goes too, else the closest (it goes neutral
    // at 5 s; a rider taking the place of one who hopped off gets a moment first)
    if (ours && T.riders[t] === 0 && T.emptyT > (hr ? 1.2 : 0.3)) {
      const bk = this.backup[t];
      const c = bk && bk.alive && can.includes(bk) && !riders.includes(bk) && dT(bk) < 14 ? bk : can.filter((a) => !riders.includes(a)).sort((x, y) => dT(x) - dT(y))[0];
      if (c) riders.push(c);
    }
    const set = new Set(riders);
    // (chargers perch; every other kit escorts — the long-range painters ink the route ahead from their slot)
    const long = (a) => a.weapon.kind === 'charger';
    for (const a of bots) out.set(a, set.has(a) ? 'ride' : long(a) ? 'perch' : 'escort');
    this.roles[t] = out;
    // the backup (held and escorted): the next best rider keeps right by it, ready to climb back on (the same one while
    // it's up for it and near: slots don't change hands on a whim — each change sends a bot somewhere new)
    const pb = this.backup[t], okBk = (a) => a && a.alive && can.includes(a) && !set.has(a) && !long(a);
    this.backup[t] = ours && !steam ? (okBk(pb) && dT(pb) < 25 ? pb : can.find(okBk) || null) : null;
    // escort slots, along the way it's heading: the next checkpoint's pad first (the one nearest it; it keeps it), then
    // the lead (the one furthest ahead; it keeps it unless another is 6 m further on), the rest flank
    const sl = new Map(), ps = this.slots[t], fwd = this.fwdOf(t);
    if (this.backup[t]) sl.set(this.backup[t], 'backup');
    let rest = up.filter((a) => out.get(a) === 'escort' && !sl.has(a));
    const e = T.path.dir(T.s, _tq), ex = e.x * fwd, ez = e.z * fwd;
    const along = (a) => (a.pos.x - T.pos.x) * ex + (a.pos.z - T.pos.z) * ez;
    const cp = this.cpAhead(t);
    if (cp && cp.dist > 3 && (cp.dist < 18 || (cp.dist < TW_CP_AHEAD && rest.length >= 2))) {
      const cd = (a) => Math.hypot(a.pos.x - cp.c.pos.x, a.pos.z - cp.c.pos.z) - (ps.get(a) === 'cp' ? 15 : 0);
      const c = rest.sort((x, y) => cd(x) - cd(y))[0];
      if (c) { sl.set(c, 'cp'); rest = rest.filter((a) => a !== c); }
    }
    if (rest.length) {
      const al = (a) => along(a) + (ps.get(a) === 'lead' ? 6 : 0);
      const L = rest.sort((x, y) => al(y) - al(x))[0];
      sl.set(L, 'lead'); rest = rest.filter((a) => a !== L);
    }
    for (const a of rest) sl.set(a, 'flank');
    this.slots[t] = sl;
  }
  // an escort's slot (see _assign); the way the tower's heading for team t's escorts (+1 / −1 along s): ours / neutral
  // → our push, theirs → theirs (toward our goal)
  slotOf(a) { return this.slots[a.team].get(a) || 'flank'; }
  fwdOf(t) { return this.T.owner === 1 - t ? -this.dirOf(t) : this.dirOf(t); }
  // the next checkpoint it's heading for (ours / neutral: ours ahead of it; theirs: theirs ahead of it, on our half):
  // { c, s: its place along the track, dist: m from the tower along it } or null
  cpAhead(t) {
    const T = this.T, pt = T.owner === 1 - t ? 1 - t : t, c = T._nextCp(pt);
    if (!c) return null;
    const s = pt === 0 ? c.d : -c.d;
    return { c, s, dist: Math.abs(s - T.s) };
  }
}

export class BotBrain {
  constructor(actor, difficulty = 'normal') {
    this.a = actor;
    this.setDifficulty(difficulty);
    this.reset();
  }
  setDifficulty(d) { this.diff = DIFFICULTY[d] || DIFFICULTY.normal; }
  reset() {
    this.path = null; this.pi = 0; this.goal = -1; this.repath = 0; this.goalTimer = 0;
    this.target = null; this.seeTimer = 0; this.react = 0; this.lostTimer = 0;
    // perception (botSight.js): what we know of each foe; the target's memory entry (tk) and view (tv: the actor while
    // in sight, the memory out of it — what the fight code reads); out of sight: how long we keep after it (huntFor),
    // whether we go and look (huntSeek), spray the spot, lob a sub there
    if (this.sight) this.sight.reset(); else this.sight = new Sight(this);
    if (this.sp) this.sp.reset(); else this.sp = new SpecialSense(this);   // enemy specials (botSpecials.js)
    this.tk = null; this.tv = null; this._tgtSeen = false; this._pT = -1;
    this.huntFor = 0; this.huntSeek = false; this.sprayOn = false; this.sprayed = false; this.memBombOn = false; this.mBomb = null;
    this.stuck = 0; this.lastPos = new THREE.Vector3(); this.jumpCd = 0; this.bestD = Infinity; this.noProg = 0;
    this.mode = 'paint';
    this.sweep = Math.random() * 10;
    this.aimYaw = this.a.yaw; this.aimPitch = 0;
    this.errYaw = 0; this.errPitch = 0; this.errT = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 0;
    this.bombCd = 3 + Math.random() * 4;
    this.fireHold = 0;
    this.think = Math.random() * 0.2;
    this.refillUntil = 0;
    this.chargeRelease = 0.95 + Math.random() * 0.05;
    this.paintPause = 0;
    this.aimYawV = 0; this.aimPitchV = 0;
    this.acqT = 9; this.acqSignY = 0; this.acqSignP = 0;
    this.ph1 = Math.random() * 20; this.ph2 = Math.random() * 20; this.t = Math.random() * 10;
    this.strafeS = 0; this.strafeAmp = 1;
    this.mvYaw = this.a.yaw; this.mvMag = 0;
    this.dodgeCd = 1 + Math.random() * 2;
    this.retreatT = 0; this._firing = false;
    this.strikes = 0; this.strikeT = 0; this.wiggleT = 0; this.wiggleYaw = 0; this.airStill = 0;
    this.dispT = 0; this.moveAcc = 0; this.snap = new THREE.Vector3(); this.paintYawOff = 0; this.paintScanT = 0; this.goalCheckT = 0;
    this.climbT = 0; this.noClimbUntil = 0; this._climbAim = null; this._clE = null; this._clPress = false; this._clBad = null;
    // Zone Control (unused in Turf War): role + zone from the team plan, the hold timer at a guard / watch spot, and
    // the needy patch of the zone being aimed at
    this.zRole = null; this.zZone = -1; this.zHoldUntil = 0; this.zHoldDur = 0; this._zAct = null; this.zAimT = 0; this._zAim = null; this.zFail = 0; this.zFace = 0; this.zJumpAt = 0; this.zBomb = null; this.zBombScan = 0;
    // Tower Command (unused elsewhere): role from the team plan, the hold at an escort / perch spot (or by an unreachable
    // tower: tWaitT), the route point an escort's spot is by, getting on (a hop: pressed-against-its-side time, the
    // come-round-another-side detour; the cached go-straight-for-it test), on it but held off its middle by a prop, the
    // route move saved before a duel's footwork, their ink ahead while hurrying to it, a bomb onto the platform, the
    // spot to face for a thrown special, out of ink on it
    this.tRole = null; this.tHoldUntil = 0; this.tHoldDur = 0; this.tWaitT = 0; this.tGoalS = 0; this.tPickT = -9;
    this.tSideT = 0; this.tAltT = 0; this.tAlt = new THREE.Vector3(); this._tNearT = -9; this._tNearV = false; this.tOffT = 0; this.tSkirtT = -9; this.tSkirtSg = 1;
    this._tMv = new THREE.Vector3(); this.tInkT = 0; this.tInkAhead = 0; this.tBomb = null; this.tBombScan = 0; this.tFace = 0; this.tFaceP = new THREE.Vector3(); this.tDry = false;
    // climbing on (_towerClimb): the wall picked ({ f, u, type, gh, inked }, re-picked at tFaceT), close enough to steer
    // straight to its spot, time at it / swimming in / stalled on it, don't swim in again before tLetGo, a wall that
    // didn't work (tBadF until tBadT), next super jump check, a press-release trigger (flicks); the team's backup now,
    // diving in our ink on its deck; scratch wall frames
    this.tBoard = null; this.tFaceT = 0; this.tNear = false; this.tBoardT = 0; this.tSwimT = 0; this.tStallT = 0; this.tLetGo = 0;
    this.tBadF = -1; this.tBadT = 0; this.tSjT = 0; this.tPress = false; this.tBk = false; this.tHide = false;
    // an escort's slot now (TowerPlan.slots), the route patch it's inking (re-picked at tRAimT); a rider's hide / pop-up
    // clock (it keeps a pop-up or a dive a moment), inking its deck (tDeckT: next look, tDeck: the spot)
    this.tSlot = null; this.tRAimT = 0; this.tRAim = null; this.tUpT = 0; this.tDeckT = 0; this.tDeck = null;
    this._tF = {}; this._tF2 = {};
    // threats (enemy Waddles / Torpedoes hunting us, enemy canopies): the device being dealt with, when each one was
    // noticed (+ reaction time), line of sight to it, evade heading / sidestep side, canopy steering + flanking state
    this.thr = null; this.thrCand = null; this.thrScanT = Math.random() * 0.25; this._thrMem = new Map(); this._shl = [];
    this.thrLos = false; this.thrLosT = 0; this.thrAct = null; this.thrActs = 0; this.thrFiring = false; this.thrPulse = false;
    this.thrEvT = 0; this.thrEvYaw = 0; this.thrSide = 0; this.thrAcqT = 9; this.thrSignY = 0; this.thrSignP = 0;
    this.canRef = null; this.canSide = 0; this.canT = 0; this.flankSide = 0; this.blockT = 0; this.flankT = 0;
    this.navBack = null; this.navBackT = 0;   // off-graph recovery (_backOnNav)
  }

  update(dt) {
    const a = this.a;
    const it = a.intent;
    if (!a.alive) {
      it.move.set(0, 0, 0); it.fire = it.squid = it.sub = it.jump = it.special = false; this.path = null; this._wasDead = true; this.mvMag = 0; this.navBack = null; this.navBackT = 0;
      if (this.target || this.sight.mem.size) { this._dropTarget(); this.sight.reset(); }   // (what it knew is stale by the respawn)
      this.sp.dead();
      return;
    }
    if (this._wasDead && G.match && G.match.playing()) {
      // just respawned: face the way the body faces, then sometimes super jump to the teammate furthest up the field
      this._wasDead = false;
      this.aimYaw = a.yaw; this.aimPitch = 0; this.aimYawV = 0; this.aimPitchV = 0;
      const zp0 = zonePlan(), tp0 = zp0 ? null : towerPlan();
      if (zp0) this._zoneJump(zp0);
      else if (tp0) this._towerJump(tp0);
      else if (Math.random() < 0.5) {
        const enemyPad = G.level.spawnPads[1 - a.team];
        let best = null, bd = Infinity;
        for (const o of G.actors) {
          if (o === a || o.team !== a.team || !o.alive || o.superJumpState) continue;
          const d = o.pos.distanceTo(enemyPad);
          if (d < bd && o.pos.distanceTo(a.pos) > 18) { bd = d; best = o; }
        }
        // a team jump beacon further up the field beats a teammate
        for (const b of G.subs ? G.subs.beaconsFor(a.team) : []) {
          const d = b.pos.distanceTo(enemyPad);
          if (d < bd - 2 && b.pos.distanceTo(a.pos) > 18) { bd = d; best = b; }
        }
        const ok = best && (best.pos && best.kind === 'beacon' ? G.subs.jumpToBeacon(a, best) : a.superJump(best));
        if (ok) { this.path = null; this.goalTimer = 0; }
      }
    }
    if (a.superJumpState) { it.move.set(0, 0, 0); it.fire = it.squid = it.sub = it.jump = it.special = false; this.mvMag = 0; return; }
    if (!G.match || !G.match.playing()) { it.move.set(0, 0, 0); it.fire = it.squid = it.sub = it.jump = it.special = false; this.mvMag = 0; return; }
    this.think -= dt; this.jumpCd -= dt; this.bombCd -= dt; this.strafeT -= dt; this.paintPause -= dt; this.dodgeCd -= dt;
    this.acqT += dt; this.t += dt;
    if (G.boss) { this._bossTick(dt); return; }   // Boss Battle: a different job (below)

    // ---------------- perception
    if (this.think <= 0) {
      this.think = 0.15 + Math.random() * 0.1;
      this._perceive();
    }
    const tgt = this.target;
    if (tgt && !tgt.alive) this._dropTarget();
    // the foe we're fighting, between looks: still in sight? (a duck behind cover is noticed within ~0.1 s)
    else if (tgt && this.seeTimer > 0 && !this.sight.recheck(tgt)) { this.seeTimer = 0; this._tgtSeen = false; this._onLost(this.tk); }
    // ---------------- enemy specials (botSpecials.js): the dangers it has noticed (as a player could, after its reaction)
    this.sp.tick(dt);

    // ---------------- Zone Control: the team plan (null in Turf War); re-target at once on a rotation or a new role
    const zp = zonePlan();
    if (zp) this._zoneSync(zp);
    // ---------------- Tower Command: the team plan (null in every other mode); a new role re-targets at once
    const tp = zp ? null : towerPlan();
    if (tp) this._towerSync(tp);
    const rider = !!tp && this.tRole === 'ride', onT = !!tp && tp.onTower(a);

    // ---------------- mode selection (retreat = break line of sight and heal in own ink when losing a duel)
    const inkFrac = a.ink / PLAYER.inkMax;
    const hpFrac = a.hp / PLAYER.hp;
    const w = a.weapon;
    if (this.mode === 'retreat') {
      this.retreatT -= dt;
      // (a tower rider a few metres from an empty tower takes it rather than backing off)
      const grab = rider && tp.T.riders[0] + tp.T.riders[1] === 0 && Math.hypot(tp.T.pos.x - a.pos.x, tp.T.pos.z - a.pos.z) < 6;
      if (hpFrac > 0.85 || this.retreatT <= 0 || (!this.target && hpFrac > 0.6) || grab) { this.mode = 'paint'; this.path = null; this.goalTimer = 0; }
    } else if (this.target && this.seeTimer > 0 && ((hpFrac < 0.34 && !MELEE[w.kind] && a.lastDamage < 0.8) || hpFrac < 0.2) && Math.random() < 0.6 * dt * 60 * this.diff.fireDiscipline
      && !MAIN_KITS[w.kind]?.bot?.stayIn?.(this) && !rider) {   // (a kit may veto: e.g. the Cutlass finishing a fight at blade range; tower riders hold on)
      this.mode = 'retreat'; this.retreatT = 2.2 + Math.random() * 1.4; this.repath = 0; this._pickRetreat();
    }
    // (a tower rider on it doesn't hop off to refill — it holds its fire while the tank tops up, and keeps it moving)
    const stayDry = rider && onT;
    if (this.mode !== 'refill' && this.mode !== 'retreat' && inkFrac < 0.12 && !(this.target && this.seeTimer > 0 && !MELEE[w.kind] && inkFrac > 0.05) && !stayDry) {
      this.mode = 'refill'; this.refillUntil = 0.85 + Math.random() * 0.1;
    }
    if (this.mode === 'refill' && inkFrac >= this.refillUntil) this.mode = 'paint';
    if (tp) this.tDry = stayDry && (inkFrac < 0.1 || (this.tDry && inkFrac < 0.4));
    if (zp) {
      // the objective first: only take fights that are in range or on / by the zone (pushers fight like Turf War)
      if (this.mode !== 'refill' && this.mode !== 'retreat') {
        const m = this.target && this._zoneEngage(zp) ? 'fight' : 'paint';
        if (m === 'paint' && this.mode === 'fight') { this.goalTimer = 0; this.zHoldUntil = 0; }   // back to the zone
        this.mode = m;
      }
    } else if (tp) {
      // the tower first: fights in range, on it or round it (escorts: along the route too)
      if (this.mode !== 'refill' && this.mode !== 'retreat') {
        const m = this.target && this._towerEngage(tp) ? 'fight' : 'paint';
        if (m === 'paint' && this.mode === 'fight') { this.goalTimer = 0; this.tHoldUntil = 0; }
        this.mode = m;
      }
    } else if (this.mode !== 'refill' && this.mode !== 'retreat') this.mode = this.target ? 'fight' : 'paint';

    // ---------------- navigation goal
    this.goalTimer -= dt; this.repath -= dt;
    if (this.mode === 'fight' && this.target) {
      if (zp && this._zoneHoldGround(zp)) { this.path = null; this.repath = 0.3; }   // watchers / guards: don't chase off the zone
      else if (tp && this._towerFightNav(tp)) { /* riders make for the tower; perches / escorts hold their ground */ }
      else if (this.repath <= 0) this._pathTo(this.tv.pos, 0.6);   // (out of sight: where we think it is)
    } else if (this.mode === 'refill') {
      if (this.repath <= 0 || !this.path) this._pickRefill();
    } else if (this.mode === 'retreat') {
      if (this.repath <= 0 || !this.path) this._pickRetreat();
    } else {
      // our team has already covered the goal area: move on instead of walking over our own ink
      this.goalCheckT -= dt;
      if (this.goalCheckT <= 0 && this.goal >= 0 && this.path && !tp) {   // (tower escorts keep to their slot, inked or not)
        this.goalCheckT = 1;
        const g = G.nav.nodes[this.goal], st = G.paint.regionStats(g.x, g.y, g.z, 3, a.team, _stats);
        if (st.n && st.own > 0.85) this.goalTimer = 0;
      }
      if (zp) {
        // Zone Control: arrive → hold a moment (guards / watchers) → next spot on the zone
        const arrived = !this.path || this.pi >= this.path.length;
        if (arrived && this.zHoldDur > 0) { this.zHoldUntil = this.t + this.zHoldDur; this.zHoldDur = 0; }
        if (this.wiggleT <= 0 && (this.goalTimer <= 0 || (arrived && this.t >= (this.zHoldUntil || 0)))) this._pickZoneGoal(zp);
      } else if (tp) this._towerGoal(tp);
      else if (this.goalTimer <= 0 || !this.path || this.pi >= this.path.length) this._pickPaintGoal();
    }

    // ---------------- steering along the path
    const move = this._steer(dt);
    this._unstick(dt, move);
    if (!this.path && this.wiggleT <= 0) this._backOnNav(dt, move);
    if (tp) this._tMv.copy(move);   // (the route, before a duel's footwork: a tower rider still walking up keeps to it)
    const wantMove = move.lengthSq() > 0.01;

    // ---------------- actions
    it.fire = false; it.sub = false; it.special = false; it.squid = false; it.jump = false;
    let wantYaw = wantMove ? Math.atan2(move.x, move.z) : a.yaw;
    let wantPitch = -0.1;
    const enemyVisible = this.target && this.seeTimer > 0;
    // (out of sight: how old what we know of it is — seen / located / shot at by)
    const kAge = this.tk && !enemyVisible ? G.time - this.tk.t : 0;
    let fightDist = 0, idealYaw = 0, idealPitch = 0, aimDist = 6;

    if ((this.mode === 'fight' || this.mode === 'retreat') && this.target) {
      const t = this.tv;   // (in sight: the foe; out of sight: our memory of it — see botSight.js)
      const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      fightDist = dist;
      const range = this._range();
      // lead the target by the projectile's time to arrive (slosher: the heave windup + a slower, longer arc)
      const lead = w.kind === 'charger' ? 0 : w.kind === 'slosher' ? (w.windup || 0.13) + dist / ((w.projSpeed || 15) * 0.88)
        : dist / (w.projSpeed || w.speedMax || w.throwSpeed || 30);
      _v.set(t.pos.x + t.vel.x * lead, t.pos.y + (t.smoothY || 0) + (t.form === 'squid' ? 0.3 : 0.85), t.pos.z + t.vel.z * lead);
      _v2.copy(_v); _v2.x -= a.pos.x; _v2.y -= a.pos.y + 1.1; _v2.z -= a.pos.z;
      idealYaw = Math.atan2(_v2.x, _v2.z);
      idealPitch = Math.atan2(_v2.y, Math.hypot(_v2.x, _v2.z));
      aimDist = _v2.length();
      // human aim error: a slow wander plus an acquisition error that settles over the reaction time
      const e = this.diff.aimError;
      const acq = Math.exp(-this.acqT / Math.max(0.12, this.diff.reaction * 0.9));
      const wander = (x) => Math.sin(x) * 0.6 + Math.sin(x * 2.27 + 1.3) * 0.4;
      wantYaw = idealYaw + e * (0.75 * wander(this.t * 1.7 + this.ph1) + 2.4 * acq * this.acqSignY);
      wantPitch = idealPitch + e * 0.6 * (0.75 * wander(this.t * 2.1 + this.ph2) + 1.6 * acq * this.acqSignP);
      if (this.mode === 'fight') {
        // movement in combat: keep preferred distance + eased strafing (+ swim in to close distance)
        const pref = w.kind === 'charger' ? range * 0.8 : MELEE[w.kind] ? 0.5 : range * 0.7;
        if (this.strafeT <= 0) { this.strafeT = 0.6 + Math.random() * 1.2; this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeAmp = 0.5 + Math.random() * 0.5; }
        this.strafeS += (this.strafe * this.strafeAmp - this.strafeS) * (1 - Math.exp(-5 * dt));
        const nx = dx / Math.max(dist, 0.01), nz = dz / Math.max(dist, 0.01);
        let mvx = 0, mvz = 0;
        // out of sight and going to look (after a moment holding the angle where it went; located: straight away):
        // walk up to the spot along the route, aim on it, no duelling distance
        const seek = !enemyVisible && this.huntSeek && (kAge > 0.4 || (this.tk && this.tk.src !== 'sight'));
        if (seek) { if (dist > 1.2 && wantMove) { mvx = move.x; mvz = move.z; } }
        else if (dist > pref + 1.2 && wantMove) { mvx = move.x; mvz = move.z; }
        else if (dist < pref - 1.5 && !MELEE[w.kind]) { mvx = -nx; mvz = -nz; }
        if (!(CHARGES[w.kind] && a.weaponRunner.charging)) { const k = seek ? 0.3 : 0.9; mvx += -nz * this.strafeS * k; mvz += nx * this.strafeS * k; }
        if (MELEE[w.kind] && dist < 7 && enemyVisible) { mvx = nx; mvz = nz; }   // (out of sight: along the route — a wall may be in the way)
        // twin pistols: after a roll, stand planted for a moment in rapid mode (moving would drop back to dual mode)
        if (w.kind === 'twins') {
          const planted = a.weaponRunner.turret;
          if (planted && !this._wasPlanted) this.plantT = 0.7 + Math.random() * 0.7;
          this._wasPlanted = planted;
          this.plantT = (this.plantT || 0) - dt;
          if (planted && this.plantT > 0) { mvx = 0; mvz = 0; }
        }
        // an enemy on a Mega Stamp: never stand in its path — it charges straight and turns slowly, so step out of its
        // line to the side (and back off a touch), then work round to its flank / back where it's open
        const ts = t.specialActive;
        if (ts && ts.id === 'stamp') {
          const fy = ts.bodyYaw ?? t.yaw, fx = Math.sin(fy), fz = Math.cos(fy);
          const rx = a.pos.x - t.pos.x, rz = a.pos.z - t.pos.z, rl = Math.hypot(rx, rz) || 1;
          if ((rx * fx + rz * fz) / rl > Math.cos(1.25) && dist < 10) {
            const side = (rx * fz - rz * fx) >= 0 ? 1 : -1;   // which side of its facing line we're already on
            mvx = fz * side + (rx / rl) * 0.45; mvz = -fx * side + (rz / rl) * 0.45;
          } else if (dist < 4.5 && !MELEE[w.kind]) { mvx += (rx / rl) * 0.4; mvz += (rz / rl) * 0.4; }
        }
        const l = Math.hypot(mvx, mvz);
        if (l > 0.01) move.set(mvx / l, 0, mvz / l); else move.set(0, 0, 0);
        // fire only when the *actual* aim is on the body (shots follow the visible aim, not the target)
        const off = Math.hypot(angleDiff(this.aimYaw, idealYaw), this.aimPitch - idealPitch);
        const tol = Math.max(0.05, Math.atan2(0.55, dist)) * (this._firing ? 2.4 : 1.5);
        const aimed = off < tol;
        this._firing = false;
        const BK = MAIN_KITS[w.kind]?.bot;
        if (enemyVisible && this.react <= 0 && aimed && inkFrac > 0.02) {
          if (BK?.fight) {
            // kit weapons (kits/*.js) decide their own trigger (and may steer `move`)
            it.fire = BK.fight(this, { a, w, dist, range, dt, it, move, target: t });
          } else if (w.kind === 'spinner') {
            // spin up to the release point, let go, and let the stream run (aim keeps tracking during the burst)
            const wr = a.weaponRunner;
            it.fire = wr.burstT <= 0 && !(wr.charging && wr.charge >= this.chargeRelease);
          } else if (w.kind === 'splatling') {
            // spin up (a full charge at range, a quicker partial one up close), release, track while the stream runs
            const wr = a.weaponRunner, want = dist > range * 0.55 ? this.chargeRelease : 0.55 + 0.25 * this.chargeRelease;
            it.fire = !wr.streaming && dist < range * 1.1 && !(wr.charging && wr.charge >= want);
            if (wr.charging) move.multiplyScalar(0.45);
          } else if (w.kind === 'slosher') {
            it.fire = dist < range * 1.05;   // the lob also reaches targets up on ledges / behind low cover
          } else if (w.kind === 'brush') {
            it.fire = dist < 4.5;
          } else if (w.kind === 'charger') {
            it.fire = !(a.weaponRunner.charging && a.weaponRunner.charge >= this.chargeRelease);
            if (a.weaponRunner.charging) move.multiplyScalar(0.3);
          } else if (w.kind === 'roller') {
            it.fire = dist < 5.5 || (a.weaponRunner.rolling && dist < 8);
          } else {
            it.fire = dist < range * 1.08;
          }
          this._firing = it.fire;
          if (this.bombCd <= 0 && this._fightSub(dist)) { it.sub = true; this._bombAim = true; }
        } else if (CHARGES[w.kind] && a.weaponRunner.charging && !enemyVisible) {
          it.fire = true; // keep charge while target briefly hidden
        } else if (!enemyVisible && this._spray(dist, range, aimed, inkFrac)) it.fire = true;   // a short spray where it went
        // out of range with own ink underfoot: swim in (fast, hard to hit) instead of walking
        if (!it.fire && !a.weaponRunner.charging && dist > range * 1.15 && a.groundTeam === 1) it.squid = true;
        if (w.kind === 'dualies') {
          // dodge roll: while firing, roll sideways when hit or when the fight gets close (the runner locks the turret
          // after) — never toward the sea
          const wr = a.weaponRunner;
          if (it.fire && this.dodgeCd <= 0 && a.grounded && !wr.dodge && wr.dualRolls > 0 && (a.lastDamage < 0.3 || dist < 5.5) && Math.random() < 0.08 * dt * 60) {
            const side = Math.random() < 0.5 ? -1 : 1;
            if (!this._nearWater(a, (w.rollDist ?? 2.8) + 0.4)) { move.set(-nz * side, 0, nx * side); it.jump = true; this.dodgeCd = 1.4 + Math.random() * 1.6; }
          }
        } else if (a.lastDamage < 0.25 && this.dodgeCd <= 0 && a.grounded && !CHARGES[w.kind] && Math.random() < (w.kind === 'twins' ? 0.6 : 0.3)
          && !this._nearWater(a, w.kind === 'twins' ? (w.rollDist ?? 3.4) + 0.4 : 1.6)) {
          // dodge: a strafe-hop right after taking a hit (twins: a dodge roll, since they're firing and moving)
          it.jump = true; this.dodgeCd = w.kind === 'twins' ? 0.9 + Math.random() : 2 + Math.random() * 2.5;
        }
        // an enemy canopy between us and the target: flank round it, save the shots, lob a sub over it
        if (enemyVisible) this._shieldFight(t, dist, move, it, dt); else this.blockT = 0;
        // kit weapons with their own fight tactics (bot.tactics, e.g. the Cutlass: flank, pre-charge, swim in, strafe):
        // every fight frame, aimed or not, after the defaults above — may override move, fire, squid and jump
        if (BK?.tactics) BK.tactics(this, { a, w, dist, range, dt, it, move, target: t, visible: enemyVisible, aimed, canFire: enemyVisible && this.react <= 0 && aimed && inkFrac > 0.02 });
        // out of sight: now and then a sub lobbed where it went (once per loss; turn to it, throw)
        if (!enemyVisible) { const mb = this._memBombAim(dt); if (mb) { wantYaw = mb.yaw; wantPitch = mb.pitch; } }
        // Tower Command: lob a bomb onto their riders (turn to the platform, throw, back to the duel)
        if (tp) {
          const tb = this._towerBombAim(tp, dt, onT);
          if (tb) { wantYaw = tb.yaw; wantPitch = tb.pitch; this._towerBombGo(tb); }
        }
        // special
        if (a.specialReady() && (((enemyVisible || kAge < SIGHT.fresh) && this._wantSpecial('fight', dist, enemyVisible)) || (zp && this._zoneSpecial(zp, true)) || (tp && this._towerSpecial(tp, true, onT)))
          && !(tp && !this._towerSpecialOk(onT))) it.special = true;
      } else {
        // retreat: swim away through own ink, keep eyes on the threat
        it.squid = true;
        // (kits with their own tactics run the retreat too — ctx.retreat — e.g. the Cutlass runs where there's no ink)
        const RK = MAIN_KITS[w.kind]?.bot;
        if (RK?.tactics) RK.tactics(this, { a, w, dist, range, dt, it, move, target: t, visible: enemyVisible, aimed: false, canFire: false, retreat: true });
      }
    } else if (this.mode === 'paint') {
      // paint the most valuable ground in reach (unclaimed, and enemy ink even more), with a sweeping aim around it
      this.sweep += dt * (w.kind === 'charger' ? 0.8 : 2.1);
      this.paintScanT -= dt;
      if (this.paintScanT <= 0 && !MELEE[w.kind]) {
        this.paintScanT = 0.35 + Math.random() * 0.15;
        const reach = w.kind === 'charger' || w.kind === 'spinner' || w.kind === 'splatling' ? 8.5 : w.kind === 'bucket' || w.kind === 'slosher' ? 7 : w.kind === 'blaster' ? 5 : 4.5;
        let bestOff = 0, bestV = -1;
        for (const off of [0, -0.6, 0.6, -1.2, 1.2]) {
          const yw = (wantMove ? Math.atan2(move.x, move.z) : this.aimYaw) + off;
          const st = G.paint.regionStats(a.pos.x + Math.sin(yw) * reach, a.pos.y, a.pos.z + Math.cos(yw) * reach, 2.2, a.team, _stats);
          let v = st.n ? st.empty + st.enemy * 1.4 - Math.abs(off) * 0.12 : -1;
          if (zp && st.n && zp.onActive(a.pos.x + Math.sin(yw) * reach, a.pos.y, a.pos.z + Math.cos(yw) * reach)) v += 0.8;   // the zone's ink first
          if (v > bestV) { bestV = v; bestOff = off; }
        }
        this.paintYawOff = bestOff;
      }
      const sweepAmt = MELEE[w.kind] ? 0 : 0.35;
      wantYaw += (MELEE[w.kind] ? 0 : this.paintYawOff) + Math.sin(this.sweep) * sweepAmt;
      wantPitch = MAIN_KITS[w.kind]?.bot?.paintPitch !== undefined ? MAIN_KITS[w.kind].bot.paintPitch : w.kind === 'charger' ? -0.12 : w.kind === 'spinner' || w.kind === 'slosher' ? -0.16 : w.kind === 'blaster' ? -0.28 : w.kind === 'splatling' ? -0.3
        : w.kind === 'bucket' ? -0.5 : -0.42;
      // Zone Control: a needy patch of the zone in reach → ink that (long range: from the perch, straight at it)
      let zAim = zp && !MELEE[w.kind] ? this._zoneAim(zp, dt, wantMove, move) : null;
      if (zp && this.zFace > 0) {   // about to throw a special onto the zone: turn to it first
        this.zFace -= dt;
        const c = zp.Z.zones[this.zZone]?.center;
        if (c) zAim = { x: c[0], y: c[1], z: c[2], d: Math.hypot(c[0] - a.pos.x, c[2] - a.pos.z) };
      }
      // Tower Command: a rider inks the route ahead of the tower; about to throw a special → face where it should land
      if (tp) zAim = this._towerAim(tp, dt, onT, !!MELEE[w.kind]);
      if (zAim) {
        wantYaw = Math.atan2(zAim.x - a.pos.x, zAim.z - a.pos.z) + Math.sin(this.sweep) * 0.22;
        if (CHARGES[w.kind] || zAim.d < 3.2) wantPitch = clamp(Math.atan2(zAim.y + 0.05 - (a.pos.y + 1.1), Math.max(0.5, zAim.d)), -0.95, 0.15);
      }
      const aheadStats = G.paint.regionStats(a.pos.x + Math.sin(wantYaw) * 4, a.pos.y, a.pos.z + Math.cos(wantYaw) * 4, 3, a.team, _stats);
      const needPaint = aheadStats.n === 0 || aheadStats.own < 0.75 || !!zAim;
      const PK = MAIN_KITS[w.kind]?.bot;
      if (PK?.paint) {
        it.fire = PK.paint(this, { a, w, dt, it, move, needPaint, inkFrac, wantMove });
      } else if (MELEE[w.kind]) {
        it.fire = inkFrac > 0.08 && (needPaint || Math.random() < 0.02) && wantMove;
      } else if (w.kind === 'spinner') {
        // spin to ~60 %, release, let the stream paint, breather
        const wr = a.weaponRunner;
        if (wr.burstT > 0) it.fire = false;
        else if (wr.charging) { it.fire = wr.charge < 0.6; if (!it.fire) this.paintPause = 0.25 + Math.random() * 0.3; }
        else it.fire = needPaint && inkFrac > 0.3 && this.paintPause <= 0;
      } else if (w.kind === 'splatling') {
        // spin up ~60 %, hose the lane while the stream runs, breathe, repeat
        const wr = a.weaponRunner;
        if (wr.streaming) it.fire = false;
        else if (wr.charging) { it.fire = wr.charge < 0.6; if (!it.fire) this.paintPause = 0.25 + Math.random() * 0.3; }
        else it.fire = needPaint && inkFrac > 0.25 && this.paintPause <= 0;
      } else if (w.kind === 'charger') {
        // charge to ~70 % and release a paint line, then a short breather before the next one
        if (a.weaponRunner.charging) {
          it.fire = a.weaponRunner.charge < 0.7;
          if (!it.fire) this.paintPause = 0.3 + Math.random() * 0.35;
        } else it.fire = needPaint && inkFrac > 0.3 && this.paintPause <= 0;
      } else {
        it.fire = needPaint && inkFrac > 0.18;
      }
      // travel as a squid through own ink when not painting
      if (!it.fire && this._pathRemaining() > 5 && a.groundTeam === 1) it.squid = true;
      if (this.bombCd <= 0 && !onT && this._paintSub()) { it.sub = true; this._bombAim = true; }   // (nothing planted on a moving tower)
      else if (zp) {
        // Zone Control: lob a bomb onto a patch of their ink on the zone (turn to it, then throw)
        const zb = this._zoneBombAim(zp, dt);
        if (zb) {
          wantYaw = zb.yaw; wantPitch = zb.pitch;
          if (zb.release) this.zBomb = null;
          else if (Math.abs(angleDiff(this.aimYaw, zb.yaw)) < 0.09 && Math.abs(this.aimPitch - zb.pitch) < 0.09) { this._bombAim = true; zb.release = true; this.bombCd = 4 + Math.random() * 3; }
        }
      } else if (tp) {
        // Tower Command: lob a bomb onto their riders
        const tb = this._towerBombAim(tp, dt, onT);
        if (tb) { wantYaw = tb.yaw; wantPitch = tb.pitch; this._towerBombGo(tb); }
      }
      if (a.specialReady() && (zp ? this._zoneSpecial(zp) : tp ? this._towerSpecial(tp, false, onT) : this._wantSpecial('paint', 0, false))) it.special = true;
    } else if (this.mode === 'refill') {
      it.squid = a.groundTeam === 1 || this._pathRemaining() > 2;
      if (a.groundTeam !== 1 && this._pathRemaining() < 1.5 && inkFrac > 0.03) {
        // no ink here: paint a puddle to swim in
        it.squid = false; it.fire = true;
        wantPitch = -1.0;
      }
    }
    // ---------------- running specials (and cheering on a teammate's Cheer Orb)
    this._specialCtl(dt, it, move, fightDist, enemyVisible);
    // ---------------- enemy Waddles / Torpedoes after us: shoot them down or get out of the way (aim + trigger + move);
    // enemy launched canopies in the way: steer round the nearer edge (or break one we're boxed in by)
    let thrAim = this._threatCtl(dt, it, move);
    const canAim = this._canopyCtl(dt, it, move, !thrAim);
    if (!thrAim && canAim) thrAim = canAim;
    // ---------------- sprout pods (pods.js StagePods.bot): ink a pod between us and a foe to grow cover and fight from
    // behind it; our team's hedge: swim up an inked column of it and fight from its top
    if (!thrAim && G.match?.pods) thrAim = G.match.pods.bot(this, dt, it, move, enemyVisible) || null;
    if (thrAim) { wantYaw = thrAim.yaw; wantPitch = thrAim.pitch; }
    // ---------------- Tower Command: riders hold the platform's middle, or climb on (ink its wall, swim up); others off it
    const tAim = tp ? this._towerMove(tp, dt, move, it, thrAim, onT) : null;
    // ---------------- wall climb (nav 'climb' edge): ink the wall column up to the top, then swim up it (the tower's
    // wall too: tAim, inking it on the way onto its deck)
    this._climbAim = this._climb(dt, move, it) || tAim;
    if (this._climbAim) { wantYaw = this._climbAim.yaw; wantPitch = this._climbAim.pitch; }
    // ---------------- enemy specials (botSpecials.js), after everything else: out of a danger area it's in, never a
    // step into one, no shots into the untouchable; popping our team's bubble on one of theirs (an aim to hold)
    const spAim = this.sp.act(dt, it, move);
    if (spAim) { wantYaw = spAim.yaw; wantPitch = spAim.pitch; if (!thrAim) thrAim = spAim; }
    this._tail(dt, move, wantYaw, wantPitch, aimDist, wantMove, thrAim, enemyVisible);
  }

  // shared by turf and boss play: bomb release, the aim spring, the smoothed move command, edge guard, stuck recovery.
  // thrAim: a device / canopy the turf code is drawing a bead on; enemyVisible: in a duel (both unset in boss play)
  _tail(dt, move, wantYaw, wantPitch, aimDist, wantMove, thrAim = null, enemyVisible = false) {
    const a = this.a, it = a.intent, w = a.weapon;
    // throws and placements only happen in humanoid form: stay upright for the press and the release
    if (this._bombAim) { it.sub = true; it.squid = false; this._bombAim = false; this._releaseBomb = true; }
    else if (this._releaseBomb) { it.sub = false; it.squid = false; this._releaseBomb = false; }

    // ---------------- aim: critically-damped spring with a turn-rate cap (flicks accelerate and settle; no twitch)
    const fighting = this.mode === 'fight';
    const snappy = fighting || !!thrAim;   // duelling, or drawing a bead on a device / canopy
    const om = snappy ? (this.diff.aimOmega ?? 13) : 8;
    const maxRate = snappy ? (this.diff.aimTurn ?? 10) : 6;
    wantPitch = clamp(wantPitch, -1.1, 1.0);
    this.aimYawV += (om * om * angleDiff(this.aimYaw, wantYaw) - 2 * om * this.aimYawV) * dt;
    this.aimYawV = clamp(this.aimYawV, -maxRate, maxRate);
    this.aimYaw += this.aimYawV * dt;
    if (this.aimYaw > Math.PI) this.aimYaw -= Math.PI * 2; else if (this.aimYaw < -Math.PI) this.aimYaw += Math.PI * 2;
    this.aimPitchV += (om * om * (wantPitch - this.aimPitch) - 2 * om * this.aimPitchV) * dt;
    this.aimPitchV = clamp(this.aimPitchV, -maxRate * 0.7, maxRate * 0.7);
    this.aimPitch = clamp(this.aimPitch + this.aimPitchV * dt, -1.1, 1.0);
    a.aimYaw = this.aimYaw; a.aimPitch = this.aimPitch;
    // shots go where the bot is actually aiming (its eye ray at the target's distance), never straight to the target
    {
      const cp = Math.cos(this.aimPitch);
      const d = this._climbAim ? this._climbAim.dist : thrAim ? thrAim.dist : fighting && this.target ? aimDist : this.mode === 'refill' ? 1.6 : 6;
      a.aimPoint.set(a.pos.x + Math.sin(this.aimYaw) * cp * d, a.pos.y + 1.1 + Math.sin(this.aimPitch) * d, a.pos.z + Math.cos(this.aimYaw) * cp * d);
      if (!fighting && !thrAim) { const gy = a.pos.y; if (a.aimPoint.y < gy) a.aimPoint.y = gy; }
    }

    // ---------------- never walk, strafe or swim off into the sea; stay a kid over grates spanning water
    if (!this._clMove) this._avoidWater(move);   // (a climb's step to its spot in front of the wall: picked clear of the sea)
    if (it.squid && (this._squidWouldDrop(move) || (a.grounded && this._swimDrop(move)))) it.squid = false;

    // ---------------- smooth the move command: heading slews (no twitch at waypoint switches / strafe flips)
    const ml = Math.min(1, move.length());
    if (ml > 0.01) {
      const des = Math.atan2(move.x, move.z);
      const d = angleDiff(this.mvYaw, des);
      if (this.mvMag < 0.05) this.mvYaw = des;
      else if (Math.abs(d) > 2.1) { this.mvYaw = des; this.mvMag *= 0.35; }      // reversal: let the body plant and reverse
      else this.mvYaw += clamp(d, -11 * dt, 11 * dt);
    }
    this.mvMag += (ml - this.mvMag) * (1 - Math.exp(-14 * dt));
    it.move.set(Math.sin(this.mvYaw) * this.mvMag, 0, Math.cos(this.mvYaw) * this.mvMag);
    // edge guard (after the smoothing, which can swing the heading past what _avoidWater checked): never steer off a
    // deck into the sea. Probe the ground a stopping distance ahead; if it's water, slide along the edge (whichever
    // diagonal is safe) or stop.
    if (this.mvMag > 0.05 && a.grounded && !a.climbing) this._edgeGuard(a, it.move);
    // stuck recovery, based on progress toward the current waypoint: hop → skip the waypoint → replan
    const trying = this.path && wantMove && !(CHARGES[w.kind] && (a.weaponRunner.charging || a.weaponRunner.burstT > 0));
    if (!trying) this.noProg = 0;
    if (this.noProg > 0.7 && this.jumpCd <= 0 && a.grounded && !this._nearWater(a, 1.2)) { it.jump = true; this.jumpCd = 1.0; }
    if (this.noProg > 1.5 && this.path && this.pi < this.path.length - 1 && !this._skipped) { this.pi++; this._skipped = true; this.bestD = Infinity; }
    if (this.noProg > 2.4) {
      this.noProg = 0; this._skipped = false; this.path = null; this.goalTimer = 0; this.repath = 0;
      // replanning keeps failing here: shake loose in a random direction and let the next goal come from elsewhere
      if (++this.strikes >= 2) { this.strikes = 0; this._wiggle(0.9); }
      this.strikeT = 8;
    }
    if (this.noProg === 0) this._skipped = false;
    this.stuck = this.noProg;
    if (this._needJump && this.jumpCd <= 0 && a.grounded) { it.jump = true; this.jumpCd = 0.6; this._needJump = false; }
    // displacement watchdog: asking to move for 1.5 s but covering < 0.4 m means something the waypoint logic can't
    // see is holding us (re-plans reset its progress timer, so it can't catch this). Duels are exempt: strafing
    // back and forth is meant to stay put.
    this.dispT += dt; this.moveAcc += this.mvMag * dt;
    if (this.dispT >= 1.5) {
      const moved = Math.hypot(a.pos.x - this.snap.x, a.pos.z - this.snap.z);
      if (this.moveAcc / this.dispT > 0.45 && moved < 0.4 && !(this.mode === 'fight' && enemyVisible) && a.grounded && !this._climbAim && !a.climbing) {
        if (++this.strikes >= 2) { this.strikes = 0; this.goalTimer = 0; }
        this.strikeT = 8;
        this._wiggle(0.7);
      }
      this.snap.copy(a.pos); this.dispT = 0; this.moveAcc = 0;
    }
  }

  _climbEdge() {
    if (!this.path || this.pi <= 0 || this.pi >= this.path.length) return null;
    const e = G.nav.edge(this.path[this.pi - 1], this.path[this.pi]);
    return e && e.type === 'climb' ? e : null;
  }
  // Drives a climb edge once we're at its wall: stand out in front of the column (the wall point the edge was built
  // from: 1.25 m out, closer where the sea's behind), ink it from a metre up to its very top edge in the weapon's own
  // rhythm (hops to reach the top strip when the shots stop gaining height), then swim up it (a squid hop into the wall
  // takes hold above the knee-high strip). A squid lets go / stops where the ink under it ends: that bare patch is inked
  // next, then up again. Returns the aim to hold ({ yaw, pitch, dist }) or null.
  // It keeps its own watchdog — headway is a new strip of our ink up the column, a bare patch inked, or height gained
  // swimming up — and while there's headway the route's stuck recovery stays out of it (that hopped mid-inking, skipped
  // the top waypoint at 1.5 s and replanned onto the same wall: the 3–5 s stalls at a wall, and the 'walk' edge "from the
  // floor to the top" in stall logs was the waypoint after the skipped one); botlab's stuck metric reads it as held on
  // purpose (perchUntil) only while the headway is recent. No headway for CLIMB.stall s, or no ink for the rest of the
  // column (a dry bot used to stand there for good: the refill route led back up the same wall) → give it up: routes go
  // round climbs for CLIMB.off s and it replans now.
  _climb(dt, move, it) {
    const a = this.a, e = this._climbEdge();
    this._clMove = false;
    if (this._clE && e !== this._clE && a.pos.y > this._clTop - 0.5) CLIMB_STATS.done++;   // (up: the route's moved on)
    if (!e) { this._clEnd(); return null; }
    const top = G.nav.nodes[this.path[this.pi]];
    if (a.grounded && a.pos.y > top.y - 0.4) {                                          // on top: normal steering finishes
      if (this._clE === e) CLIMB_STATS.done++;
      this._clEnd(); return null;
    }
    const [wx, , wz] = e.wallP, [nx, nz] = e.wallN, topY = e.topY;
    const dist = (a.pos.x - wx) * nx + (a.pos.z - wz) * nz;                            // distance out from the wall
    if (!a.climbing && (dist > 2.4 || Math.hypot(a.pos.x - wx, a.pos.z - wz) > 2.8)) return null; // still walking up to it
    if (this._clE !== e) {
      this._clE = e; this._clTop = top.y; this.climbT = 0; this._clG = -Infinity; this._clH = a.pos.y; this._clT = this._clGT = this.t; this._clY = a.pos.y;
      this._clD = this._standOff(wx, wz, nx, nz, a.pos.y); this._clHole = null; this._clWas = false; this._clRel = false; this._clCling = 0; this._clHop = false;
      CLIMB_STATS.tries++;
    }
    this.climbT += dt;
    if (a.grounded) this._clY = a.pos.y;                                                // (the column's scanned from our feet on the ground, not mid-hop)
    const lat = (a.pos.x - wx) * -nz + (a.pos.z - wz) * nx;                            // how far along the wall we're off the column
    // a bare patch the squid found (let go below the top: the attach ray at +0.3 ran off our ink; or stopped rising: the
    // one at +0.85 did) — on the wall in front of it, at that height
    const hole = (y) => { this._clHole = { y: Math.min(y, topY - 0.05), x: wx - nz * lat, z: wz + nx * lat, t: 0 }; };
    if (this._clWas && !a.climbing && !this._clRel && this._clLY + 0.3 < topY - 0.1) hole(this._clLY + 0.35);
    this._clWas = a.climbing; this._clRel = false;
    if (a.climbing) this._clLY = a.pos.y;
    this._clCling = a.climbing && a.vel.y < 0.3 ? this._clCling + dt : 0;
    const cling = this._clCling > 0.3;
    if (cling) hole(a.pos.y + 0.85);
    // what to ink: the patch, till it's ours; else the column's lowest bare strip (from knee height at first; a column
    // whose knee-high strip won't take our ink after a moment — a roller's flick flies over a low wall's foot — is enough
    // from a metre up); null: ours to the top
    let H = a.climbing ? null : this._clHole;
    if (H && (this._inkAt(H.x, H.z, nx, nz, H.y) !== false || H.t > 0.8)) { this._clHole = H = null; this._clT = this.t; }
    const gap = a.climbing ? null : H ? H.y : this._wallInkGap(wx, wz, nx, nz, this._clY, topY, this.t - this._clGT > 0.5 ? 1.05 : 0.75);
    const lvl = gap === null ? topY : gap;
    if (!H && lvl > this._clG + 0.1) { this._clG = lvl; this._clT = this._clGT = this.t; }
    if (a.pos.y > this._clH + 0.25) { this._clH = a.pos.y; this._clT = this.t; }
    const dry = gap !== null && a.ink < this._shotInk();
    if (dry || this.t - this._clT > CLIMB.stall || this.climbT > CLIMB.max) {
      CLIMB_STATS[dry ? 'dry' : this.climbT > CLIMB.max ? 'long' : 'stalled']++;
      this.noClimbUntil = this.t + CLIMB.off; this._clBad = { e, until: this.t + CLIMB.off };
      this.path = null; this.repath = 0; this.goalTimer = 0;
      this._clEnd(); return null;
    }
    this.noProg = 0; this.bestD = Infinity; this._skipped = false;
    if (this.t - this._clT < 1) this.perchUntil = this.t + 0.3;
    it.jump = false;
    if (a.climbing || gap === null) {
      const yaw = Math.atan2(wx - a.pos.x, wz - a.pos.z);
      // ours to the top: swim into it (a squid only takes hold of a wall it's pushing into), edging onto the column's
      // line (a squid slides downhill: a stair's foot beside the wall) — never so sideways that a side wall at a corner
      // beside the column reads as pushed into (a squid takes hold past 60° off its face); holding on to another wall, or
      // stopped at an ink line → let go and come in again
      if (a.climbing && (cling || a.wallN.x * nx + a.wallN.z * nz < 0.7)) { it.squid = false; it.fire = false; this._clRel = true; this._clCling = 0; move.set(nx * 0.5, 0, nz * 0.5); return { yaw, pitch: 0.5, dist: 2 }; }
      it.squid = true; it.fire = false;
      const c = a.climbing ? 0 : clamp(-lat * 1.5, -0.45, 0.45), mx = -nx - nz * c, mz = -nz + nx * c, ml = Math.hypot(mx, mz);
      move.set(mx / ml, 0, mz / ml);
      if (!a.climbing && a.grounded && dist < 0.9 && this.jumpCd <= 0) { it.jump = true; this.jumpCd = 0.6; }
      return { yaw, pitch: 0.5, dist: 2 };
    }
    // stand square in front of the column, _clD out (a small step: the sea check was done picking the spot)
    it.squid = false;
    const sx = wx + nx * this._clD, sz = wz + nz * this._clD;
    const gx = sx - a.pos.x, gz = sz - a.pos.z, gl = Math.hypot(gx, gz);
    const placed = Math.abs(lat) < 0.35 && Math.abs(dist - this._clD) < 0.35;
    if (a.grounded && !placed) { const k = Math.min(1, gl / 0.8 + 0.2); move.set((gx / gl) * k, 0, (gz / gl) * k); this._clMove = true; }
    else move.set(0, 0, 0);
    // the shots have stopped gaining height with the top strip (or a patch) still over them: fire from a hop's top (a
    // charge weapon charges first, holds it through the hop and lets go at its top)
    if (a.grounded) this._clHop = false;
    const wr = a.weaponRunner, charge = CHARGES[a.weapon.kind] || a.weapon.kind === 'bow' || !!MAIN_KITS[a.weapon.kind]?.bot?.charges;
    const hopFor = placed && (this.t - this._clGT > 0.5 || !!H) && gap - this._clY > 1.4;
    if (a.grounded && hopFor && this.jumpCd <= 0 && (!charge || (wr.charging && wr.charge >= 0.4))) { it.jump = true; this.jumpCd = 0.8; this._clHop = true; }
    // aim: at the patch, or the column a little above its bare strip (the splash covers it) but never over the wall's
    // top (the shot would sail past); mid-hop, from the hop's top, where the shots that reach it leave from
    const tx = H ? H.x : wx, tz = H ? H.z : wz, ty = H ? H.y : Math.min(gap + 0.3, topY - 0.08);
    const eyeY = (a.grounded || a.vel.y <= 0 ? a.pos.y : a.pos.y + (a.vel.y * a.vel.y) / (2 * PLAYER.gravity)) + 1.1;
    const yaw = Math.atan2(tx - a.pos.x, tz - a.pos.z), hd = Math.max(0.5, Math.hypot(tx - a.pos.x, tz - a.pos.z)), dy = ty - eyeY, pitch = Math.atan2(dy, hd);
    const aimed = Math.abs(angleDiff(this.aimYaw, yaw)) < 0.2 && Math.abs(this.aimPitch - pitch) < 0.25;
    it.fire = dist >= 0.75 && this._climbFire(aimed, charge && hopFor && (a.grounded || a.vel.y > 1.5));   // (closer, a shot would start inside it)
    if (this._clHop && a.vel.y > 1.5 && !wr.charging) it.fire = false;                 // (a hop for the top strip: shots from its top)
    if (H && it.fire) H.t += dt;
    return { yaw, pitch, dist: Math.hypot(hd, dy) };
  }
  // how far out from a climb wall to stand inking it: 1.25 m, or closer where the sea's just behind that
  _standOff(wx, wz, nx, nz, y) {
    for (const d of [1.25, 1.05, 0.9]) if (!this._wet(wx + nx * d, wz + nz * d, y) && !this._wet(wx + nx * (d + 0.6), wz + nz * (d + 0.6), y)) return d;
    return 0.9;
  }
  _clEnd() { this._clE = null; this.climbT = 0; }
  // the trigger while inking a climb column, in the weapon's own rhythm (as pods.js _trigger): a held trigger would roll
  // a roller or charge a Cutlass instead of flicking / cutting, and charge weapons want short charges
  // (hold: keep a charge — a hop for the top strip lets it go at its top)
  _climbFire(aimed, hold = false) {
    const a = this.a, w = a.weapon, wr = a.weaponRunner, k = w.kind, KB = MAIN_KITS[k]?.bot;
    if (hold && (wr.charging || (wr.burstT <= 0 && !wr.streaming))) return true;
    if (!aimed) return !!wr.charging;                                                   // (keep a charge while turning onto it)
    if (k === 'charger' || k === 'bow') return !(wr.charging && wr.charge >= (k === 'bow' ? (w.ring1 ?? 0.4) + 0.06 : 0.45));
    if (CHARGES[k] || KB?.charges) return wr.burstT <= 0 && !wr.streaming && !(wr.charging && wr.charge >= 0.45);
    if (k === 'roller' || k === 'brush' || k === 'blade') { this._clPress = !this._clPress; return this._clPress; }
    return true;
  }
  // the least ink one shot at a wall takes (below it the column can't be inked any further)
  _shotInk() {
    const w = this.a.weapon;
    return w.inkPerShot ?? w.flickInk ?? w.swipeInk ?? w.inkPerPunch ?? w.tapInk ?? (w.inkFull ? w.inkFull * (w.inkMin ?? 0.45) : 2);
  }
  // how routes may use wall climbs now (nav.path's noClimb): true = not at all (one just failed here); a number = only
  // where there's no way round within that many metres more (it can't ink a column now: refilling, or under CLIMB.ink of
  // its tank — it would only stand at the wall); an object: that, and walls its weapon can't ink (CLIMB.reach) or the
  // one that just failed only where there's no way round at all; false = as the nav graph costs them
  // (force: as if no climb had failed — the one that did, dearest)
  _climbRule(force = false) {
    if (this.t < this.noClimbUntil && !force) return true;
    const add = this.mode === 'refill' || this.a.ink < PLAYER.inkMax * CLIMB.ink ? CLIMB.dry : 0, reach = CLIMB.reach[this.a.weapon.kind];
    const bad = this._clBad && this.t < this._clBad.until ? this._clBad.e : null;
    return reach || bad ? { add, minRise: reach?.min, maxRise: reach?.max, out: CLIMB.unreach, bad } : add || false;
  }
  // Lowest height on the wall column in front of the climb spot that isn't our ink yet (null = inked to the top): every
  // 0.45 m from `from` m over our feet (a squid hopping into the wall takes hold above the knee-high strip), then every
  // 0.1 m over the top half metre, up to its very edge (the squid stops at the ink line: a bare sliver just under the top
  // holds it on the wall — it never pops over); 0.15 m either side of the column's line too (a squid drifts a little off
  // it). Re-scanned every ~0.1 s (the ink changes no faster than the shots land).
  _wallInkGap(wx, wz, nx, nz, y0, topY, from = 0.75) {
    const C = this._clScan || (this._clScan = { t: -9, key: '', gap: null });
    const key = wx + ',' + wz + ',' + (y0 + from).toFixed(2);
    if (this.t - C.t < 0.1 && C.key === key) return C.gap;
    const bare = (y) => {
      const k = this._inkAt(wx, wz, nx, nz, y);
      if (k === null) return null;
      return !k || this._inkAt(wx - nz * 0.15, wz + nx * 0.15, nx, nz, y) === false || this._inkAt(wx + nz * 0.15, wz - nx * 0.15, nx, nz, y) === false;
    };
    let gap = null;
    const y1 = Math.max(y0 + from, topY - 0.45);
    scan: {
      for (let y = y0 + from; y < y1 - 0.05; y += 0.45) { const k = bare(y); if (k === null) break scan; if (k) { gap = y; break scan; } }
      for (let y = y1; y < topY - 0.01; y += 0.1) { const yy = Math.min(y, topY - 0.04), k = bare(yy); if (k === null) break scan; if (k) { gap = yy; break scan; } }
    }
    C.t = this.t; C.key = key; C.gap = gap;
    return gap;
  }
  // is the wall at (x, y, z) (facing n) our ink? null: no wall there
  _inkAt(x, z, nx, nz, y) {
    const h = this._wh || (this._wh = new Hit());
    _v.set(x + nx * 0.6, y, z + nz * 0.6); _v2.set(-nx, 0, -nz);
    if (!G.physics.raycast(_v, _v2, 1.2, h, true).hit) return null;
    return h.face >= 0 && G.paint.sample(h.face, h.u, h.v) - 1 === this.a.team;
  }

  // Remove any heading that would put us over open water: try the nearest safe heading, else stand still.
  _avoidWater(move) {
    const l = Math.hypot(move.x, move.z);
    if (l < 0.05) return;
    const a = this.a, L = G.level, yaw = Math.atan2(move.x, move.z);
    const safe = (yw) => {
      for (const d of [0.7, 1.3]) if (L.groundHeight(a.pos.x + Math.sin(yw) * d, a.pos.z + Math.cos(yw) * d, 50) === -Infinity) return false;
      return true;
    };
    if (safe(yaw)) return;
    for (const off of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.2, -2.2]) {
      const yw = yaw + (this._waterSide || 1) * off;
      if (safe(yw)) { this._waterSide = Math.sign(off) * (this._waterSide || 1); move.set(Math.sin(yw) * l, 0, Math.cos(yw) * l); return; }
    }
    move.set(0, 0, 0);
  }
  // ---- water probes (upstream). "Wet" = open sea under (x, z): no deck at all below y + 0.6 — exactly the rule that
  // splats an actor (actor.js) and that nav uses for node.wet. Upstream also counted any ground below
  // PLAYER.fallDeathY as wet, but our dry-dock trench floors (y = -2.0, below the sea surface) are safe, walkable nav
  // ground — counting them would freeze bots in the trench (edge guard) and block their hops there. Grates count as
  // ground here (these probes are for kid-form walking / hopping / rolling; _squidWouldDrop handles squids).
  _wet(x, z, y) { return G.level.groundHeight(x, z, y + 0.6) === -Infinity; }
  // ground all the way along a straight walk (samples every 0.45 m)
  _dryLine(x0, y0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.45);
    for (let i = 1; i <= n; i++) { const t = i / n; if (this._wet(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, y0)) return false; }
    return true;
  }
  // open water anywhere on a ring of radius r around the actor
  _nearWater(a, r) {
    for (let k = 0; k < 8; k++) { const t = (k / 8) * Math.PI * 2; if (this._wet(a.pos.x + Math.cos(t) * r, a.pos.z + Math.sin(t) * r, a.pos.y)) return true; }
    return false;
  }
  // final move command: if the ground a stopping distance ahead is water, slide along the edge or stop
  _edgeGuard(a, mv) {
    const m = Math.hypot(mv.x, mv.z); if (m < 1e-4) return;
    const dx = mv.x / m, dz = mv.z / m;
    const look = 0.6 + Math.hypot(a.vel.x, a.vel.z) * 0.17;
    const px = a.pos.x, py = a.pos.y, pz = a.pos.z;
    const bad = (ux, uz) => this._wet(px + ux * 0.45, pz + uz * 0.45, py) || this._wet(px + ux * look, pz + uz * look, py);
    if (!bad(dx, dz)) return;
    for (const ang of [0.8, -0.8, 1.45, -1.45]) {
      const c = Math.cos(ang), s = Math.sin(ang), nx = dx * c + dz * s, nz = -dx * s + dz * c;
      if (!bad(nx, nz)) { mv.set(nx * m, 0, nz * m); return; }
    }
    mv.set(0, 0, 0);
  }
  // squid form drops through grates: is there only water under us (or just ahead) once grates don't count?
  _squidWouldDrop(move) {
    const a = this.a, L = G.level;
    if (L.groundHeight(a.pos.x, a.pos.z, 50, true) === -Infinity) return true;
    const l = Math.hypot(move.x, move.z);
    if (l <= 0.05) return false;
    // (a swimmer carries on a couple of metres after it surfaces: the faster it goes, the further ahead it looks)
    const look = 0.6 + Math.hypot(a.vel.x, a.vel.z) * 0.22;
    for (const d of look > 1.5 ? [1.2, look] : [1.2]) if (L.groundHeight(a.pos.x + (move.x / l) * d, a.pos.z + (move.z / l) * d, 50, true) === -Infinity) return true;
    return false;
  }

  // a swimming squid leaves a ledge at swim speed and flies on 3–5 m before it lands (a kid just steps off it): with the
  // sea close past the drop, surface and walk off instead
  _swimDrop(move) {
    const a = this.a, l = Math.hypot(move.x, move.z);
    if (l < 0.05) return false;
    const ux = move.x / l, uz = move.z / l, gy = G.level.groundHeight(a.pos.x + ux * 1.1, a.pos.z + uz * 1.1, a.pos.y + 0.6);
    if (gy === -Infinity || gy > a.pos.y - 0.5) return false;   // level ahead (the open sea ahead: _avoidWater / _squidWouldDrop)
    for (const d of [2.2, 3.4, 4.6]) if (this._wet(a.pos.x + ux * d, a.pos.z + uz * d, gy)) return true;
    return false;
  }

  // Low on health mid-duel: head for own ink away from the threat (swim = heal + hard to spot), then come back.
  _pickRetreat() {
    const a = this.a, t = this.tv;
    let bestP = null, bs = -Infinity;
    for (let i = 0; i < 16; i++) {
      const ang = Math.random() * Math.PI * 2, r = 3 + Math.random() * 8;
      _v.set(a.pos.x + Math.cos(ang) * r, a.pos.y, a.pos.z + Math.sin(ang) * r);
      const st = G.paint.regionStats(_v.x, _v.y, _v.z, 1.4, a.team, _stats);
      if (!st.n) continue;
      const away = t ? Math.hypot(_v.x - t.pos.x, _v.z - t.pos.z) - Math.hypot(a.pos.x - t.pos.x, a.pos.z - t.pos.z) : 0;
      const score = st.own * 6 + away * 0.8 - r * 0.15 + (t && !G.physics.los(_v2.set(_v.x, _v.y + 1, _v.z), _v3.set(t.pos.x, t.pos.y + 1, t.pos.z)) ? 4 : 0);
      if (score > bs) { bs = score; bestP = _v.clone(); }
    }
    if (bestP) this._pathTo(bestP, 0.5); else this.path = null;
    this.repath = 1.0;
  }

  // Mid-duel sub use (enemy in view at `dist`). Sets the cooldown and returns true to throw this frame.
  // when to fire off the special (fight: distance to the target; paint: only the turf-claiming ones)
  _wantSpecial(mode, dist, vis) {
    const a = this.a, id = SPECIALS[a.specialId]?.kind || a.specialId, r = Math.random();
    if (mode === 'fight') {
      switch (id) {
        case 'slam': return dist < 4.5;
        case 'storm': return dist < 16;
        case 'barrage': return dist < 14;
        case 'bubbler': return dist < 12 && (a.lastDamage < 0.6 || r < 0.02);
        case 'sonar': return r < 0.02;
        case 'strike': return dist > 14 && r < 0.01;
        case 'zooka': return vis && dist > 7 && dist < 36;
        case 'wail': return vis && dist > 5 && dist < 40;
        case 'kraken': return dist < 10;
        case 'blower': return dist < 14;
        case 'jetpack': return dist > 5 && dist < 22;
        case 'stamp': return dist < 9;
        case 'booyah': return dist > 9 && dist < 26 && r < 0.03;
        case 'zipcaster': return dist < 16;
        case 'crab': return dist < 20;
      }
      return false;
    }
    const turf = { storm: 1, strike: 1, booyah: 1, barrage: 1, sonar: 1, kraken: 1, crab: 1, zooka: 1, blower: 1, stamp: 1 };
    if (!turf[id] || r > 0.012) return false;
    const st = G.paint.regionStats(a.pos.x, a.pos.y, a.pos.z, 6, a.team, _stats);
    return st.own < 0.55;
  }

  // driving a running special: most reuse the normal fight aim; these set the trigger / sub / movement they need
  _specialCtl(dt, it, move, dist, vis) {
    const a = this.a, s = a.specialActive;
    // cheer on a teammate's charging Cheer Orb
    if ((!s || s.id !== 'booyah') && Math.random() < dt * 1.3) {
      for (const o of G.actors) { const os = o.specialActive; if (o !== a && o.team === a.team && os && os.id === 'booyah' && !os.thrown) { it.cheer = true; break; } }
    }
    // don't waste shots or bombs into a Mega Stamp's swing from the front (its guard deflects them)
    const ts = this.target && this.seeTimer > 0 && this.target.specialActive;
    if (ts && ts.id === 'stamp' && ts.guard > 0) {
      const T = this.target, fy = ts.bodyYaw ?? T.yaw, rx = a.pos.x - T.pos.x, rz = a.pos.z - T.pos.z, rl = Math.hypot(rx, rz) || 1;
      if ((rx * Math.sin(fy) + rz * Math.cos(fy)) / rl > Math.cos(1.2)) { it.fire = false; it.sub = false; }
    }
    if (!s) return;
    // Zone Control: a Vortex Strike lands on the live zone (on its enemy ink when we're taking it back)
    if (s.id === 'strike' && s.aiming && s.target && !s._zoneAimed && G.match && G.match.zones) {
      s._zoneAimed = true;
      const P = zonePlan(), p = P && P.hotspot(this.zZone, a.team);
      if (p) s.target.set(p.x, 0, p.z);
    }
    // Tower Command: onto the tower when it isn't ours, else onto the route just ahead of it. (Not its exact centre: the
    // missile lands on the pillar's top there, 3.6 m up, and a vortex hurts only from 1.5 m below its centre — never the
    // riders on the deck. On the ground beside the platform it covers the deck and the escorts round it.)
    if (s.id === 'strike' && s.aiming && s.target && !s._zoneAimed && G.match && G.match.tower) {
      s._zoneAimed = true;
      const P = towerPlan();
      if (P) {
        const T = P.T;
        if (T.owner === a.team) { const p = P.at(T.s + P.dirOf(a.team) * 8); s.target.set(p.x, 0, p.z); }
        else {
          T.path.dir(T.s, _tq);
          let bx = T.pos.x, bz = T.pos.z;
          for (const sg of [1, -1]) {
            const x = T.pos.x - _tq.z * sg * 2.2, z = T.pos.z + _tq.x * sg * 2.2;
            if (G.level.groundHeight(x, z, T.pos.y + 0.8) > -Infinity) { bx = x; bz = z; break; }
          }
          s.target.set(bx, 0, bz);
        }
      }
    }
    const fighting = this.mode === 'fight' && !!this.target;
    const t = this.tv;
    // charge straight at the target only when it's close (further out the nav path + water avoidance steer)
    const toward = () => {
      if (!t || dist > 5 || Math.abs(t.pos.y - a.pos.y) > 1.2) return;
      const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, l = Math.hypot(dx, dz) || 1;
      if (G.level.groundHeight(a.pos.x + (dx / l) * 1.5, a.pos.z + (dz / l) * 1.5, a.pos.y + 1) < a.pos.y - 1.5) return;   // don't run off a ledge
      move.set(dx / l, 0, dz / l);
    };
    this.spT = (this.spT || 0) + dt;
    switch (s.kind || s.id) {
      case 'barrage':
        this.barrageCd = (this.barrageCd || 0) - dt;
        if (this.barrageCd <= 0 && (!fighting || dist < 16)) { it.sub = true; this._bombAim = true; this.barrageCd = 0.35 + Math.random() * 0.3; }
        break;
      case 'zooka':
        it.fire = fighting ? vis && dist < 42 : Math.random() < 0.06;
        it.squid = false;
        break;
      case 'kraken':
        it.squid = false;
        if (fighting) { toward(); it.fire = dist < 3.6 && vis; if (a.grounded && dist > 6 && Math.random() < dt * 0.8) it.jump = true; }
        break;
      case 'stamp': {
        // heavy stamp: charge when the target is roughly ahead of the (slow-turning) body, stop to turn when it isn't,
        // flip (jump + swing) to hit something right behind or just past swing reach, throw it at range
        it.squid = false;
        const d = s.def;
        this.stampFlip = (this.stampFlip || 0) - dt;
        if (this.stampFlip > 0) { if (!a.grounded) it.fire = true; break; }   // mid-jump: swing once airborne = the flip
        if (fighting && t) {
          const off = Math.abs(angleDiff(s.bodyYaw ?? a.yaw, Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z)));
          const near3 = Math.abs(t.pos.y - a.pos.y) < 1.8;
          if (a.grounded && near3 && dist < 2.6 && off > 2.3) { it.jump = true; this.stampFlip = 0.4; }             // right behind: flip
          else if (a.grounded && near3 && off < 0.3 && dist > 3.3 && dist < 4.3) { it.jump = true; this.stampFlip = 0.4; }   // just out of reach: flip
          else if (off > 0.9 && dist < 9) move.set(0, 0, 0);                                                           // stop and turn
          else {
            // charge: straight at the target from further out than other specials (unless that runs off a ledge)
            if (near3 && dist < 12) {
              const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, l = Math.hypot(dx, dz) || 1;
              if (G.level.groundHeight(a.pos.x + (dx / l) * 1.5, a.pos.z + (dz / l) * 1.5, a.pos.y + 1) >= a.pos.y - 1.5) move.set(dx / l, 0, dz / l);
            }
            it.fire = off < 0.7 && dist < d.reach + d.radius + 0.5;
          }
          if (vis && dist > 9 && dist < 20 && Math.random() < dt * 0.8) it.sub = true;
        } else it.fire = Math.random() < 0.5;
        break;
      }
      case 'crab':
        it.fire = fighting ? vis && dist < 24 : Math.random() < 0.3;
        it.sub = fighting && vis && dist > 8 && dist < 22 && Math.random() < dt * 1.5;
        it.squid = (fighting && s.hp < s.def.hp * 0.3 && dist > 8) || (!fighting && this._pathRemaining() > 12);
        break;
      case 'blower':
        this.blowT = (this.blowT || 0) + dt;
        it.fire = this.blowT < 0.9;
        if (this.blowT > 1.4) this.blowT = 0;
        it.squid = false;
        break;
      case 'booyah':
        it.squid = false;
        it.fire = s.charge >= 1 && Math.random() < dt * 3;
        break;
      case 'jetpack':
        it.fire = fighting && vis && dist < 30;
        break;
      case 'zipcaster':
        if (fighting && vis && dist > 6 && dist < 18 && Math.random() < dt * 0.6) it.sub = true;
        break;
    }
  }

  _fightSub(dist) {
    const a = this.a, sub = a.sub || SUB.bomb, k = sub.kind;
    if (a.ink < sub.inkCost + 8 || k === 'beacon') return false;
    { const SK = SUB_KITS[k]?.bot; if (SK?.fight) return SK.fight(this, dist); }   // kit subs decide for themselves
    const roll = Math.random() < 0.02 * (1 + this.diff.fireDiscipline);
    let go = false;
    switch (k) {
      case 'burst': go = dist > 3 && dist < 12 && Math.random() < 0.04; break;                // cheap: often
      case 'scan': go = dist > 8 && dist < 18 && roll; break;
      case 'curtain': go = dist > 4 && dist < 14 && a.lastDamage < 0.6 && Math.random() < 0.05; break;  // cover when hit
      case 'sprinkler': go = false; break;
      case 'mine': go = dist < 10 && a.lastDamage < 1.5 && Math.random() < 0.05; break;     // a trap at your feet while under fire
      case 'seeker': go = dist > 5 && dist < 15 && roll; break;
      default: go = dist > 4 && dist < 14 && roll;                                              // bomb, sticky, mist
    }
    if (go) this.bombCd = k === 'burst' ? 1.5 + Math.random() * 2 : 5 + Math.random() * 6;
    return go;
  }
  // Sub use while painting: sprinklers onto open turf ahead, mines around the contested middle, beacons up front.
  _paintSub() {
    const a = this.a, sub = a.sub || SUB.bomb, k = sub.kind;
    { const SK = SUB_KITS[k]?.bot; if (SK?.paint) return a.ink >= sub.inkCost + 4 && SK.paint(this); }
    if (a.ink < sub.inkCost + (sub.placed ? 4 : 20) || Math.random() > (sub.placed ? 0.04 : 0.01)) return false;
    const pads = G.level.spawnPads, total = pads[0].distanceTo(pads[1]);
    const progress = 1 - Math.hypot(a.pos.x - pads[1 - a.team].x, a.pos.z - pads[1 - a.team].z) / total;
    let go = false;
    if (k === 'sprinkler') {
      // (sub-tweaks: it sprays out to sprayRadius, 5.5 m) a paint-mode lob lands ~5.5 m ahead: mostly unclaimed turf over
      // most of its disc, and no teammate's sprinkler already covering that spot
      const R = sub.sprayRadius || 5.5, cx = a.pos.x + Math.sin(a.aimYaw) * 5.5, cz = a.pos.z + Math.cos(a.aimYaw) * 5.5;
      const st = G.paint.regionStats(cx, a.pos.y, cz, R * 0.8, a.team, _stats);
      go = st.n > 0 && st.own < 0.4 && !G.subs.items.some((o) => o.state === 'spray' && o.team === a.team && o.owner !== a && Math.hypot(o.pos.x - cx, o.pos.z - cz) < R * 1.2);
    } else if (k === 'mine') go = progress > 0.3 && progress < 0.7;
    else if (k === 'beacon') go = progress > 0.4 && !G.subs.beaconsFor(a.team).some((b) => b.pos.distanceTo(a.pos) < 12);
    if (go) this.bombCd = 8 + Math.random() * 8;
    return go;
  }

  // ================================================================ Zone Control (only ever called in a zones match)
  // after respawning: super jump to the teammate (or jump beacon) closest to our zone when it's a long way off
  _zoneJump(P, minD = 24, chance = 0.8) {
    const a = this.a, r = P.roleOf(a), c = P.Z.zones[r.zone].center, R = P.info[r.zone].R;
    const dSelf = Math.hypot(a.pos.x - c[0], a.pos.z - c[2]);
    if (dSelf < minD || Math.random() > chance || r.role === 'push') return;
    let best = null, bd = Math.min(dSelf - 12, R + 14);
    const W = P.waves[a.team], st = W.state !== 'free' ? P.info[r.zone].stage[a.team] : null;
    if (st) {
      // locked out: land with the group at the staging spot, never alone on their zone
      bd = 9;
      for (const o of G.actors) {
        if (o === a || o.team !== a.team || !o.alive || o.superJumpState || o.hp < PLAYER.hp * 0.45 || P.onZone(r.zone, o.pos)) continue;
        const d = Math.hypot(o.pos.x - st.x, o.pos.z - st.z);
        if (d < bd && o.pos.distanceTo(a.pos) > 18) { bd = d; best = o; }
      }
      if (!best) return;
      if (a.superJump(best)) { this.path = null; this.goalTimer = 0; }
      return;
    }
    for (const o of G.actors) {
      if (o === a || o.team !== a.team || !o.alive || o.superJumpState || o.hp < PLAYER.hp * 0.45) continue;
      const d = Math.hypot(o.pos.x - c[0], o.pos.z - c[2]);
      if (d < bd && o.pos.distanceTo(a.pos) > 18) { bd = d; best = o; }
    }
    for (const b of G.subs ? G.subs.beaconsFor(a.team) : []) {
      const d = Math.hypot(b.pos.x - c[0], b.pos.z - c[2]);
      if (d < bd - 2 && b.pos.distanceTo(a.pos) > 18) { bd = d; best = b; }
    }
    const ok = best && (best.pos && best.kind === 'beacon' ? G.subs.jumpToBeacon(a, best) : a.superJump(best));
    if (ok) { this.path = null; this.goalTimer = 0; }
  }

  // per frame: a rotation or a changed role / zone re-targets straight away
  _zoneSync(P) {
    const r = P.roleOf(this.a);
    if (P.Z.active !== this._zAct || r.role !== this.zRole || r.zone !== this.zZone) {
      const rotated = P.Z.active !== this._zAct && this._zAct !== null;
      this._zAct = P.Z.active; this.zRole = r.role; this.zZone = r.zone;
      this.goalTimer = 0; this.zHoldUntil = 0; this.zHoldDur = 0; this.zAimT = 0; this._zAim = null;
      if (rotated && this.mode === 'paint') this.path = null;
      if (rotated) this.zJumpAt = this.t + 0.4 + Math.random() * 2;   // the objective moved a long way off: maybe jump there
    }
    // (after a rotation, a bot far from the new zone and not in a fight super jumps to a teammate already on it)
    if (this.zJumpAt && this.t >= this.zJumpAt) {
      this.zJumpAt = 0;
      if (this.mode === 'paint' && !this.target && this.a.alive && !this.a.specialActive) this._zoneJump(P, 34, 0.5);
    }
  }

  // take the fight? In range, or the foe is on / by our zone; otherwise keep inking the objective
  _zoneEngage(P) {
    const a = this.a, t = this.tv;
    if (!t) return false;
    if (this.zRole === 'push') return true;
    const d = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z), range = this._range();
    if (d < range * (this.zRole === 'watch' ? 1.05 : 1.25)) return true;
    if (this.zRole === 'watch' || this.zRole === 'stage') return false;   // (stagers wait for the group)
    const c = P.Z.zones[this.zZone].center;
    return Math.hypot(t.pos.x - c[0], t.pos.z - c[2]) < P.info[this.zZone].R + 5;
  }
  // in a fight: watchers keep their perch while the foe is in range; guards don't chase more than ~10 m off the zone
  _zoneHoldGround(P) {
    const a = this.a, t = this.tv, range = this._range();
    const d = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
    if (this.zRole === 'watch') return d < range * 1.05 && d > 3;
    if (this.zRole === 'stage') return d > 4;                          // hold the staging spot: shoot, don't chase
    if (this.zRole === 'push' || d < 4) return false;
    // guards / painters: never chase a foe further off the zone than we are (shoot from here, then back to the ink)
    const c = P.Z.zones[this.zZone].center, R = P.info[this.zZone].R;
    const tz = Math.hypot(t.pos.x - c[0], t.pos.z - c[2]), sz = Math.hypot(a.pos.x - c[0], a.pos.z - c[2]);
    return tz > R + (this.zRole === 'guard' ? 3 : 6) && tz > sz + 2;
  }

  // next spot to go to for our role
  _pickZoneGoal(P) {
    const a = this.a, nav = G.nav, t = a.team, r = P.roleOf(a), zi = r.zone, I = P.info[zi], zone = P.Z.zones[zi];
    this.zRole = r.role; this.zZone = zi; this.zHoldDur = 0;
    let role = r.role;
    const needFrac = I.needSum[t] / Math.max(1, I.reach);
    // a guard with touch-ups to do paints; a watcher with nowhere to perch (or a zone slipping away) paints too
    if (role === 'guard' && needFrac > 0.1) role = 'paint';
    let id = -1, hold = 0;
    if (role === 'stage') {
      // regroup just outside the zone on our side and wait for the push (the plan flips us to 'paint' when it goes)
      const st = I.stage[t];
      if (st) { id = st.spots[(Math.random() * st.spots.length) | 0]; hold = 2 + Math.random() * 2; this.goalTimer = 12; }
      else role = 'guard';
    }
    if (role === 'push') {
      id = this._zonePushNode(P, I, zone);
      this.goalTimer = 4 + Math.random() * 3;
    } else if (role === 'watch') {
      id = this._zoneWatchNode(P, I, zone);
      if (id >= 0) { hold = 3 + Math.random() * 3; this.goalTimer = 12; }
    } else if (role === 'guard' && id < 0) {
      id = this._zoneGuardNode(P, I, zone);
      hold = 1 + Math.random() * 1.6; this.goalTimer = 7;
    }
    if (id < 0) {
      id = this._zonePaintNode(P, I, zone);
      hold = 0; this.goalTimer = 3.5 + Math.random() * 2;
    }
    // nothing left to ink on it: stand guard on it (or, failing that, press on past it)
    if (id < 0) { id = this._zoneGuardNode(P, I, zone); hold = 1 + Math.random() * 1.5; this.goalTimer = 6; }
    if (id < 0) { id = this._zonePushNode(P, I, zone); hold = 0; this.goalTimer = 4 + Math.random() * 3; }
    if (id < 0) { this._pickPaintGoal(); return; }
    const n = nav.nodes[id];
    if (this._pathTo(_v3.set(n.x, n.y, n.z), 0.3)) { this.zHoldDur = hold; this.zFail = 0; }
    else if (++this.zFail >= 3) { this.zFail = 0; this._wiggle(0.8); }   // no way out of here (off the nav mesh): shake loose
  }

  // the neediest reachable patch of the zone (its not-ours ink round a node), nearby first, away from teammates' goals
  _zonePaintNode(P, I, zone) {
    const a = this.a, nav = G.nav, need = I.need[a.team], N = I.nodes.length;
    if (!N) return -1;
    const mates = G.actors.filter((o) => o !== a && o.team === a.team && o.bot && o.alive && o.bot.goal >= 0);
    let best = -1, bs = -Infinity;
    const step = N > 110 ? 2 : 1;
    for (let li = (Math.random() * step) | 0; li < N; li += step) {
      let v = 0;
      for (const k of I.nb[li]) v += need[k];
      if (v < 4) continue;
      const n = nav.nodes[I.nodes[li]];
      const d = Math.hypot(n.x - a.pos.x, n.z - a.pos.z) + Math.abs(n.y - a.pos.y) * 1.5;
      let sc = Math.min(v, 60) * 0.25 - d * 0.16 + Math.random() * 2;
      for (const m of mates) { const g = nav.nodes[m.bot.goal]; if (Math.hypot(g.x - n.x, g.z - n.z) < 3.5) sc -= 4; }
      if (sc > bs) { bs = sc; best = I.nodes[li]; }
    }
    return best;
  }
  // a spot on / at the edge of the zone, on its enemy-facing side, apart from the other guards
  _zoneGuardNode(P, I, zone) {
    const a = this.a, nav = G.nav, c = zone.center, e = P.enemyDir(zone, a.team);
    const mates = G.actors.filter((o) => o !== a && o.team === a.team && o.bot && o.alive && o.bot.goal >= 0);
    let best = -1, bs = -Infinity;
    for (let k = 0; k < 40; k++) {
      const id = I.ring[(Math.random() * I.ring.length) | 0];
      const n = nav.nodes[id];
      const dx = n.x - c[0], dz = n.z - c[2], d = Math.hypot(dx, dz);
      if (d > I.R + 3 || n.wet === 2) continue;
      const side = (dx * e[0] + dz * e[1]) / Math.max(d, 1);
      let sc = side * 2 + (d > I.R * 0.4 ? 1 : 0) - Math.hypot(n.x - a.pos.x, n.z - a.pos.z) * 0.05 + Math.random() * 1.5 - Math.abs(n.y - c[1]) * 0.5;
      for (const m of mates) { const g = nav.nodes[m.bot.goal]; if (Math.hypot(g.x - n.x, g.z - n.z) < 4) sc -= 3; }
      if (sc > bs) { bs = sc; best = id; }
    }
    return best;
  }
  // long range: a perch on our side of the zone, a little above it if possible, that can see it
  _zoneWatchNode(P, I, zone) {
    const a = this.a, nav = G.nav, c = zone.center, e = P.enemyDir(zone, a.team), range = this._range();
    const mates = G.actors.filter((o) => o !== a && o.team === a.team && o.bot && o.alive && o.bot.goal >= 0);
    const dMax = Math.min(range * 0.85, I.R + 12), dMin = Math.min(I.R * 0.55, dMax - 2), cands = [];
    for (let k = 0; k < 70; k++) {
      const id = I.ring[(Math.random() * I.ring.length) | 0];
      const n = nav.nodes[id];
      const dx = n.x - c[0], dz = n.z - c[2], d = Math.hypot(dx, dz);
      if (d < dMin || d > dMax || n.wet === 2) continue;
      const side = (dx * e[0] + dz * e[1]) / Math.max(d, 1);
      let sc = clamp(n.y - c[1], -2, 4) * 1.1 - side * 1.6 - Math.abs(d - range * 0.55) * 0.1 - Math.hypot(n.x - a.pos.x, n.z - a.pos.z) * 0.04 + Math.random() * 1.2 - (n.wet ? 1.5 : 0);
      for (const m of mates) { const g = nav.nodes[m.bot.goal]; if (Math.hypot(g.x - n.x, g.z - n.z) < 5) sc -= 4; }
      cands.push([sc, id]);
    }
    cands.sort((x, y) => y[0] - x[0]);
    _v2.set(c[0], c[1] + 0.6, c[2]);
    for (let k = 0; k < Math.min(6, cands.length); k++) {
      const n = nav.nodes[cands[k][1]];
      if (G.physics.los(_v.set(n.x, n.y + 1.4, n.z), _v2)) return cands[k][1];
    }
    return -1;
  }
  // pressure forward: unclaimed / enemy turf 3–18 m past the zone toward the enemy's side (never camping their spawn)
  _zonePushNode(P, I, zone) {
    const a = this.a, nav = G.nav, c = zone.center, e = P.enemyDir(zone, a.team), ep = G.level.spawnPads[1 - a.team];
    let best = -1, bs = -Infinity;
    for (let k = 0; k < 28; k++) {
      const id = I.far[(Math.random() * I.far.length) | 0];
      if (id === undefined) break;
      const n = nav.nodes[id];
      if (n.zone >= 0 || n.wet === 2 || Math.hypot(n.x - ep.x, n.z - ep.z) < 22) continue;
      const dx = n.x - c[0], dz = n.z - c[2], d = Math.hypot(dx, dz), side = (dx * e[0] + dz * e[1]) / Math.max(d, 1);
      if (side < -0.1) continue;
      const near = G.paint.regionStats(n.x, n.y, n.z, 3, a.team, _stats);
      if (!near.n) continue;
      const v = near.empty + near.enemy * 1.4;
      const sc = v * 10 + side * 2 - Math.hypot(n.x - a.pos.x, n.z - a.pos.z) * 0.1 + Math.random() * 1.5 - (n.wet ? 1.5 : 0);
      if (sc > bs) { bs = sc; best = id; }
    }
    return best;
  }

  // a needy patch of our zone in reach of where we stand (re-picked ~1×/s); null = the normal paint scan decides
  _zoneAim(P, dt, moving, move) {
    this.zAimT -= dt;
    if (this.zAimT <= 0) {
      this.zAimT = 0.7 + Math.random() * 0.4;
      this._zAim = null;
      const a = this.a, w = a.weapon, zi = this.zZone;
      if (zi < 0 || !P.isActive(zi)) return null;
      const I = P.info[zi], need = I.need[a.team], nav = G.nav;
      const far = CHARGES[w.kind] ? Math.min(this._range() * 0.9, 16) : w.kind === 'bucket' || w.kind === 'slosher' ? 7 : w.kind === 'blaster' ? 6 : 5.5;
      const c = P.Z.zones[zi].center;
      if (Math.hypot(a.pos.x - c[0], a.pos.z - c[2]) > I.R + far) return null;
      let bs = -Infinity, bp = null;
      for (let li = 0; li < I.nodes.length; li++) {
        if (need[li] < 3) continue;
        const n = nav.nodes[I.nodes[li]], d = Math.hypot(n.x - a.pos.x, n.z - a.pos.z);
        if (d < 1.4 || d > far || Math.abs(n.y - a.pos.y) > 3.5) continue;
        const sc = need[li] - d * 0.35;
        if (sc > bs) { bs = sc; bp = n; }
      }
      if (bp) {
        // (short-range kids only look aside for it when they're standing, or it's roughly the way they're going)
        const ahead = !moving || Math.abs(angleDiff(Math.atan2(move.x, move.z), Math.atan2(bp.x - a.pos.x, bp.z - a.pos.z))) < 1.1;
        if (CHARGES[w.kind] || ahead) this._zAim = { x: bp.x, y: bp.y, z: bp.z, d: 0 };
      }
    }
    const z = this._zAim;
    if (z) z.d = Math.hypot(z.x - this.a.pos.x, z.z - this.a.pos.z);
    return z;
  }

  // specials: break a hold on the zone (standing on / facing it), or defend it when foes turn up
  // (gauges fill fast in this mode — 4.5 p/s while the other team holds — so they're spent readily)
  _zoneSpecial(P, fighting = false) {
    const a = this.a, t = a.team, zi = this.zZone, W = P.waves[t];
    if (zi < 0 || !P.isActive(zi)) return false;
    if (W.state === 'stage' && !fighting) return false;                // saved for the push
    if (W.state === 'push' && G.time < P.spNext[t]) return false;     // chained: one teammate at a time
    const zone = P.Z.zones[zi], I = P.info[zi], c = zone.center;
    const dz = Math.hypot(a.pos.x - c[0], a.pos.z - c[2]);
    if (dz > I.R + 12) return false;
    const ours = P.Z.owner === t;
    let foes = 0;   // (foes the team knows are on / by it: seen, located or seen there lately)
    for (const o of G.actors) { if (o.team === t || !o.alive) continue; const k = teamKnown(t, o, 3); if (k && Math.hypot(k.pos.x - c[0], k.pos.z - c[2]) < I.R + 8) foes++; }
    if (ours && !foes) return false;                                 // holding it quietly: keep it for the push-back
    const id = SPECIALS[a.specialId]?.kind || a.specialId;
    if ((id === 'sonar' || id === 'bubbler' || id === 'wail' || id === 'zooka' || id === 'stamp' || id === 'crab') && !foes) return false;
    // thrown / aimed ones go where we look: only while facing the zone or standing on it (fights: _wantSpecial's aim)
    const thrown = id === 'storm' || id === 'barrage' || id === 'booyah' || id === 'zooka' || id === 'wail' || id === 'blower';
    if (thrown && !fighting && dz > I.R * 0.7 && Math.abs(angleDiff(this.aimYaw, Math.atan2(c[0] - a.pos.x, c[2] - a.pos.z))) > 0.6) { this.zFace = 0.8; return false; }
    const go = Math.random() < (fighting ? 0.03 : W.state === 'push' ? 0.2 : 0.08);
    if (go && W.state === 'push') P.spNext[t] = G.time + 2.2 + Math.random() * 0.8;
    return go;
  }

  // a thrown sub onto the biggest patch of their ink on our zone in lobbing range (re-looked-for twice a second);
  // returns the aim to hold ({ yaw, pitch, release }) while it's thrown
  _zoneBombAim(P, dt) {
    if (this.zBomb) { this.zBomb.t -= dt; if (this.zBomb.t <= 0) this.zBomb = null; return this.zBomb; }
    this.zBombScan -= dt;
    const a = this.a, sub = a.sub || SUB.bomb;
    if (this.zBombScan > 0 || this.bombCd > 0 || !THROWN[sub.kind] || a.ink < sub.inkCost + 10 || this.zRole === 'watch') return null;
    if (SUB_KITS[sub.kind]?.blocked?.(a, sub)) return null;   // one already out (Torpedo / Boomerang): don't wind up a throw
    this.zBombScan = 0.5;
    const t = a.team, zi = this.zZone;
    if (zi < 0 || !P.isActive(zi)) return null;
    const zone = P.Z.zones[zi];
    if (zone.owner !== 1 - t && zone.share[1 - t] < 0.25) return null;   // only to open up a zone they hold / are taking
    const I = P.info[zi], ink = I.ink[1 - t], nav = G.nav;
    let bv = 24, bn = null, bd = 0;
    for (let li = 0; li < I.nodes.length; li++) {
      if (ink[li] < 6) continue;
      const n = nav.nodes[I.nodes[li]], d = Math.hypot(n.x - a.pos.x, n.z - a.pos.z);
      if (d < 4.5 || d > 12 || Math.abs(n.y - a.pos.y) > 3) continue;
      let v = 0; for (const k of I.nb[li]) v += ink[k];
      if (v > bv) { bv = v; bn = n; bd = d; }
    }
    if (!bn) return null;
    const pitch = lobPitch(bd, bn.y - a.pos.y, sub.throwSpeed || 13.5);
    if (pitch === null) return null;
    this.zBomb = { yaw: Math.atan2(bn.x - a.pos.x, bn.z - a.pos.z), pitch, t: 1.1, release: false };
    return this.zBomb;
  }

  // ================================================================ Tower Command (only ever called in a tower match)
  // after respawning, when it's a long way off: a rider-to-be super jumps to a teammate riding the tower (else the one
  // nearest it); an escort to the teammate nearest the stretch 6 m ahead of it (landing where the escorting is, not on
  // its deck to walk off it again)
  _towerJump(P) {
    const a = this.a, T = P.T;
    if (Math.hypot(a.pos.x - T.pos.x, a.pos.z - T.pos.z) < 22 || Math.random() > 0.8) return;
    const ride = P.roleOf(a) === 'ride', F = ride ? T.pos : P.at(T.s + P.fwdOf(a.team) * 6);
    let best = null, bd = 14;
    for (const o of G.actors) {
      if (o === a || o.team !== a.team || !o.alive || o.superJumpState || o.hp < PLAYER.hp * 0.45) continue;
      const d = Math.hypot(o.pos.x - F.x, o.pos.z - F.z) + (P.riding(o) ? (ride ? -8 : 4) : 0);
      if (d < bd && o.pos.distanceTo(a.pos) > 18) { bd = d; best = o; }
    }
    for (const b of G.subs ? G.subs.beaconsFor(a.team) : []) {
      const d = Math.hypot(b.pos.x - F.x, b.pos.z - F.z);
      if (d < bd - 2 && b.pos.distanceTo(a.pos) > 18) { bd = d; best = b; }
    }
    const ok = best && (best.pos && best.kind === 'beacon' ? G.subs.jumpToBeacon(a, best) : a.superJump(best));
    if (ok) { this.path = null; this.goalTimer = 0; }
  }

  // per frame: a changed role re-targets straight away
  _towerSync(P) {
    const r = P.roleOf(this.a);
    if (r !== this.tRole) {
      this.tRole = r;
      this.goalTimer = 0; this.repath = 0; this.tHoldUntil = 0; this.tHoldDur = 0; this.tSideT = 0; this.tAltT = 0; this.tWaitT = 0;
      this.tBoard = null; this.tFaceT = 0; this.tNear = false; this.tBoardT = 0; this.tSwimT = 0;
    }
  }

  // take the fight? Riders: whatever's in reach of the platform (they don't chase); perches: in range or on it;
  // escorts: in range, on it, or anywhere within ~18 m of it (peeling off their slot for it; back to it after)
  _towerEngage(P) {
    const a = this.a, t = this.tv, T = P.T;
    const d = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z), range = this._range();
    const tOn = this.seeTimer > 0 && P.riding(this.target), dT = Math.hypot(t.pos.x - T.pos.x, t.pos.z - T.pos.z);
    if (this.tRole === 'ride') return d < range * 1.2 || tOn || (dT < 8 && d < range * 1.8);
    if (this.tRole === 'perch') return d < range * 1.05 || tOn;
    return d < range * 1.3 || tOn || dT < 18;
  }
  // in a fight: riders keep making for the tower (and stay on it); perches keep their spot while the foe's in range;
  // escorts don't chase a foe off the route (further from the tower than 20 m and further than we are)
  _towerFightNav(P) {
    const a = this.a, t = this.tv, T = P.T;
    if (this.tRole === 'ride') { this._towerBoardNav(P); return true; }
    const d = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
    if (this.tRole === 'perch') {
      if (d < this._range() * 1.05 && d > 3) { this.path = null; this.repath = 0.3; return true; }
      return false;
    }
    const tt = Math.hypot(t.pos.x - T.pos.x, t.pos.z - T.pos.z), st = Math.hypot(a.pos.x - T.pos.x, a.pos.z - T.pos.z);
    if (d > 4 && tt > 20 && tt > st + 2) { this.path = null; this.repath = 0.3; return true; }
    return false;
  }

  // the wall to climb on by: each of its four walls, at a few columns along it (the one in front of us first), with a
  // floor at its base 1.2 m out (a floor a hop reaches the deck from → a hop), open to it from there (not flush against
  // the stage), dry and no grate (a squid drops through) — e.g. a tower up on a hatch cover only has room on two sides,
  // and only near their middles — scored by the walk there, a column of ours on it inked to the top already, the one we
  // picked before, the front of a rolling tower (it rolls into us) and teammates climbing the same wall.
  // Returns { f, u, type, gh, inked } or null.
  _towerFacePick(P) {
    const a = this.a, T = P.T, R = TOWER.platformR, t = a.team, F = P.face(0, this._tF2), h = P._h, L = G.level;
    const rx = a.pos.x - T.pos.x, rz = a.pos.z - T.pos.z, prev = this.tBoard;
    let mx = 0, mz = 0;
    if (T.moving) { T.path.dir(T.s, _tq); mx = _tq.x * T.moving; mz = _tq.z * T.moving; }
    let best = null, bc = Infinity;
    for (let f = 0; f < 4; f++) {
      if (f === this.tBadF && this.t < this.tBadT) continue;
      P.face(f, F);
      const lat = clamp(rx * F.tx + rz * F.tz, -0.7, 0.7);
      let fb = null, fc = Infinity;
      for (const u of [prev && prev.f === f ? prev.u : lat, lat, 0, -0.55, 0.55]) {
        const sx = T.pos.x + F.nx * (R + 1.2) + F.tx * u, sz = T.pos.z + F.nz * (R + 1.2) + F.tz * u;
        const gh = L.groundHeight(sx, sz, T.top + 0.2);
        if (!Number.isFinite(gh)) continue;
        const up = T.top - gh, type = up < 1.1 ? 'hop' : gh > T.pos.y - 0.4 ? 'climb' : null;
        if (!type || this._wet(sx, sz, gh)) continue;
        if (type === 'climb') {
          // squids drop through grates: the floor we swim in over must be solid
          const mxp = T.pos.x + F.nx * (R + 0.5) + F.tx * u, mzp = T.pos.z + F.nz * (R + 0.5) + F.tz * u;
          if (L.groundHeight(sx, sz, gh + 0.1, true) < gh - 0.3 || L.groundHeight(mxp, mzp, gh + 0.1, true) < gh - 0.3) continue;
        }
        if (up > 0.5) {
          _tp.set(sx, gh + 0.45, sz); _tn.set(-F.nx, 0, -F.nz);
          if (!G.physics.raycast(_tp, _tn, 1.7, h, false).hit || h.block !== T.block.id) continue;
        }
        // (a column of ours up it already — ours, or a teammate's climb: straight up)
        const inked = type === 'climb' && P.gap(f, u, gh - T.pos.y + 0.2, t) === null;
        const c = Math.hypot(sx - a.pos.x, sz - a.pos.z) + Math.abs(gh - a.pos.y) * 2 - (inked ? 2.5 : 0) - (prev && prev.f === f && u === prev.u ? 1.5 : 0);
        if (c < fc) { fc = c; fb = { f, u, type, gh, inked }; }
      }
      if (!fb) continue;
      if (mx * F.nx + mz * F.nz > 0.7) fc += 8;
      for (const o of G.actors) if (o !== a && o.team === t && o.bot && o.alive && o.bot.tRole === 'ride' && o.bot.tBoard && o.bot.tBoard.f === f && !P.onTower(o)) fc += 1.5;
      if (fc < bc) { bc = fc; best = fb; }
    }
    return best;
  }
  // where to stand for wall B: 1.2 m out in front of its column (into out)
  _towerSpot(P, B, out) {
    const T = P.T, R = TOWER.platformR, F = P.face(B.f, this._tF2);
    return out.set(T.pos.x + F.nx * (R + 1.2) + F.tx * B.u, B.gh + 0.1, T.pos.z + F.nz * (R + 1.2) + F.tz * B.u);
  }
  _towerBadFace(f) { this.tBadF = f; this.tBadT = this.t + 5; this.tFaceT = 0; this.tBoard = null; this.tNear = false; this.tBoardT = 0; this.tSwimT = 0; }

  // a rider's route: to the spot by the wall it's climbing on by (re-picked every ~0.6 s: the tower moves, the ink
  // changes), re-planned as it moves; close to that spot no route at all (_towerMove / _towerClimb steer straight to
  // it). A long way off with one of ours on it: super jump to them. No wall to climb from anywhere near (it's up a wall
  // / over a drop / out of reach): rolling → by the stretch it rolls onto next, else wait by its route.
  _towerBoardNav(P) {
    const a = this.a, T = P.T;
    if (P.onTower(a)) { this.path = null; this.tNear = false; return; }
    if (P.climbing(a)) { this.path = null; this.tNear = true; return; }
    if (this.t >= this.tFaceT) { this.tFaceT = this.t + 0.6; this.tBoard = this._towerFacePick(P); }
    const d = Math.hypot(T.pos.x - a.pos.x, T.pos.z - a.pos.z);
    if (d > 20 && this.t >= this.tSjT && a.grounded && !(this.mode === 'fight' && this.seeTimer > 0)) {
      this.tSjT = this.t + 3;
      let mate = null;
      for (const o of G.actors) if (o !== a && o.team === a.team && !o.superJumpState && o.hp > PLAYER.hp * 0.35 && P.riding(o)) { mate = o; break; }
      if (mate && Math.random() < 0.7 && a.superJump(mate)) { this.path = null; this.goalTimer = 0; this.tNear = false; return; }
    }
    const B = this.tBoard;
    if (B) {
      const S = this._towerSpot(P, B, _v3), dS = Math.hypot(S.x - a.pos.x, S.z - a.pos.z);
      // (or in the air by its wall above that floor: popping over its top onto the deck — no route back down)
      let near = (dS < 5.5 && Math.abs(a.pos.y - B.gh) < 0.6) || (!a.grounded && a.pos.y > B.gh + 0.3 && P.edge(a.pos.x, a.pos.z) < 1.3);
      if (near && dS > 1.2) {
        if (this.t - this._tNearT >= 0.2) { this._tNearT = this.t; this._tNearV = this._fatLos(a.pos.x, a.pos.y, a.pos.z, S.x, B.gh, S.z); }
        near = this._tNearV;
      }
      this.tNear = near;
      if (near) { this.path = null; return; }
      if (this.repath > 0 && this.path && this.pi < this.path.length) return;
      if (this._pathTo(S, 0.5) || this._pathTo(T.pos, 1.0)) this.zFail = 0;
      else if (++this.zFail >= 4) { this.zFail = 0; this._wiggle(0.8); }   // no way from here (off the nav mesh): shake loose
      this.repath = 0.5 + Math.random() * 0.3;
      return;
    }
    this.tNear = false;
    if ((this.repath > 0 && this.path && this.pi < this.path.length) || this.t < this.tWaitT) return;
    if (T.moving) {
      const id = P.nodeAt(T.s + T.moving * 4), n = id >= 0 ? G.nav.nodes[id] : null;
      if (n && this._pathTo(_v3.set(n.x, n.y, n.z), 0.3)) this.zFail = 0;
      this.repath = 0.6 + Math.random() * 0.3;
      return;
    }
    const e = this._towerEscortNode(P), q = e >= 0 ? G.nav.nodes[e] : null;
    if (q) this._pathTo(_v3.set(q.x, q.y, q.z), 0.3);
    this.tWaitT = this.tHoldUntil = this.t + 1.2 + Math.random();
  }

  // escorts / perches: arrive → hold a moment → the next spot in the slot (an escort the tower's caught up with moves
  // on at once: the lead keeps 3 m ahead of it, a flank level with it, the backup no more than 1.5 m behind; the one
  // at the checkpoint holds it)
  _towerGoal(P) {
    if (this.tRole === 'ride') { this._towerBoardNav(P); return; }
    const slot = this.tRole === 'escort' ? P.slotOf(this.a) : this.tRole;
    if (slot !== this.tSlot) { this.tSlot = slot; this.goalTimer = 0; this.tHoldUntil = 0; }   // (a new slot: go now)
    const T = P.T, arrived = !this.path || this.pi >= this.path.length;
    if (arrived && this.tHoldDur > 0) { this.tHoldUntil = this.t + this.tHoldDur; this.tHoldDur = 0; }
    const lag = slot === 'lead' ? 3 : slot === 'backup' ? -0.5 : slot === 'flank' ? 0.5 : slot === 'perch' && T.owner === this.a.team ? -3 : -Infinity;
    const passed = (this.tGoalS - T.s) * P.fwdOf(this.a.team) < lag && this.t - this.tPickT > 1;
    if (this.wiggleT <= 0 && (this.goalTimer <= 0 || passed || (arrived && this.t >= this.tHoldUntil))) this._pickTowerGoal(P);
  }
  _pickTowerGoal(P) {
    this.tPickT = this.t; this.tHoldDur = 0;
    let id = -1, hold = 0;
    if (this.tRole === 'perch') { id = this._towerPerchNode(P); if (id >= 0) { hold = 3 + Math.random() * 3; this.goalTimer = 10; } }
    if (id < 0) {
      id = this._towerEscortNode(P);
      const cp = this.tSlot === 'cp';
      hold = cp ? 2 + Math.random() * 2 : 0.3 + Math.random() * 0.6; this.goalTimer = cp ? 7 : 4 + Math.random() * 2;
    }
    if (id < 0) { this._pickPaintGoal(); return; }
    const n = G.nav.nodes[id];
    if (this._pathTo(_v3.set(n.x, n.y, n.z), 0.3)) { this.tHoldDur = hold; this.zFail = 0; }
    else if (++this.zFail >= 3) { this.zFail = 0; this._wiggle(0.8); }
  }
  // a spot on the ground for our escort slot, along the way the tower's heading (P.fwdOf): `cp` round the next
  // checkpoint's pad (up to 4 m past it), `lead` on / by the route 6–14 m ahead, `flank` 1–7 m ahead and 3–7 m off to
  // the side, `backup` 0–3 m ahead and 2–4 m off it at its floor's height. Never under the platform or in front of it
  // where it rolls, never by their spawn; unclaimed / enemy ink first (the lead above all: it inks the way), apart
  // from the other escorts. (A perch with nowhere to perch, a rider waiting by an unreachable tower: flank.)
  _towerEscortNode(P) {
    const a = this.a, nav = G.nav, T = P.T, ep = G.level.spawnPads[1 - a.team];
    const slot = this.tRole === 'escort' ? P.slotOf(a) : 'flank', fwd = P.fwdOf(a.team);
    const mates = G.actors.filter((o) => o !== a && o.team === a.team && o.bot && o.alive && o.bot.goal >= 0);
    const e = T.path.dir(T.s, _v2), ex = e.x * fwd, ez = e.z * fwd;                  // the way it's heading here
    const bk = slot === 'backup', cp = slot === 'cp' ? P.cpAhead(a.team) : null, lead = slot === 'lead';
    let best = -1, bs = -Infinity, bS = T.s;
    for (let k = 0; k < 16; k++) {
      const s = cp ? cp.s + fwd * (-1 + Math.random() * 5) : T.s + fwd * (bk ? 0.5 + Math.random() * 3.5 : lead ? 6 + Math.random() * 8 : 1 + Math.random() * 6);
      const p = P.at(s);
      // off to the side of the track there (square to it: the backup / flanks level with that point, not behind it)
      const q = T.path.dir(s, _v3), sd = Math.random() < 0.5 ? -1 : 1;
      const r = cp ? (Math.random() * 2 - 1) * 4 : bk ? sd * (2.2 + Math.random() * 1.8) : lead ? (Math.random() * 2 - 1) * 3 : sd * (3 + Math.random() * 4);
      const id = nav.nearest(_v.set(p.x - q.z * r, p.y + 0.3, p.z + q.x * r), 1.0);
      if (id < 0) continue;
      const n = nav.nodes[id];
      if (n.zone >= 0 || n.wet === 2 || Math.abs(n.y - p.y) > 2 || Math.hypot(n.x - p.x, n.z - p.z) > 7.5 || Math.hypot(n.x - ep.x, n.z - ep.z) < 10) continue;
      const rx = n.x - T.pos.x, rz = n.z - T.pos.z, along = rx * ex + rz * ez, side = Math.abs(rx * ez - rz * ex);
      if (Math.hypot(rx, rz) < 2.8 || (along > -1 && along < 4.5 && side < 1.9)) continue;
      // (the spot itself — not just the point it was looked for by — in the slot's stretch of track: the nearest node
      // can be back round a corner)
      const J = P.proj(n.x, n.y, n.z, T.s, this._tJ || (this._tJ = {})), ja = (J.s - T.s) * fwd;
      const out = cp ? Math.abs(J.s - cp.s) > 6 : bk ? ja < -0.5 || ja > 5 : lead ? ja < 4 || ja > 16 : ja < 0 || ja > 9;
      const st = G.paint.regionStats(n.x, n.y, n.z, 2.5, a.team, _stats);
      const off = J.off;                                                               // (off the route)
      let sc = (st.n ? st.empty + st.enemy * 1.4 : 0) * (lead ? 4 : 2.5) - Math.hypot(n.x - a.pos.x, n.z - a.pos.z) * 0.05 + Math.random() - (n.wet ? 1.5 : 0)
        - (bk ? Math.abs(Math.hypot(rx, rz) - 3.2) + (Math.abs(n.y - T.pos.y) > 0.5 ? 2 : 0) : 0) - (lead ? off * 0.3 : 0) - (out ? 8 : 0);   // (outside it: a last resort)
      for (const m of mates) { const g = nav.nodes[m.bot.goal]; if (Math.hypot(g.x - n.x, g.z - n.z) < 3.5) sc -= 2; }
      if (sc > bs) { bs = sc; best = id; bS = J.s; }
    }
    this.tGoalS = bS;
    return best;
  }
  // long range: a spot 6 m – ~0.85 × range from the tower (ours: from the route 8 m ahead of it, off to its side;
  // theirs / neutral: on our side of it), a little above it if possible, with a sightline to it
  _towerPerchNode(P) {
    const a = this.a, nav = G.nav, T = P.T, dir = P.dirOf(a.team), range = this._range(), ours = T.owner === a.team;
    const F = ours ? P.at(T.s + dir * 8) : T.pos;
    const e = T.path.dir(T.s, _v2), ex = e.x * dir, ez = e.z * dir;                  // our push direction there
    const mates = G.actors.filter((o) => o !== a && o.team === a.team && o.bot && o.alive && o.bot.goal >= 0);
    const dMax = Math.min(range * 0.85, 22), dMin = Math.min(6, dMax - 2), cands = [];
    for (let k = 0; k < 160; k++) {
      const id = nav.validIds[(Math.random() * nav.validIds.length) | 0], n = nav.nodes[id];
      const dx = n.x - F.x, dz = n.z - F.z, d = Math.hypot(dx, dz);
      if (d < dMin || d > dMax || n.zone >= 0 || n.wet === 2) continue;
      const side = (dx * ex + dz * ez) / Math.max(d, 1);
      // (ours: off to the side of the route ahead — not trailing it; theirs / neutral: on our side of it)
      let sc = clamp(n.y - F.y, -2, 4) * 1.1 - (ours ? Math.abs(side) * 1.4 : side * 1.6) - Math.abs(d - range * 0.6) * 0.1 - Math.hypot(n.x - a.pos.x, n.z - a.pos.z) * 0.04 + Math.random() * 1.2 - (n.wet ? 1.5 : 0);
      for (const m of mates) { const g = nav.nodes[m.bot.goal]; if (Math.hypot(g.x - n.x, g.z - n.z) < 5) sc -= 4; }
      cands.push([sc, id]);
    }
    cands.sort((x, y) => y[0] - x[0]);
    const fx = F.x, fy = F.y + 1.2, fz = F.z;
    for (let k = 0; k < Math.min(6, cands.length); k++) {
      const n = nav.nodes[cands[k][1]];
      if (!G.physics.los(_v.set(n.x, n.y + 1.4, n.z), _v2.set(fx, fy, fz))) continue;
      this.tGoalS = T.s + dir * ((n.x - T.pos.x) * ex + (n.z - T.pos.z) * ez);   // (how far along the track it stands: _towerGoal)
      return cands[k][1];
    }
    return -1;
  }

  // paint-mode aim: where a thrown special should land (a moment, turning to it), else a rider inks the route 5–8 m
  // ahead of the tower, and escorts / perches the nearest patch of the route ahead of it (2–14 m) that isn't ours yet,
  // in their reach (melee kits ink it walking it: the lead's spots are on it)
  _towerAim(P, dt, onT, melee) {
    const a = this.a;
    if (this.tFace > 0) { this.tFace -= dt; const f = this.tFaceP; return { x: f.x, y: f.y, z: f.z, d: Math.hypot(f.x - a.pos.x, f.z - a.pos.z) }; }
    if (melee) return null;
    if (onT) {
      if (this.tRole !== 'ride') return null;
      const p = P.at(P.T.s + P.dirOf(a.team) * (6.5 + Math.sin(this.sweep * 0.37) * 1.5));
      return { x: p.x, y: p.y, z: p.z, d: Math.hypot(p.x - a.pos.x, p.z - a.pos.z) };
    }
    if (this.tRole === 'ride') return null;
    if ((this.tRAimT -= dt) <= 0) {
      this.tRAimT = 0.4 + Math.random() * 0.2; this.tRAim = null;
      const reach = Math.min(this._range() * 1.1, 16), fwd = P.fwdOf(a.team);
      for (let k = 1; k <= 7; k++) {
        const p = P.at(P.T.s + fwd * k * 2), d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
        if (d > reach || d < 1.5 || Math.abs(p.y - a.pos.y) > 3) continue;
        const st = G.paint.regionStats(p.x, p.y, p.z, 1.3, a.team, _stats);
        if (st.n && st.own < 0.7) { this.tRAim = (this._tRAimV || (this._tRAimV = new THREE.Vector3())).set(p.x, p.y, p.z); break; }
      }
    }
    const q = this.tRAim;
    return q ? { x: q.x, y: q.y, z: q.z, d: Math.hypot(q.x - a.pos.x, q.z - a.pos.z) } : null;
  }
  // specials round the tower: foes on / by it and us near it (cover our riders, break theirs, take it back). Thrown
  // ones go where we look: from the platform at the nearest foe by it, from off it onto the tower.
  _towerSpecial(P, fighting, onT) {
    const a = this.a, T = P.T;
    if (Math.hypot(T.pos.x - a.pos.x, T.pos.z - a.pos.z) > 16 || !this._towerSpecialOk(onT)) return false;
    let foes = 0, fd = Infinity;   // (foes the team knows are by it: seen, located or seen there lately)
    for (const o of G.actors) {
      if (o.team === a.team || !o.alive) continue;
      const k = teamKnown(a.team, o, 3), p = k && k.pos;
      if (!p || Math.hypot(p.x - T.pos.x, p.z - T.pos.z) > 11) continue;
      foes++;
      const md = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
      if (md < fd) { fd = md; if (onT) this.tFaceP.set(p.x, p.y, p.z); }
    }
    if (!foes) return false;
    const id = SPECIALS[a.specialId]?.kind || a.specialId;
    const thrown = id === 'storm' || id === 'barrage' || id === 'booyah' || id === 'zooka' || id === 'wail' || id === 'blower';
    if (thrown && !fighting) {
      if (!onT) this.tFaceP.set(T.pos.x, T.top, T.pos.z);
      const f = this.tFaceP;
      if (Math.abs(angleDiff(this.aimYaw, Math.atan2(f.x - a.pos.x, f.z - a.pos.z))) > 0.6) { this.tFace = 0.8; return false; }
    }
    return Math.random() < (fighting ? 0.03 : 0.08);
  }
  // a rider on the platform never starts a special that carries the body off it
  _towerSpecialOk(onT) {
    return !(onT && BODY_SP[SPECIALS[this.a.specialId]?.kind || this.a.specialId]);
  }
  // a thrown sub onto their riders on the platform, in lobbing range (looked for twice a second); returns the aim to
  // hold ({ yaw, pitch, release }) while it's thrown
  _towerBombAim(P, dt, onT) {
    if (this.tBomb) { this.tBomb.t -= dt; if (this.tBomb.t <= 0) this.tBomb = null; return this.tBomb; }
    this.tBombScan -= dt;
    const a = this.a, sub = a.sub || SUB.bomb, T = P.T;
    if (this.tBombScan > 0 || this.bombCd > 0 || onT || !THROWN[sub.kind] || a.ink < sub.inkCost + 10) return null;
    if (SUB_KITS[sub.kind]?.blocked?.(a, sub)) return null;
    this.tBombScan = 0.5;
    if (!this._foeOnTower(P)) return null;
    // (where it'll be when the bomb comes down: it rolls on meanwhile)
    const p = T.path.at(T.s + (T.moving ? T.moving * T.speed[T.moving > 0 ? 0 : 1] * 1.3 : 0), _v);
    const d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
    if (d < 4.5 || d > 12 || Math.abs(T.top - a.pos.y) > 3.5) return null;
    const pitch = lobPitch(d, T.top - a.pos.y, sub.throwSpeed || 13.5);
    if (pitch === null) return null;
    this.tBomb = { yaw: Math.atan2(p.x - a.pos.x, p.z - a.pos.z), pitch, t: 1.1, release: false };
    return this.tBomb;
  }
  // one of theirs on the platform, as far as the team knows (seen / located there within the last 1.5 s)
  _foeOnTower(P) {
    const T = P.T, t = this.a.team;
    for (const e of G.actors) {
      if (e.team === t || !e.alive) continue;
      const k = teamKnown(t, e, 1.5);
      if (k && Math.abs(k.pos.y - T.top) < 0.9 && P.edge(k.pos.x, k.pos.z) < 0.3) return true;
    }
    return false;
  }
  _towerBombGo(tb) {
    if (tb.release) { this.tBomb = null; return; }
    if (Math.abs(angleDiff(this.aimYaw, tb.yaw)) < 0.09 && Math.abs(this.aimPitch - tb.pitch) < 0.09) { this._bombAim = true; tb.release = true; this.bombCd = 4 + Math.random() * 3; }
  }

  // our way runs into the platform's side where a hop won't clear it (it's up on steps / a box above our floor, and the
  // nav graph doesn't know it's there): slide round its edge — the way round nearer where we were heading, kept a moment
  _towerSkirt(move, dx, dz, d, up) {
    const ml = Math.hypot(move.x, move.z);
    if (up < 1.2 || up > 3.5 || d < 0.2 || ml < 0.3 || (move.x * dx + move.z * dz) / (ml * d) < 0.3) return;
    let tx = -dz / d, tz = dx / d;
    if (this.t - (this.tSkirtT ?? -9) > 1) this.tSkirtSg = tx * move.x + tz * move.z >= 0 ? 1 : -1;
    this.tSkirtT = this.t;
    tx *= this.tSkirtSg; tz *= this.tSkirtSg;
    move.set(tx * 0.95 - (dx / d) * 0.3, 0, tz * 0.95 - (dz / d) * 0.3);
    this.noProg = 0; this.bestD = Infinity;
  }

  // one of theirs getting on: swimming up its wall, or at its foot inking it
  _towerBoarder(P) {
    const T = P.T, t = this.a.team;
    for (const e of G.actors) {
      if (e.team === t || !e.alive || e.superJumpState) continue;
      if (P.climbing(e) || (P.edge(e.pos.x, e.pos.z) < 1.3 && e.pos.y < T.top - 0.2 && e.pos.y > T.pos.y - 0.5)) return e;
    }
    return null;
  }
  // a rider inking its deck: the nearest spot of it within ~1.1 m (under us first) that isn't our ink — looked for 3× a
  // second — shot at in the weapon's own rhythm; returns the aim ({ yaw, pitch, dist }) or null (all ours)
  _towerDeckInk(P, dt, it) {
    const a = this.a, T = P.T, D = this.tDeck || (this.tDeck = new THREE.Vector3());
    if ((this.tDeckT -= dt) <= 0) {
      this.tDeckT = 0.3;
      let bd = Infinity; D.y = NaN;
      const c = Math.cos(T.yaw), sn = Math.sin(T.yaw), r = TOWER.platformR - 0.45;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const lx = (i / 2) * r, lz = (j / 2) * r;
        if (Math.abs(lx) < 0.35 && Math.abs(lz) < 0.35) continue;                    // (the pillar)
        _tp.set(T.pos.x + lx * c + lz * sn, T.top, T.pos.z - lx * sn + lz * c);
        const d = Math.hypot(_tp.x - a.pos.x, _tp.z - a.pos.z);
        if (d > 1.1 || d >= bd || T.paint.groundTeam(_tp) === a.team + 1) continue;
        bd = d; D.copy(_tp);
      }
    }
    if (!Number.isFinite(D.y)) return null;
    const w = a.weapon, wr = a.weaponRunner;
    if (CHARGES[w.kind]) it.fire = wr.burstT <= 0 && !wr.streaming && !(wr.charging && wr.charge >= 0.45);
    else if (MELEE[w.kind]) { this.tPress = !this.tPress; it.fire = this.tPress; }
    else it.fire = true;
    it.squid = false;
    const hd = Math.max(0.35, Math.hypot(D.x - a.pos.x, D.z - a.pos.z)), dy = D.y + 0.02 - (a.pos.y + 1.1);
    return { yaw: Math.atan2(D.x - a.pos.x, D.z - a.pos.z), pitch: Math.atan2(dy, hd), dist: Math.hypot(hd, dy) };
  }

  // per frame, after the mode's own footwork: a rider on the platform holds its middle (the engine carries it) and
  // stays put — no hops, rolls or dodges off the edge — swimming in our ink on its deck to refill when dry; a rider
  // by it gets on at the wall it picked (_towerClimb: ink a column, swim up; or a hop from a floor that reaches it).
  // Anyone else on it walks off its edge the way they're going (escorting now), and anyone whose way runs into its
  // side hops onto it (a low step) or slides round it. Returns the aim to hold while inking its wall, else null.
  _towerMove(P, dt, move, it, thrAim, onT) {
    const a = this.a, T = P.T;
    if (this.tDry) it.fire = false;                                   // on it and out of ink: hold fire, let the tank fill
    const sp = a.specialActive;
    if (sp && BODY_SP[sp.kind || sp.id]) return null;                 // a ride / transformation drives the body
    const dx = T.pos.x - a.pos.x, dz = T.pos.z - a.pos.z, d = Math.hypot(dx, dz), up = T.top - a.pos.y;
    const settle = () => { this.wiggleT = 0; this._needJump = false; this.noProg = 0; this.dispT = 0; this.moveAcc = 0; this.snap.copy(a.pos); };
    if (this.tRole !== 'ride' || this.mode === 'refill' || this.mode === 'retreat') {
      this.tNear = false; this.tBoardT = 0;
      if (onT) {
        // off it: toward where we're going (the route's end, else the foe, else ahead), round the pillar, off the edge
        let gx = 0, gz = 0;
        const g = this.path && this.path.length ? G.nav.nodes[this.path[this.path.length - 1]] : null;
        if (g) { gx = g.x - T.pos.x; gz = g.z - T.pos.z; }
        else if (this.tv) { gx = this.tv.pos.x - T.pos.x; gz = this.tv.pos.z - T.pos.z; }
        if (Math.hypot(gx, gz) < 0.5) { T.path.dir(T.s, _tq); gx = _tq.x * P.dirOf(a.team); gz = _tq.z * P.dirOf(a.team); }
        let gl = Math.hypot(gx, gz) || 1; gx /= gl; gz /= gl;
        const rx = -dx, rz = -dz;                                        // (us from its centre)
        if (rx * gx + rz * gz < 0 && Math.abs(rx * gz - rz * gx) < 0.6) {  // the pillar's in the way: round it first
          const sg = rx * gz - rz * gx >= 0 ? 1 : -1; const tx = gz * sg, tz = -gx * sg; gx = tx; gz = tz;
        }
        const ex = T.pos.x + gx * (TOWER.platformR + 1) - a.pos.x, ez = T.pos.z + gz * (TOWER.platformR + 1) - a.pos.z;
        gl = Math.hypot(ex, ez) || 1;
        move.set(ex / gl, 0, ez / gl);
        it.squid = false; it.jump = false;
        settle();
        return null;
      }
      if (a.grounded && up > 0.3 && P.edge(a.pos.x, a.pos.z) < 0.7) {
        const ml = Math.hypot(move.x, move.z);
        if (up < 1.2) { if (this.jumpCd <= 0 && ml > 0.3 && (move.x * dx + move.z * dz) / (ml * (d || 1)) > 0.5) { it.jump = true; it.fire = false; this.jumpCd = 0.8; } }
        else this._towerSkirt(move, dx, dz, d, up);
      }
      return null;
    }
    if (onT) {
      this.tBoardT = 0; this.tNear = false;
      // a spot beside the pillar in its middle (it's cover): in a duel behind it from the foe, stepping out past its
      // edge to shoot (a still rider is an easy shot); otherwise stay where we are round it
      const R0 = TOWER.pillarW / 2 + PLAYER.radius + 0.18;
      const tg = this.mode === 'fight' && this.tv;
      let ux = a.pos.x - T.pos.x, uz = a.pos.z - T.pos.z;
      if (tg) {
        const fx = tg.pos.x - T.pos.x, fz = tg.pos.z - T.pos.z, fl = Math.hypot(fx, fz) || 1, o = this.strafeS * 1.1;
        ux = (-fx / fl) * 0.55 + (-fz / fl) * o; uz = (-fz / fl) * 0.55 + (fx / fl) * o;
      }
      const ul = Math.hypot(ux, uz);
      if (ul < 1e-3) { ux = 1; uz = 0; }
      const gx = T.pos.x + (ux / (ul || 1)) * R0 - a.pos.x, gz = T.pos.z + (uz / (ul || 1)) * R0 - a.pos.z;
      const gl = Math.hypot(gx, gz), k = gl > 0.2 ? Math.min(1, (gl - 0.1) / 0.7) : 0;
      if (k > 0) move.set((gx / gl) * k, 0, (gz / gl) * k); else move.set(0, 0, 0);
      // on it but not counted (a prop in the way at its edge holds us off the middle): slide along it, then the other way
      if (!P.riding(a) && P.edge(a.pos.x, a.pos.z) > -0.12) {
        this.tOffT = (this.tOffT || 0) + dt;
        if (this.tOffT > 0.4) {
          const sg = (((this.tOffT - 0.4) / 1.2) | 0) % 2 ? -1 : 1, l = d || 1;
          move.set((dx / l) * 0.35 - (dz / l) * sg, 0, (dz / l) * 0.35 + (dx / l) * sg);
        }
      } else this.tOffT = 0;
      // in our ink on its deck (a rider under in it still rides): escorted, stay under it — dodging, healing 3× as fast,
      // refilling — and come up to shoot when there's a foe in range or one of theirs climbing on and we're fit for it
      // (up a moment at least, then under again); full steam, stay up inking and shooting, under only when hurt or dry
      const hp = a.hp / PLAYER.hp, ink = a.ink / PLAYER.inkMax, tgt = this.target;
      const seen = this.mode === 'fight' && tgt && this.seeTimer > 0;
      const shot = seen && Math.hypot(tgt.pos.x - a.pos.x, tgt.pos.z - a.pos.z) < this._range() * 1.1;
      let hide;
      if (!P.steam[a.team]) {
        const fit = hp >= 0.3 && !this.tDry && ink >= 0.06;
        if (fit && (shot || this._towerBoarder(P))) this.tUpT = this.t + 0.8;
        hide = !fit || this.t >= this.tUpT;
      } else hide = this.tDry || hp < 0.5 || (this.tHide && hp < 0.85) || (!seen && (hp < 0.9 || ink < 0.5));
      this.tHide = a.groundTeam === 1 && hide;
      it.squid = this.tHide;
      if (it.squid) { it.fire = false; it.sub = false; this._bombAim = false; move.set(0, 0, 0); }   // (a swim would carry us off its small deck)
      it.jump = false; this.tSideT = 0; this.tAltT = 0;
      settle();
      // the deck kept inked: no shot to take and its deck by us bare / theirs → ink it (to hide in, and refill)
      return !it.squid && !shot && ink > 0.05 && !this.tDry ? this._towerDeckInk(P, dt, it) : null;
    }
    if (thrAim && this.thrAct === 'evade') return null;               // a device about to go off on us: dodge that first
    const B = this.tBoard;
    if (!B || !this.tNear) {
      this.tBoardT = 0; this.tSwimT = 0;
      // still walking up: keep to the route (a duel's footwork would stall us short of it)
      if (this.mode === 'fight' && this._tMv.lengthSq() > 0.01) move.copy(this._tMv);
      if (a.grounded && P.edge(a.pos.x, a.pos.z) < 0.7) this._towerSkirt(move, dx, dz, d, up);
      // none of ours on it: hurry — swim through our own ink, and no painting on the way (it slows the walk) unless it's
      // their ink ahead
      if (this.mode === 'paint' && this.path && T.riders[a.team] === 0) {
        if ((this.tInkT = (this.tInkT || 0) - dt) <= 0) {
          this.tInkT = 0.3;
          const st = G.paint.regionStats(a.pos.x + move.x * 2, a.pos.y, a.pos.z + move.z * 2, 1.4, a.team, _stats);
          this.tInkAhead = st.n ? st.enemy : 0;
        }
        if (a.groundTeam === 1 && !this._squidWouldDrop(move)) { it.squid = true; it.fire = false; }
        else if (this.tInkAhead < 0.3) it.fire = false;
      }
      this.tSideT = 0;
      return null;
    }
    // a foe close by in our sights while it doesn't need us on it this second (held with one of ours on it, or theirs
    // / contested): the duel first — shoot their riders off from below — not once we're swimming up it
    const tg = this.target;
    if (this.mode === 'fight' && tg && this.seeTimer > 0 && !P.climbing(a) && this.tSwimT <= 0) {
      const urgent = T.riders[a.team] === 0 && (T.owner === a.team || (T.owner < 0 && T.riders[1 - a.team] === 0));
      if (!urgent && Math.hypot(tg.pos.x - a.pos.x, tg.pos.z - a.pos.z) < this._range() * 0.8) { this.tBoardT = Math.max(0, this.tBoardT - dt); return null; }
    }
    if (B.type === 'hop') { this._towerHop(P, dt, move, it); return null; }
    return this._towerClimb(P, B, dt, move, it);
  }

  // on from a floor a hop reaches its deck from: straight at its centre (via a spot off another side while coming
  // round), hop when the edge is close; pressed against its side too long (a rider in the way, a bad corner) → round
  // to another side first
  _towerHop(P, dt, move, it) {
    const a = this.a, T = P.T;
    const dx = T.pos.x - a.pos.x, dz = T.pos.z - a.pos.z, d = Math.hypot(dx, dz), up = T.top - a.pos.y;
    it.squid = false;
    let gx = dx, gz = dz;
    if (this.tAltT > 0) {
      this.tAltT -= dt;
      gx = T.pos.x + this.tAlt.x - a.pos.x; gz = T.pos.z + this.tAlt.z - a.pos.z;
      if (Math.hypot(gx, gz) < 0.45) { this.tAltT = 0; gx = dx; gz = dz; }
    }
    const gl = Math.hypot(gx, gz) || 1, edge = P.edge(a.pos.x, a.pos.z);
    move.set(gx / gl, 0, gz / gl);
    // under its edge (it came down a drop onto our floor, or rolled over us from a step below): out from under first
    if (edge < 0.05 && a.pos.y < T.top - 0.5) {
      if (d > 0.2) move.set(-dx / d, 0, -dz / d); else T.path.dir(T.s, move);
    } else if (a.grounded && up > 0.3) {
      // (the trigger let go for the hop: jump + fire + move is a dodge roll with twins / dualies)
      if (this.tAltT <= 0 && edge < 0.9 && this.jumpCd <= 0) { it.jump = true; it.fire = false; this.jumpCd = 0.5; }
      if (edge < 0.6) this.tSideT += dt;
      if (this.tSideT > 1.6) {
        // come round: a spot 2.5 m out, 70° round from where we stand (whichever way is open floor at our level)
        this.tSideT = 0;
        const b0 = Math.atan2(-dx, -dz), sg0 = Math.random() < 0.5 ? 1 : -1;
        for (const sg of [sg0, -sg0]) {
          const b = b0 + sg * 1.22, px = T.pos.x + Math.sin(b) * 2.5, pz = T.pos.z + Math.cos(b) * 2.5;
          if (Math.abs(G.level.groundHeight(px, pz, a.pos.y + 0.5) - a.pos.y) > 0.5 || !this._dryLine(a.pos.x, a.pos.y, a.pos.z, px, pz)) continue;
          this.tAlt.set(px - T.pos.x, 0, pz - T.pos.z); this.tAltT = 1.4;
          break;
        }
      }
    }
    this.tBoardT += dt;
    if (this.tBoardT > 8) this._towerBadFace(this.tBoard.f);
    this.wiggleT = 0; this._needJump = false; this.noProg = 0; this.dispT = 0; this.moveAcc = 0; this.snap.copy(a.pos);
  }

  // on up its wall (B: the wall picked, its column at B.u): stand 1.2 m out in front of the column and ink its lowest
  // bare / enemy patch (the weapon's own rhythm: charge-and-release, press-and-release flicks / cuts / punches, or a
  // steady stream), working up to the top; then turn squid and swim straight in — the actor climbs it and pops over
  // its top onto the deck (the engine carries a climber along with a rolling tower). Stalled on it (a gap in the ink:
  // theirs painted over it) → let go and ink it again; not taking → back off a moment; no good at this wall (9 s) →
  // another wall. Returns the aim to hold while inking, else null.
  _towerClimb(P, B, dt, move, it) {
    const a = this.a, T = P.T, R = TOWER.platformR, F = P.face(B.f, this._tF);
    const rx = a.pos.x - T.pos.x, rz = a.pos.z - T.pos.z, lat = rx * F.tx + rz * F.tz, out = rx * F.nx + rz * F.nz - R;
    const settle = () => { this.wiggleT = 0; this._needJump = false; this.noProg = 0; this.dispT = 0; this.moveAcc = 0; this.snap.copy(a.pos); };
    this.tBoardT += dt;
    if (this.tBoardT > 9) { this._towerBadFace(B.f); return null; }
    if (P.climbing(a)) {
      it.squid = true; it.fire = false; it.jump = false; it.sub = false; this._bombAim = false;   // (a throw would turn us kid: off the wall)
      move.set(-a.wallN.x, 0, -a.wallN.z);
      this.tStallT = a.vel.y < 0.5 ? this.tStallT + dt : 0;
      if (this.tStallT > 0.4) { it.squid = false; this.tLetGo = this.t + 0.5; this.tStallT = 0; }
      settle();
      return null;
    }
    this.tStallT = 0;
    // popping over its top: on in over the deck (steering back out to our spot would drop us off it again)
    if (!a.grounded && a.pos.y > B.gh + 0.3 && out < 1.3) {
      it.squid = false; it.fire = false; it.jump = false; it.sub = false; this._bombAim = false;
      move.set(-F.nx, 0, -F.nz);
      settle();
      return null;
    }
    const cu = clamp(lat, -R + 0.35, R - 0.35);
    const inPos = out > 0.45 && out < 2.1 && Math.abs(lat - B.u) < 0.5 && Math.abs(a.pos.y - B.gh) < 0.5;
    const gap = inPos ? P.gap(B.f, cu, a.pos.y - T.pos.y + 0.2, a.team) : 0;
    if (inPos && gap === null && this.t >= this.tLetGo) {
      // ours to the top: squid, straight in
      it.squid = true; it.fire = false; it.jump = false; it.sub = false; this._bombAim = false;
      move.set(-F.nx, 0, -F.nz);
      if ((this.tSwimT += dt) > 1.8) { this.tSwimT = 0; this.tLetGo = this.t + 0.8; }
      settle();
      return null;
    }
    this.tSwimT = 0;
    it.squid = false; it.fire = false;
    // in front of the column (keeping up with it while it rolls)
    const gx = T.pos.x + F.nx * (R + 1.2) + F.tx * B.u - a.pos.x, gz = T.pos.z + F.nz * (R + 1.2) + F.tz * B.u - a.pos.z, gl = Math.hypot(gx, gz);
    if (gl > 0.2) { const k = Math.min(1, gl / 0.8 + 0.2); move.set((gx / gl) * k, 0, (gz / gl) * k); } else move.set(0, 0, 0);
    settle();
    if (!inPos || gap === null || a.ink < PLAYER.inkMax * 0.04) return null;
    const w = a.weapon, wr = a.weaponRunner;
    if (CHARGES[w.kind]) it.fire = wr.burstT <= 0 && !wr.streaming && !(wr.charging && wr.charge >= 0.45);
    else if (MELEE[w.kind]) { this.tPress = !this.tPress; it.fire = this.tPress; }
    else it.fire = true;
    const px = T.pos.x + F.nx * R + F.tx * cu, pz = T.pos.z + F.nz * R + F.tz * cu, py = T.pos.y + gap + 0.15;
    const hd = Math.max(0.4, Math.hypot(px - a.pos.x, pz - a.pos.z)), dy = py - (a.pos.y + 1.1);
    return { yaw: Math.atan2(px - a.pos.x, pz - a.pos.z), pitch: Math.atan2(dy, hd), dist: Math.hypot(hd, dy) };
  }

  // ============================================================================================ threats
  // Enemy devices that hunt a player — Waddle Bombs (walk after a foe along the nav graph at 4 m/s, give up after ~9 s /
  // 26 m) and Tide Torpedoes (lock on in mid-air, hover, then home in gently) — and enemy Brolly canopies (a held one
  // blocks shots; a launched one is a sliding wall that blocks players too). The kits list them through
  // SUB_KITS[k].threats(out) / MAIN_KITS[k].shields(out) (kits/registry.js), scanned a few times a second.
  // A bot notices a device hunting it after its reaction time, then shoots it down when it has a line on it and the
  // reach (Waddle 30 hp, Torpedo 20; melee kits flick / swipe / cut / punch at one in their window), else evades: kites a
  // Waddle (a running kid outruns it), swims off through its own ink, steps out of a hovering Torpedo's sight,
  // sidesteps + hops a launched one late. A duel with an enemy player close by keeps priority unless the device is
  // about to arrive (the bot edges away from it meanwhile); far-off devices, or ones after someone else, are left alone.
  // Launched canopies across our way: steer round the nearer edge, or shoot apart one that boxes us in. A shield between
  // us and our target: flank round it, hold the shots unless it's nearly broken, lob a sub over it.
  _threatScan() {
    const a = this.a, L = _thrList, S = this._shl;
    L.length = 0; S.length = 0;
    for (const k in SUB_KITS) SUB_KITS[k].threats?.(L);
    for (const k in MAIN_KITS) MAIN_KITS[k].shields?.(S);
    for (let i = S.length - 1; i >= 0; i--) if (S[i].team === a.team) { S[i] = S[S.length - 1]; S.pop(); }
    let best = null, bs = 0.2;
    for (const d of L) {
      if (d.team === a.team || !d.live) continue;
      const s = this._threatScore(d);
      if (s > bs) { bs = s; best = d; }
    }
    L.length = 0;
    const mem = this._thrMem;
    for (const d of mem.keys()) if (!d.live) mem.delete(d);
    // a new one is acted on only after our reaction time (it beeps / shows its lock ring: no sight line needed)
    if (best && !mem.has(best)) { mem.set(best, G.time + this.diff.reaction * (0.8 + Math.random() * 0.7) + 0.05); THREAT_STATS.noticed++; }
    this.thrCand = best;
  }
  // how much a device matters to us right now: 0 = not at all; ~1.5+ outranks a duel in weapon range, 2.4+ one up close
  _threatScore(d) {
    const a = this.a, dx = d.pos.x - a.pos.x, dz = d.pos.z - a.pos.z, dh = Math.hypot(dx, dz);
    const dy = d.pos.y + d.aimY - (a.pos.y + 0.8);
    if (dh > 18 || Math.abs(dy) > 6) return 0;
    const st = d.state, mine = d.target === a;
    if (st === 'fly') {
      // still in the air after the throw: a human sees it coming, so it's noticed now (the reaction time runs during its
      // flight) — a walker coming down within its sensing circle of us (it'll lock on), a flyer heading our way
      const v = d.vel;
      if (d.ground) {
        const t = (v.y + Math.sqrt(Math.max(0, v.y * v.y + 48 * (d.pos.y - a.pos.y)))) / 24;
        return Math.hypot(d.pos.x + v.x * t - a.pos.x, d.pos.z + v.z * t - a.pos.z) < (d.senseRadius || 7) + 1 ? 0.6 : 0;
      }
      return dh < (d.lockRange || 6.5) + 3 && dx * v.x + dz * v.z < 0 ? 0.5 : 0;
    }
    if (!d.ground) {
      // flyers (Torpedo): hovering on us before its launch, or darting at us (or past us close enough to catch the burst)
      if (st === 'unfold') return mine ? 3 : dh < d.radius ? 0.8 : 0;
      if (st !== 'launch') return 0;
      const v = d.vel, sp = Math.max(2, v.length()), d3 = Math.hypot(dh, dy);
      if (mine) return 4 / (0.25 + d3 / Math.max(6, sp));   // (it's only just pushing off: it'll be quick)
      const tca = -(dx * v.x + dy * v.y + dz * v.z) / (sp * sp);
      if (tca > 0 && tca < 1.2) { const mx = -dx - v.x * tca, my = -dy - v.y * tca, mz = -dz - v.z * tca; if (mx * mx + my * my + mz * mz < 1.6) return 2; }
      return d3 < d.radius ? 0.8 : 0;
    }
    // walkers (Waddle): sitting on its sensing circle with us (nearly) inside, or walking after us / our way
    if (st === 'sense') return dh < (d.senseRadius || 7) + 0.6 ? 0.7 : 0;
    if (!d.locked) return 0;
    const eta = Math.max(0, dh - (d.trigger || 1.2)) / (d.speed || 4);
    if (mine) return (4 / (0.5 + eta)) * (d.left !== undefined && d.left < eta * 0.8 ? 0.3 : 1);   // (gives up before it gets here)
    if (dh < d.radius + 0.8) return 1.7;                                   // after a teammate, right by us: its blast gets us too
    const v = d.vel, vl = Math.hypot(v.x, v.z);
    if (dh < 9 && vl > 0.5 && -(dx * v.x + dz * v.z) / (dh * vl) > 0.8) return 1.2 / (0.5 + eta);
    return 0;
  }
  // per frame, after the mode's own actions: deal with the device we've noticed (aim + trigger + move). Returns the aim
  // to hold (_thrAim, shared) or null to leave the frame as it is.
  _threatCtl(dt, it, move) {
    if (!THREAT_AI.enabled) return null;
    const a = this.a;
    if ((this.thrScanT -= dt) <= 0) { this.thrScanT = 0.2 + Math.random() * 0.1; this._threatScan(); }
    let d = this.thr;
    if (d && !d.live) { this._thrEnd(true); d = null; }
    const c = this.thrCand;
    if (c && c !== d && c.live && G.time >= (this._thrMem.get(c) ?? Infinity) && (!d || this._threatScore(c) > this._threatScore(d) * 1.3)) {
      d = this.thr = c; this.thrAct = null; this.thrActs = 0; this.thrSide = 0; this.thrEvT = 0; this.thrAcqT = 0; this.thrLosT = 0;
      this.thrSignY = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5); this.thrSignP = (Math.random() - 0.5) * 1.2;
    }
    // a special that owns the body (a ride / transformation) plays out; others (thrown / aura / weapon specials) only
    // get our footwork — the special keeps the trigger
    const sp = a.specialActive, spK = sp && (sp.kind || sp.id);
    if (!d || spK === 'kraken' || spK === 'stamp' || spK === 'crab' || spK === 'jetpack' || spK === 'zipcaster' || a.climbing || this._climbAim || a.superJumpState) return null;
    const moveOnly = !!sp;
    const score = this._threatScore(d);
    if (score < 0.15) { this._thrEnd(false); return null; }   // lost interest in us / walked off after someone else
    this.thrAcqT += dt;
    const w = a.weapon, kind = w.kind, wr = a.weaponRunner, KB = MAIN_KITS[kind]?.bot, melee = !!(MELEE[kind] || KB?.melee);
    // eye → the device's hit centre, led by the shot's flight time
    const ex = a.pos.x, ey = a.pos.y + 1.1, ez = a.pos.z, hx = d.pos.x, hy = d.pos.y + d.aimY, hz = d.pos.z;
    let dx = hx - ex, dy = hy - ey, dz = hz - ez;
    const dh = Math.hypot(dx, dz), d3 = Math.hypot(dh, dy), v = d.vel;
    const lt = kind === 'charger' ? 0 : Math.min(0.5, d3 / (w.projSpeed || w.speedMax || w.throwSpeed || 30));
    dx += v.x * lt; dy += v.y * lt; dz += v.z * lt;
    // (a roller's flick at something on the ground: aim low — the flick's arc bottoms out there and lands 5–6.6 m out)
    const idealYaw = Math.atan2(dx, dz), idealPitch = kind === 'roller' && d.ground ? -0.3 : Math.atan2(dy, Math.hypot(dx, dz));
    if ((this.thrLosT -= dt) <= 0) { this.thrLosT = 0.1; this.thrLos = G.physics.los(_v.set(ex, ey + 0.1, ez), _v2.set(hx, hy + 0.05, hz)); }
    // can we pop it? a line on it, in reach (melee: the window its flick / swipe / cut / punch lands in), ink to shoot
    const [lo, hi] = melee ? this._meleeWindow(w, d) : [0, this._range() * (d.ground ? 0.95 : 1)];
    const inkOk = a.ink > Math.max(2.5, w.inkPerShot || 0, (w.inkFull || 0) * 0.25);
    const canShoot = !moveOnly && d.shootable && this.thrLos && d3 >= lo && d3 <= hi && inkOk;
    // a walker coming at us from just out of reach: stand and let it walk into it (running only buys time)
    const waitIn = !canShoot && !moveOnly && d.ground && d.shootable && this.thrLos && inkOk && d3 > hi && d3 < hi + 4 && hi - (d.trigger || 1.2) > 2.5;
    const mine = d.target === a, ttl = !d.ground && d.state === 'launch' ? d3 / Math.max(2, v.length()) : 9;
    const eta = d.ground ? Math.max(0, dh - (d.trigger || 1.2)) / (d.speed || 4) : ttl;
    // a duel with an enemy player close by outranks a device that isn't about to arrive
    const T = this.target;
    if (T && this.mode === 'fight' && this.seeTimer > 0) {
      const td = Math.hypot(T.pos.x - a.pos.x, T.pos.z - a.pos.z);
      const pd = td < 4 ? 2.4 : td < this._range() * 0.9 || td < weaponRange(T.weapon) * 0.9 ? 1.5 : 0.5;
      if (score < pd) { if (mine || dh < 4) this._thrDrift(d, move, 0.6); return null; }
    }
    // far off / out of reach and not about to arrive: carry on, edging away from it
    const urgent = d.ground ? eta < 2.2 || dh < (d.radius || 3) + 0.5 : d.state === 'launch' || d.state === 'unfold';
    if (!canShoot && !waitIn && !urgent) { this._thrDrift(d, move, 0.5); return null; }
    const act = canShoot || waitIn ? 'shoot' : 'evade', bit = act === 'shoot' ? 1 : 2;
    if (!(this.thrActs & bit)) { this.thrActs |= bit; THREAT_STATS[act]++; }
    this.thrAct = act;
    let dodge = false;
    if (canShoot || waitIn) {
      it.squid = false;
      a.fireFacing = Math.max(a.fireFacing, 0.25);   // square up to it (a flick / swipe leaves along the body)
      const rx = a.pos.x - d.pos.x, rz = a.pos.z - d.pos.z, rl = Math.hypot(rx, rz) || 1;
      // too late to count on the shot (a charge weapon a little sooner): sidestep its line, still firing if on it
      dodge = !d.ground && d.state === 'launch' && ttl < (CHARGES[kind] ? 0.8 : 0.45);
      if (dodge) this._thrSidestep(d, move, it, ttl < 0.3);
      else if (waitIn || (d.ground && kind === 'roller')) move.set(0, 0, 0);                          // (a flick lands a fixed way out)
      else if (d.ground && melee) move.set((rx / rl) * 0.35, 0, (rz / rl) * 0.35);                   // let it walk into the swing
      else if (d.ground && dh < 4.5) move.set(rx / rl, 0, rz / rl);                                  // kite while shooting
      else move.multiplyScalar(0.25);                                                                    // plant a moment for the shot
      if (CHARGES[kind] && wr.charging && !dodge) move.multiplyScalar(0.4);
    } else this._thrEvade(d, dt, move, it, ttl);
    this.noProg = 0; this.bestD = Infinity;   // (off the route on purpose: not "stuck")
    // aim: the usual human error, a little tighter (it's small and we're looking straight at it)
    const e = this.diff.aimError * 0.7, acq = Math.exp(-this.thrAcqT / Math.max(0.12, this.diff.reaction * 0.9));
    _thrAim.yaw = idealYaw + e * (0.7 * _wander(this.t * 1.7 + this.ph1) + 2.2 * acq * this.thrSignY);
    _thrAim.pitch = idealPitch + e * 0.6 * (0.7 * _wander(this.t * 2.1 + this.ph2) + 1.5 * acq * this.thrSignP);
    _thrAim.dist = Math.max(1, d3);
    // trigger only with the actual aim on it (shots follow the bot's aim ray)
    const off = Math.hypot(angleDiff(this.aimYaw, idealYaw), this.aimPitch - idealPitch);
    const tol = Math.max(0.035, Math.atan2(d.ground ? 0.24 : 0.28, d3)) * (this.thrFiring ? 2.2 : 1.3);
    if (moveOnly) { it.squid = false; return null; }   // (the special keeps its aim and trigger; it's used in kid form)
    it.fire = canShoot ? this._devTrigger(d3, off < tol, off < tol * 4, lo, hi) : !!(CHARGES[kind] && wr.charging && !it.squid);
    if (dodge && CHARGES[kind] && wr.charging && wr.charge >= 0.12) it.fire = false;   // let the charge go (roughly at it) and run
    this.thrFiring = it.fire && off < tol;
    if (it.fire) it.squid = false;
    it.sub = false; this._bombAim = false;
    return _thrAim;
  }
  _thrEnd(gone) {
    if (gone && this.thrActs) THREAT_STATS.gone++;
    const acted = !!this.thrActs;
    this.thr = null; this.thrAct = null; this.thrActs = 0; this.thrFiring = false;
    // back to what we were doing: re-plan the route from wherever the dodge left us
    if (acted && G.nav) {
      if (this.mode === 'paint' && this.goal >= 0 && this.path) { const n = G.nav.nodes[this.goal]; this._pathTo(_v3.set(n.x, n.y, n.z), 0.3); }
      else this.repath = 0;
    }
  }
  // keep doing what we're doing, but edge away from it
  _thrDrift(d, move, k) {
    const a = this.a, rx = a.pos.x - d.pos.x, rz = a.pos.z - d.pos.z, rl = Math.hypot(rx, rz) || 1;
    const x = move.x + (rx / rl) * k, z = move.z + (rz / rl) * k, l = Math.hypot(x, z);
    if (l > 1) move.set(x / l, 0, z / l); else move.set(x, 0, z);
  }
  // can't pop it: run (a kid outruns a Waddle; out of a hovering Torpedo's sight), swim through our own ink, or — a
  // Torpedo about to arrive — sidestep its line and hop
  _thrEvade(d, dt, move, it, ttl) {
    const a = this.a;
    if (!d.ground && d.state === 'launch' && ttl < 0.55) { this._thrSidestep(d, move, it, ttl < 0.35); return; }
    this.thrEvT -= dt;
    if (this.thrEvT <= 0) { this.thrEvT = 0.45 + Math.random() * 0.3; this.thrEvYaw = this._pickEvade(d); }
    move.set(Math.sin(this.thrEvYaw), 0, Math.cos(this.thrEvYaw));
    const swim = a.groundTeam === 1 && !this._squidWouldDrop(move);
    if (swim && !(this.thrActs & 4)) { this.thrActs |= 4; THREAT_STATS.swim++; }
    it.squid = swim;
    // running from a walker we can see: back off facing it, ready to shoot the moment it's in reach
    if (!swim && d.ground && this.thrLos) a.fireFacing = Math.max(a.fireFacing, 0.25);
  }
  _thrSidestep(d, move, it, hop) {
    const a = this.a, v = d.vel, vl = Math.hypot(v.x, v.z), rx = a.pos.x - d.pos.x, rz = a.pos.z - d.pos.z;
    let px, pz;
    if (vl > 0.3) { px = -v.z / vl; pz = v.x / vl; } else { const rl = Math.hypot(rx, rz) || 1; px = -rz / rl; pz = rx / rl; }
    if (!this.thrSide) {
      // step to the side of its line we're already on, unless that's a wall or the sea
      const ok = (sg) => this._dryLine(a.pos.x, a.pos.y, a.pos.z, a.pos.x + px * sg * 2, a.pos.z + pz * sg * 2) && this._fatLos(a.pos.x, a.pos.y, a.pos.z, a.pos.x + px * sg * 2, a.pos.y, a.pos.z + pz * sg * 2);
      let s = rx * px + rz * pz >= 0 ? 1 : -1;
      if (!ok(s) && ok(-s)) s = -s;
      this.thrSide = s;
      if (!(this.thrActs & 8)) { this.thrActs |= 8; THREAT_STATS.sidestep++; }
    }
    move.set(px * this.thrSide, 0, pz * this.thrSide);
    it.squid = false;
    if (hop && a.grounded && this.jumpCd <= 0 && !this._nearWater(a, 1.4)) { it.jump = true; this.jumpCd = 0.9; }
  }
  // a heading to run from it: away (flyers: across its line, out of its sight), clear of walls and water, onto our ink
  _pickEvade(d) {
    const a = this.a, x0 = a.pos.x, y0 = a.pos.y, z0 = a.pos.z, base = Math.atan2(x0 - d.pos.x, z0 - d.pos.z);
    const wp = this.path && this.pi < this.path.length ? G.nav.nodes[this.path[this.pi]] : null;
    let best = base, bs = -Infinity;
    for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1]) {
      const yw = base + off, sx = Math.sin(yw), sz = Math.cos(yw), px = x0 + sx * 3.2, pz = z0 + sz * 3.2;
      if (G.nav.nearest(_evP.set(px, y0, pz), 1.0) < 0) continue;   // never run off the walkable graph (no way back)
      if (!this._dryLine(x0, y0, z0, px, pz) || !this._fatLos(x0, y0, z0, px, y0, pz)) continue;
      let sc = Math.cos(off) * (d.ground ? 2 : 1) + (d.ground ? 0 : Math.abs(Math.sin(off)) * 1.2);
      const st = G.paint.regionStats(px, y0, pz, 1.3, a.team, _stats);
      if (st.n) sc += st.own * 1.5;
      if (wp) { const wx = wp.x - x0, wz = wp.z - z0, wl = Math.hypot(wx, wz) || 1; sc += (0.4 * (wx * sx + wz * sz)) / wl; }
      if (!d.ground && !G.physics.los(_v.copy(d.pos), _v2.set(px, y0 + 1, pz))) sc += 2;
      sc += Math.random() * 0.3;
      if (sc > bs) { bs = sc; best = yw; }
    }
    return best;
  }
  // melee kits vs a device: the distance window their attack pops it in (a roller's flick arcs over anything close;
  // a brush's swipe globs fly low and short; the Cutlass's cut throws droplets; a punch flies straight)
  _meleeWindow(w, d) {
    switch (w.kind) {
      // (ground, aimed low: the flick comes down 5–6.6 m out ~0.6 s after the press — a walker is ~2.3 m closer by then)
      case 'roller': return !d.ground ? [1.5, 6] : d.state === 'walk' ? [7.3, 9] : [5, 6.6];
      case 'brush': return !d.ground ? [0.8, 4.5] : d.state === 'walk' ? [99, 99] : [0.8, 2.8];   // (a walker inside 2.8 m is too close to call: run)
      case 'blade': return d.ground ? [0, 4] : [0, 5.5];
      default: return [0, weaponRange(w) * 0.95];
    }
  }
  // the trigger for a shot at a device dist m away (aimed: on it now; roughly: swinging onto it)
  _devTrigger(dist, aimed, roughly, lo, hi) {
    const a = this.a, w = a.weapon, wr = a.weaponRunner, k = w.kind, KB = MAIN_KITS[k]?.bot, inWin = dist >= lo && dist <= hi;
    if (MELEE[k] || KB?.melee) {
      // press, release, press… (a roller's flick / a brush's swipe goes where the body faces: wait until it's squared up)
      const faced = (k !== 'roller' && k !== 'brush') || Math.abs(angleDiff(a.yaw, this.aimYaw)) < 0.3;
      this.thrPulse = aimed && faced && inWin && !this.thrPulse; return this.thrPulse;
    }
    if (CHARGES[k] || KB?.charges) {
      if (wr.burstT > 0 || wr.streaming) return false;                     // a spinner / splatling stream runs on by itself
      // a short charge does it (a charger tap is 40+, bow ring 1 ~30, a short spinner burst)
      const rel = k === 'charger' ? 0.12 : k === 'spinner' ? 0.3 : k === 'splatling' ? 0.35 : (w.ring1 ?? 0.4) + 0.06;
      if (wr.charging) return !(aimed && wr.charge >= rel);
      return roughly && inWin && !(wr.cooldown > 0);
    }
    return aimed && inWin;
  }

  // In a fight: an enemy shield (their held canopy, or a launched one) between us and the target soaks every shot —
  // flank round to the side it doesn't cover (sticky side, flipped off walls / water), save the shots unless it's nearly
  // broken or we can't get round, and lob a sub over it.
  _shieldFight(t, dist, move, it, dt) {
    if (!THREAT_AI.enabled || !this._shl.length) { this.blockT = 0; return; }
    const a = this.a, ex = a.pos.x, ey = a.pos.y + 1.1, ez = a.pos.z;
    const tx = t.pos.x, ty = t.pos.y + (t.smoothY || 0) + (t.form === 'squid' ? 0.3 : 0.85), tz = t.pos.z;
    let blk = null;
    for (const s of this._shl) {
      if (!s.live) continue;
      const C = s.C, N = s.N;
      const p0 = (ex - C.x) * N.x + (ey - C.y) * N.y + (ez - C.z) * N.z, p1 = (tx - C.x) * N.x + (ty - C.y) * N.y + (tz - C.z) * N.z;
      if ((p0 > 0) === (p1 > 0) || p0 === p1) continue;
      const k = p0 / (p0 - p1), qx = ex + (tx - ex) * k - C.x, qy = ey + (ty - ey) * k - C.y, qz = ez + (tz - ez) * k - C.z;
      if (qx * qx + qy * qy + qz * qz > (s.R + 0.12) * (s.R + 0.12)) continue;
      blk = s; break;
    }
    if (!blk) { if (this.blockT > 0) { this.blockT = Math.max(0, this.blockT - dt * 3); if (this.blockT === 0) this.flankSide = 0; } return; }
    if (this.blockT === 0) THREAT_STATS.flank++;
    this.blockT += dt;
    // flank: across our line to the target, toward the side of the shield we're already off-centre on
    const N = blk.N, sx = -N.z, sz = N.x, hl = Math.max(0.3, Math.hypot(tx - ex, tz - ez)), nx = (tx - ex) / hl, nz = (tz - ez) / hl;
    if (!this.flankSide) { this.flankSide = (ex - blk.C.x) * sx + (ez - blk.C.z) * sz >= 0 ? 1 : -1; this.flankT = 0; }
    let lx = -nz, lz = nx;
    if ((lx * sx + lz * sz) * this.flankSide < 0) { lx = -lx; lz = -lz; }
    if ((this.flankT -= dt) <= 0) {
      this.flankT = 0.5;
      const ok = this._dryLine(ex, a.pos.y, ez, ex + lx * 1.8, ez + lz * 1.8) && this._fatLos(ex, a.pos.y, ez, ex + lx * 1.8, a.pos.y, ez + lz * 1.8);
      if (!ok) { this.flankSide = -this.flankSide; lx = -lx; lz = -lz; }
    }
    const inward = dist > 6 ? 0.45 : dist < 2.5 ? -0.35 : 0.1, mx = lx + nx * inward, mz = lz + nz * inward, ml = Math.hypot(mx, mz) || 1;
    move.set(mx / ml, 0, mz / ml);
    // shots: only into a shield we'd break in about a second (a fast shooter on a worn one), or when we can't get round
    // it; charge weapons keep their charge for the opening
    const w = a.weapon, wr = a.weaponRunner, dps = w.damage && w.fireInterval && !CHARGES[w.kind] ? w.damage / w.fireInterval : 120;
    const through = blk.hp <= dps * 1.3 || this.blockT > 2.5 || (!blk.held && blk.left < 0.5) || (this.canRef === blk && this.canSide === 2);
    if (!through && this.blockT > 0.15) {
      if (CHARGES[w.kind] || MAIN_KITS[w.kind]?.bot?.charges) it.fire = it.fire || !!wr.charging;
      else if (it.fire) { it.fire = false; THREAT_STATS.holdFire += dt; }
    }
    // a thrown sub goes over / round it
    const sub = a.sub || SUB.bomb;
    if (this.blockT > 0.5 && this.bombCd <= 0 && THROWN[sub.kind] && a.ink >= sub.inkCost + 8 && dist > 3 && dist < 13 && !SUB_KITS[sub.kind]?.blocked?.(a, sub) && Math.random() < dt * 2.5) {
      it.sub = true; this._bombAim = true; this.bombCd = 5 + Math.random() * 4; THREAT_STATS.shieldSub++;
    }
  }

  // Enemy launched canopies (sliding walls that hold enemy players back) across our way: steer round the nearer edge
  // (then across behind it); boxed in (walls / water on both sides) or still not round after 4 s → shoot it apart.
  // Returns the aim to hold while breaking one (only when `free`: no device being dealt with), else null.
  _canopyCtl(dt, it, move, free) {
    if (!THREAT_AI.enabled) return null;
    const a = this.a, S = this._shl;
    if (!S.length || a.climbing || a.superJumpState || a.specialActive) { this.canRef = null; return null; }
    let ml = Math.hypot(move.x, move.z);
    let hit = null, hAlong = 0, hSide = 1, hW = 1;
    for (const s of S) {
      if (!s.blocksActors || !s.live) continue;
      const N = s.N, tx = -N.z, tz = N.x, px = a.pos.x - s.pos.x, pz = a.pos.z - s.pos.z, dy = a.pos.y - s.pos.y;
      if (dy < -1.2 || dy > 1.6) continue;
      const along = px * tx + pz * tz, across = px * N.x + pz * N.z - s.planeOff, W = s.halfW + PLAYER.radius * 0.6 + 0.3;
      if (Math.abs(across) > 3 || Math.abs(along) > W + 2.5) continue;
      const side = across >= 0 ? 1 : -1;
      // it's sliding at us (we're in front of it, in its lane): step out of its way even if we're standing still
      const coming = side > 0 && across < 2.2 && Math.abs(along) < W && (s.speed || 0) > 0.5;
      if (!coming) {
        if (ml <= 0.05) continue;
        const mx = move.x / ml, mz = move.z / ml, mN = mx * N.x + mz * N.z, mT = mx * tx + mz * tz;
        if (mN * side > -0.2) continue;                               // moving along it or away from it
        const tCross = -across / mN;                                  // metres of travel to its plane
        if (tCross > 2.5 || Math.abs(along + mT * tCross) > W) continue;   // far yet / we'd clear its edge anyway
      }
      hit = s; hAlong = along; hSide = side; hW = W; break;
    }
    if (hit && ml <= 0.05) ml = 1;
    if (!hit) { this.canRef = null; this._canBroke = false; return null; }
    if (this.canRef !== hit) { this.canRef = hit; this.canSide = 0; this.canT = 0; this._canBroke = false; THREAT_STATS.steer++; }
    this.canT += dt;
    const N = hit.N, tx = -N.z, tz = N.x;
    // a spot beside its edge: `off` m out from its plane on our side (negative: past it)
    const edgeX = (sg, off) => hit.pos.x + N.x * (hit.planeOff + hSide * off) + tx * sg * (hW + 0.55);
    const edgeZ = (sg, off) => hit.pos.z + N.z * (hit.planeOff + hSide * off) + tz * sg * (hW + 0.55);
    if (!this.canSide) {
      const ok = (sg) => {
        const x1 = edgeX(sg, 0.9), z1 = edgeZ(sg, 0.9), x2 = edgeX(sg, -1.4), z2 = edgeZ(sg, -1.4), y = a.pos.y;
        return this._dryLine(a.pos.x, y, a.pos.z, x1, z1) && this._fatLos(a.pos.x, y, a.pos.z, x1, y, z1) && this._dryLine(x1, y, z1, x2, z2) && this._fatLos(x1, y, z1, x2, y, z2);
      };
      const pref = hAlong >= 0 ? 1 : -1;
      this.canSide = ok(pref) ? pref : ok(-pref) ? -pref : 2;
    }
    if (this.canSide !== 2 && this.canT > 4) this.canSide = 2;
    if (this.canSide === 2) {
      if (!free) return null;
      if (!this._canBroke) { this._canBroke = true; THREAT_STATS.breakWall++; }
      const C = hit.C, dx = C.x - a.pos.x, dy = C.y - (a.pos.y + 1.1), dz = C.z - a.pos.z, dh = Math.hypot(dx, dz);
      _thrAim.yaw = Math.atan2(dx, dz); _thrAim.pitch = Math.atan2(dy, dh); _thrAim.dist = Math.max(1, Math.hypot(dh, dy));
      const off = Math.hypot(angleDiff(this.aimYaw, _thrAim.yaw), this.aimPitch - _thrAim.pitch);
      const melee = MELEE[a.weapon.kind] || MAIN_KITS[a.weapon.kind]?.bot?.melee;
      it.fire = a.ink > 3 && this._devTrigger(_thrAim.dist, off < 0.3, off < 0.7, 0, melee ? 3.5 : this._range());
      if (it.fire) it.squid = false;
      move.set(N.x * hSide * 0.3, 0, N.z * hSide * 0.3);
      this.noProg = 0; this.bestD = Infinity;
      return _thrAim;
    }
    this._canBroke = false;
    // beside its face → out to the edge; clear of the edge → across behind it
    const off = Math.abs(hAlong) < hW + 0.1 ? 0.9 : -1.4;
    const gx = edgeX(this.canSide, off) - a.pos.x, gz = edgeZ(this.canSide, off) - a.pos.z, gl = Math.hypot(gx, gz);
    if (gl > 0.05) move.set((gx / gl) * ml, 0, (gz / gl) * ml);
    this.noProg = 0; this.bestD = Infinity;
    return null;
  }

  _range() {
    const w = this.a.weapon;
    return weaponRange(w) * (CHARGES[w.kind] ? 0.9 : 1);
  }

  // one look round (every ~0.2 s): what we can see and what we remember (botSight.js), then the target — the best foe
  // in sight (nearest; the current one, a kit's bias and a tower rider first); none in sight: keep after the one we
  // lost for a while (huntFor), or turn to a foe we know is close without seeing it (tracked, landing from a super
  // jump, shooting at us)
  _perceive() {
    const a = this.a, S = this.sight, now = G.time;
    if (!S.check()) { this.think = 0; return; }        // over this frame's sight-line budget: next frame
    const dtc = this._pT >= 0 && now > this._pT ? Math.min(0.5, now - this._pT) : 0.2;
    this._pT = now;
    let best = null, bd = Infinity;
    const bias = MAIN_KITS[a.weapon.kind]?.bot?.targetBias;   // kit weapons may weigh targets (e.g. the Cutlass: busy ones)
    const TP = G.match && G.match.tower ? towerPlan() : null;   // Tower Command: foes riding the tower first
    for (const [e, k] of S.mem) {
      if (!k.seen) continue;
      const d = e.pos.distanceTo(a.pos);
      const score = d - (e === this.target ? 4 : 0) + (bias ? bias(this, e, d) : 0) - (TP && TP.riding(e) ? 7 : 0) + this.sp.targetBias(e, d);   // (enemy specials: the untouchable last)
      if (score < bd) { bd = score; best = e; }
    }
    if (best) {
      if (best !== this.target) this._acquire(best);
      this.seeTimer = 1;
      this.lostTimer = 0;
    } else {
      this.seeTimer = 0;
      if (this.target) {
        const k = S.get(this.target);
        if (!k) this._dropTarget();                                         // looked: gone (or forgotten / splatted)
        else {
          if (this._tgtSeen) this._onLost(k);                                // just lost sight of it
          // (located: we know where it is, so the hunt doesn't run down)
          this.lostTimer = k.src === 'track' || k.src === 'jump' ? 0 : this.lostTimer + dtc;
          if (this.lostTimer > this.huntFor || k.pos.distanceTo(a.pos) > this.diff.awareness + 8) { k.dropped = true; this._dropTarget(); }
        }
      }
      if (!this.target) {
        let bk = null, bkd = Infinity;
        for (const [e, k] of S.mem) {
          if (k.seen || k.dropped || now - k.t > 0.6 || k.src === 'sight') continue;
          const d = k.pos.distanceTo(a.pos);
          if (d < this.diff.awareness + 4 && d < bkd) { bkd = d; bk = e; }
        }
        if (bk) { this._acquire(bk); this._onLost(S.get(bk)); SIGHT_STATS.hunts++; }
      }
    }
    this._tgtSeen = this.seeTimer > 0;
    this.tk = this.target ? S.get(this.target) : null;
    this.tv = this.tk ? this.tk.viewed : null;
    if (this.target && !this.tv) this._dropTarget();
    this.react -= dtc;
  }
  _acquire(e) {
    this.target = e; this.react = this.diff.reaction * (0.7 + Math.random() * 0.6); this.repath = 0; this.lostTimer = 0;
    // first look lands a little off (over- or under-shoot) and settles — like a human flick
    this.acqT = 0; this.acqSignY = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5); this.acqSignP = (Math.random() - 0.5) * 1.2;
  }
  _dropTarget() { this.target = null; this.tk = null; this.tv = null; this.lostTimer = 0; this._tgtSeen = false; this.mBomb = null; }
  // out of sight: hold the angle for a moment (pre-aim where it went), then either go and look (most of the time, not
  // when hurt) or give up and go back to the job; maybe a short spray at the spot, maybe a sub lobbed there
  _onLost(k) {
    const hurt = this.a.hp < PLAYER.hp * 0.45;
    const located = k.src === 'track' || k.src === 'jump';
    this.huntSeek = !hurt && (located || Math.random() < 0.65);
    this.huntFor = SIGHT.fresh + (this.huntSeek ? 1.2 + Math.random() * 2.6 : 0.2);
    this.sprayOn = k.src === 'sight' && Math.random() < 0.6; this.sprayed = false;
    this.memBombOn = Math.random() < 0.4; this.mBomb = null;
    this.lostTimer = 0;
  }
  // a short spray at the spot a foe went out of sight (the pre-aim is on it): steady-trigger weapons only, for a moment
  _spray(dist, range, aimed, inkFrac) {
    const k = this.tk, w = this.a.weapon;
    if (!this.sprayOn || !k || k.src !== 'sight' || G.time - k.seenT > SIGHT.spray || !aimed || inkFrac < 0.15 || dist > range || !SPRAY[w.kind]) return false;
    if (!this.sprayed) { this.sprayed = true; SIGHT_STATS.sprays++; }
    return true;
  }
  // a thrown sub where the foe went (0.3–3 s after, 4.5–12 m off, once per loss) or where it's located; returns the aim
  // to hold while it's thrown ({ yaw, pitch, release }), else null
  _memBombAim(dt) {
    const mb = this.mBomb;
    if (mb) {
      if (mb.release) { this.mBomb = null; return mb; }
      if ((mb.t -= dt) <= 0) { this.mBomb = null; return null; }
      if (Math.abs(angleDiff(this.aimYaw, mb.yaw)) < 0.09 && Math.abs(this.aimPitch - mb.pitch) < 0.09) { this._bombAim = true; mb.release = true; this.bombCd = 5 + Math.random() * 4; }
      return mb;
    }
    const a = this.a, k = this.tk, sub = a.sub || SUB.bomb;
    // (an Echo Orb there finds out where they went)
    if (!this.memBombOn || !k || this.bombCd > 0 || !(THROWN[sub.kind] || sub.kind === 'scan') || a.ink < sub.inkCost + 10 || SUB_KITS[sub.kind]?.blocked?.(a, sub)) return null;
    // (lost from sight: a moment after, while it could still be there; located: where it is)
    const age = G.time - k.t;
    if (k.src === 'sight' ? age < 0.3 || age > 3 : age > 1 || (sub.kind === 'scan' && k.src === 'track')) return null;
    const p = k.guess, d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
    if (d < 4.5 || d > 12 || Math.abs(p.y - a.pos.y) > 3) return null;
    const pitch = lobPitch(d, p.y - a.pos.y, sub.throwSpeed || 13.5);
    if (pitch === null) return null;
    this.memBombOn = false; SIGHT_STATS.memBombs++;
    this.mBomb = { yaw: Math.atan2(p.x - a.pos.x, p.z - a.pos.z), pitch, t: 1.1, release: false };
    return this.mBomb;
  }

  _pathTo(pos, maxUp = 0.8) {
    const nav = G.nav;
    let s = nav.nearest(this.a.pos, 1.2, true);
    // standing at the foot of a step: don't start the route from the ledge above (we can't get up there from here)
    if (s >= 0 && this.a.grounded && nav.nodes[s].y - this.a.pos.y > 0.5) { const s2 = nav.nearest(this.a.pos, 0.45, true); if (s2 >= 0) s = s2; }
    const g = this.sp.goalOk(nav.nearest(pos, maxUp));   // (enemy specials: a goal inside an area we know hurts → just outside it)
    this.repath = 0.8 + Math.random() * 0.4;
    if (s < 0 || g < 0) { this.path = null; return false; }
    const rule = this._climbRule();
    let p = nav.path(s, g, this.a.team, undefined, rule, null, this.sp.cost());   // (… and round those areas; climbs: _climbRule)
    // climbs are off after a failed one and there's no way there without one (a pit whose only way out is up a wall): up
    // one anyway, the failed one last — unless too dry to ink it (no route: the tank refills while it stands)
    if (!p && rule === true && this.a.ink >= PLAYER.inkMax * CLIMB.ink) p = nav.path(s, g, this.a.team, undefined, this._climbRule(true), null, this.sp.cost());
    if (!p) { this.path = null; return false; }
    this.path = p; this.pi = Math.min(1, p.length - 1); this.goal = g; this.bestD = Infinity; this.noProg = 0;
    return true;
  }

  _pickPaintGoal() {
    const a = this.a, nav = G.nav;
    let best = -1, bs = -Infinity;
    const enemyPad = G.level.spawnPads[1 - a.team];
    const ownPad = G.level.spawnPads[a.team];
    const total = ownPad.distanceTo(enemyPad);
    const mates = G.actors.filter((o) => o !== a && o.team === a.team && o.bot);
    for (let i = 0; i < 28; i++) {
      const id = nav.validIds[(Math.random() * nav.validIds.length) | 0];
      const n = nav.nodes[id];
      if (n.zone >= 0 || n.wet === 2) continue;
      const d = Math.hypot(n.x - a.pos.x, n.z - a.pos.z);
      if (d > 38) continue;
      // value of the spot and of the patch around it: unclaimed turf counts, enemy ink counts more (flipping it
      // swings the score both ways); own ink is worth nothing
      const near = G.paint.regionStats(n.x, n.y, n.z, 3, a.team, _stats);
      if (!near.n) continue;
      const vNear = near.empty + near.enemy * 1.4;
      const wide = G.paint.regionStats(n.x, n.y, n.z, 6.5, a.team, _stats);
      const value = vNear * 0.55 + (wide.empty + wide.enemy * 1.4) * 0.45;
      const progress = 1 - Math.hypot(n.x - enemyPad.x, n.z - enemyPad.z) / total; // 0 at own base → 1 at enemy base
      let score = value * 16 - d * 0.14 + clamp(progress, 0, 0.8) * 2.5 + Math.random() * 1.5 - (n.wet ? 1.5 : 0);
      if (CHARGES[a.weapon.kind]) score += clamp(n.y, 0, 5) * 1.6; // long range: high perches see (and paint) more
      if (value < 0.15) score -= 8; // already ours: only if nothing better turns up
      for (const m of mates) if (m.bot.goal >= 0) { const g = nav.nodes[m.bot.goal]; if (Math.hypot(g.x - n.x, g.z - n.z) < 8) score -= 5; }
      if (score > bs) { bs = score; best = id; }
    }
    this.goalTimer = 4 + Math.random() * 3;
    if (best < 0) return;
    const n = nav.nodes[best];
    this._pathTo(_v3.set(n.x, n.y, n.z), 0.3);
  }


  _pickRefill() {
    const a = this.a;
    // search nearby for own ink
    let bestP = null, bd = Infinity;
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2, r = 1 + Math.random() * 7;
      _v.set(a.pos.x + Math.cos(ang) * r, a.pos.y, a.pos.z + Math.sin(ang) * r);
      const st = G.paint.regionStats(_v.x, _v.y, _v.z, 1.2, a.team, _stats);
      if (st.n && st.own > 0.6 && r < bd) { bd = r; bestP = _v.clone(); }
    }
    // nothing close: look further out, and failing that head back toward our own spawn (always our colour)
    for (let i = 0; i < 16 && !bestP; i++) {
      const ang = Math.random() * Math.PI * 2, r = 8 + Math.random() * 14;
      _v.set(a.pos.x + Math.cos(ang) * r, a.pos.y, a.pos.z + Math.sin(ang) * r);
      const st = G.paint.regionStats(_v.x, _v.y, _v.z, 1.5, a.team, _stats);
      if (st.n && st.own > 0.6) bestP = _v.clone();
    }
    if (!bestP || !this._pathTo(bestP, 0.4)) this._pathTo(G.level.spawnPads[a.team], 1.2);
    this.repath = 1.2;
  }

  // Escape move: steer a fixed random heading for a moment (hopping if on the ground), then re-plan from wherever
  // that leaves us. Used when perched on an edge in mid-air or when repeated re-plans make no progress.
  _wiggle(t) {
    this.wiggleT = t; this.wiggleYaw = Math.random() * Math.PI * 2;
    this.path = null; this.goalTimer = 0; this.repath = 0;
    if (this.a.grounded) this._needJump = true;
  }
  _unstick(dt, move) {
    const a = this.a;
    this.strikeT -= dt;
    if (this.strikeT <= 0) this.strikes = 0;
    // resting on a ledge corner: not grounded, not falling, not moving → the waypoint logic can't fix that
    const still = !a.grounded && Math.abs(a.vel.y) < 0.6 && Math.hypot(a.vel.x, a.vel.z) < 0.4 && !a.superJumpState;
    this.airStill = still ? this.airStill + dt : 0;
    if (this.airStill > 0.4 && this.wiggleT <= 0) this._wiggle(0.6);
    if (this.wiggleT > 0) {
      this.wiggleT -= dt;
      move.set(Math.sin(this.wiggleYaw), 0, Math.cos(this.wiggleYaw));
      this.noProg = 0; this.bestD = Infinity; // the escape isn't "no progress" toward the waypoint
    }
  }

  // No route, and no nav graph under us (dodged, shoved or dropped somewhere the graph doesn't reach — every re-plan
  // fails from there, so nothing else would ever move us): walk to the nearest graph node in sight, then plan again
  _backOnNav(dt, move) {
    const a = this.a, N = G.nav;
    if (!N || !a.grounded || a.climbing || a.superJumpState) { this.navBack = null; return; }
    this.navBackT = (this.navBackT || 0) - dt;
    if (this.navBackT <= 0) {
      this.navBackT = 0.6; this.navBack = null;
      if (N.nearest(a.pos, 1.2, true) >= 0) return;                  // on the graph: the normal re-plan works
      const cands = [];
      for (const id of N.validIds) {
        const q = N.nodes[id], d2 = (q.x - a.pos.x) ** 2 + (q.z - a.pos.z) ** 2;
        if (d2 < 100 && Math.abs(q.y - a.pos.y) < 1.2 && !q.wet) cands.push([d2, q]);
      }
      cands.sort((x, y) => x[0] - y[0]);
      for (let k = 0; k < Math.min(12, cands.length); k++) {
        const q = cands[k][1];
        if (this._dryLine(a.pos.x, a.pos.y, a.pos.z, q.x, q.z) && this._fatLos(a.pos.x, a.pos.y, a.pos.z, q.x, q.y, q.z)) { this.navBack = q; break; }
      }
      if (!this.navBack && cands.length) this.navBack = cands[0][1];
    }
    const q = this.navBack;
    if (q) { const dx = q.x - a.pos.x, dz = q.z - a.pos.z, l = Math.hypot(dx, dz); if (l > 0.3) move.set(dx / l, 0, dz / l); }
  }

  _pathRemaining() {
    if (!this.path) return 0;
    const n = G.nav.nodes[this.path[this.path.length - 1]];
    return Math.hypot(n.x - this.a.pos.x, n.z - this.a.pos.z);
  }

  // body-width line of sight at knee height (centre + both shoulders) so bots never cut corners they can't fit past
  _fatLos(ax, ay, az, bx, by, bz) {
    let dx = bx - ax, dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    const px = (-dz / l) * 0.34, pz = (dx / l) * 0.34;
    for (const o of [0, 1, -1]) {
      _v.set(ax + px * o, ay + 0.45, az + pz * o); _v2.set(bx + px * o, by + 0.45, bz + pz * o);
      // a walking line: grates and rails block it (shots see through them, legs don't — so not physics.los)
      _v3.copy(_v2).sub(_v); const len = _v3.length();
      if (len < 1e-4) continue;
      _v3.multiplyScalar(1 / len);
      if (G.physics.raycast(_v, _v3, len - 0.05, _walkHit, false).hit) return false;
    }
    return true;
  }

  _steer(dt) {
    const a = this.a, nav = G.nav, out = this._mv || (this._mv = new THREE.Vector3());
    out.set(0, 0, 0);
    if (!this.path || this.pi >= this.path.length) return out;
    // advance waypoints we've reached (generous vertically when dropping down)
    while (this.pi < this.path.length) {
      const n = nav.nodes[this.path[this.pi]];
      const dx = n.x - a.pos.x, dz = n.z - a.pos.z, dy = n.y - a.pos.y;
      // (the top of a climb only once we're up on it: a squid popping over the ledge is under it yet — the climb isn't done)
      if (dx * dx + dz * dz < 0.6 * 0.6 && dy < 0.9 && dy > -1.8 && !(dy > 0.35 && this.pi > 0 && nav.edge(this.path[this.pi - 1], this.path[this.pi])?.type === 'climb')) { this.pi++; this.bestD = Infinity; this.noProg = 0; }
      else break;
    }
    if (this.pi >= this.path.length) return out;
    let cur = nav.nodes[this.path[this.pi]];
    let hd = Math.hypot(cur.x - a.pos.x, cur.z - a.pos.z);
    // waypoint is above us and we can't get there from here (slipped off a ledge, got pushed): replan now
    if (a.grounded && cur.y - a.pos.y > 0.9 && hd < 1.2 && !['jump', 'climb'].includes(nav.edgeType(this.path[Math.max(0, this.pi - 1)], this.path[this.pi]))) {
      this.path = null; this.repath = 0; this.goalTimer = 0;
      // the replan keeps landing on the same unreachable ledge: shake loose instead of re-planning every frame
      if (this.t - (this._ledgeT ?? -9) > 2) this._ledgeN = 0;
      this._ledgeT = this.t;
      if (++this._ledgeN >= 4) { this._ledgeN = 0; this._wiggle(0.8); }
      return out;
    }
    // waypoint is below us and we're standing over it (drop edge): keep going the way the path runs to step off
    if (cur.y - a.pos.y < -0.9 && hd < 0.8 && this.pi > 0) {
      const p = nav.nodes[this.path[this.pi - 1]];
      out.set(cur.x - p.x, 0, cur.z - p.z);
      const ll = out.length();
      if (ll > 0.01) { out.multiplyScalar(1 / ll); return out; }
    }
    // look ahead: aim at the furthest waypoint we can walk to in a straight line on this level (re-chosen every
    // ~0.1 s or when the waypoint advances — the probes are the costly part, the heading still updates every frame)
    let ti = this.pi;
    this._laT = (this._laT ?? 0) - dt;
    if (this._laT > 0 && this._laPi === this.pi && this._laPath === this.path && this._laTi < this.path.length) ti = this._laTi;
    else {
      for (let k = this.pi + 1; k < Math.min(this.path.length, this.pi + 7); k++) {
        const n = nav.nodes[this.path[k]];
        if (Math.abs(n.y - a.pos.y) > 0.4) break;
        if (nav.edgeType(this.path[k - 1], this.path[k]) !== 'walk') break;
        if (!this._fatLos(a.pos.x, a.pos.y, a.pos.z, n.x, n.y, n.z)) break;
        if (!this._dryLine(a.pos.x, a.pos.y, a.pos.z, n.x, n.z)) break;   // never cut a corner across water
        ti = k;
      }
      this._laT = 0.1; this._laPi = this.pi; this._laPath = this.path; this._laTi = ti;
    }
    // the waypoints the look-ahead cuts past are behind us: steer for — and measure progress to — the one we're heading
    // for (else a corner cut wider than the 0.6 m reach, e.g. onto a run at 45° to the nav grid, leaves pi behind: it
    // reads as no progress, the stuck recovery hops, and in the air the look-ahead turns us back for the missed one)
    if (ti > this.pi) {
      this.pi = ti; this._laPi = ti; this.bestD = Infinity; this.noProg = 0;
      cur = nav.nodes[this.path[ti]]; hd = Math.hypot(cur.x - a.pos.x, cur.z - a.pos.z);
    }
    const n = nav.nodes[this.path[ti]];
    out.set(n.x - a.pos.x, 0, n.z - a.pos.z);
    const l = out.length();
    if (l > 0.001) out.multiplyScalar(1 / l);
    // jump edges
    if (this.pi > 0) {
      const et = nav.edgeType(this.path[this.pi - 1], this.path[this.pi]);
      if (et === 'jump' && cur.y - a.pos.y > 0.4 && hd < 1.6) this._needJump = true;
    }
    // separation from teammates (only sideways relative to travel, so it never stalls forward progress)
    for (const o of G.actors) {
      if (o === a || !o.alive) continue;
      const dx = a.pos.x - o.pos.x, dz = a.pos.z - o.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 1.4 * 1.4 && d2 > 1e-4) {
        const d = Math.sqrt(d2), k = (1.4 - d) * 0.7;
        const side = (dx * -out.z + dz * out.x) >= 0 ? 1 : -1;
        const ox = out.x, oz = out.z;
        out.x = ox - oz * side * k; out.z = oz + ox * side * k;
      }
    }
    const l2 = out.length();
    if (l2 > 1) out.multiplyScalar(1 / l2);
    // progress tracking toward the current waypoint (used by the stuck recovery)
    if (hd < this.bestD - 0.2) { this.bestD = hd; this.noProg = 0; } else this.noProg += dt;
    return out;
  }


  // ============================================================================================ Boss Battle
  // One squad vs HULLBREAKER (docs/BOSS.md): spread round its flanks at weapon range, shoot what it exposes (eyes; the
  // belly while it's stunned — everyone piles in), step out of every telegraph, hop the shockwave rings, duck under the
  // sweep in own ink, pop the crablets that come for the squad, and clean boss ink off the routes (rollers most of all).
  _bossTick(dt) {
    const a = this.a, it = a.intent, w = a.weapon, boss = G.boss;
    const inkFrac = a.ink / PLAYER.inkMax;
    it.fire = false; it.sub = false; it.special = false; it.squid = false; it.jump = false;
    if (this.think <= 0) { this.think = 0.12 + Math.random() * 0.1; this._bossPerceive(boss); }
    this.react -= dt; this.evadeT = (this.evadeT || 0) - dt;
    const th = Object.assign(this._th || (this._th = {}), boss.hz.threat(a.pos.x, a.pos.y, a.pos.z, 1.4));   // (threat() reuses its result)
    // human-ish: a new telegraph takes a reaction time to register, and now and then a ring hop is simply missed
    if (th.level > 0 || th.ringIn >= 0) {
      if (this.thSeen === undefined) { this.thSeen = this.t + this.diff.reaction * (0.5 + Math.random() * 0.9); this.hopMiss = Math.random() < (0.45 - this.diff.fireDiscipline * 0.4); }
      if (this.t < this.thSeen) { th.level = 0; th.ringIn = -1; th.beam = false; th.cover = false; }
    } else this.thSeen = undefined;
    // ---- mode: refill when dry (unless a crablet is right on us), else fight
    if (this.mode === 'refill' && inkFrac >= this.refillUntil) { this.mode = 'boss'; this.path = null; this.goalTimer = 0; }
    if (this.mode !== 'refill' && inkFrac < 0.1 && !(this.bTgt?.crab && this.bTgt.dist < 4 && inkFrac > 0.03)) { this.mode = 'refill'; this.refillUntil = 0.8 + Math.random() * 0.15; this.path = null; }
    if (this.mode !== 'refill') this.mode = 'boss';
    // ---- where to go
    this.goalTimer -= dt; this.repath -= dt;
    const evading = th.level > 0.2 && !(th.beam && a.groundTeam === 1);   // in own ink under a sweep: just dive
    if (evading && (this.evadeT <= 0 || !this.path)) { this._bossEvade(boss, th); this.evadeT = 0.45; }
    else if (!evading && this._wasEvading) { this.path = null; this.goalTimer = 0; }
    this._wasEvading = evading;
    if (!evading) {
      if (this.mode === 'refill') { if (this.repath <= 0 || !this.path) this._pickRefill(); }
      else if (this.goalTimer <= 0 || !this.path || this.pi >= this.path.length || (boss.stunned && !this._rushing)) this._bossGoal(boss);
    }
    const move = this._steer(dt);
    let wantMove = move.lengthSq() > 0.01;
    // ---- aim + fire
    let wantYaw = wantMove ? Math.atan2(move.x, move.z) : a.yaw, wantPitch = -0.1, aimDist = 6;
    const T = this.bTgt;
    const dive = th.beam && a.groundTeam === 1;   // submerged in own ink: the beam passes over
    this.target = null;
    if (T && this.mode === 'boss' && !dive) {
      const tp = T.shape ? T.shape.pos : T.pos;
      _v.set(tp.x, tp.y, tp.z);
      _v2.copy(_v); _v2.x -= a.pos.x; _v2.y -= a.pos.y + 1.1; _v2.z -= a.pos.z;
      const dist = Math.hypot(_v2.x, _v2.z);
      T.dist = dist;
      const idealYaw = Math.atan2(_v2.x, _v2.z), idealPitch = Math.atan2(_v2.y, dist);
      aimDist = _v2.length();
      const e = this.diff.aimError * 0.8;
      const acq = Math.exp(-this.acqT / Math.max(0.12, this.diff.reaction * 0.9));
      const wander = (x) => Math.sin(x) * 0.6 + Math.sin(x * 2.27 + 1.3) * 0.4;
      wantYaw = idealYaw + e * (0.75 * wander(this.t * 1.7 + this.ph1) + 2.4 * acq * this.acqSignY);
      wantPitch = idealPitch + e * 0.6 * (0.75 * wander(this.t * 2.1 + this.ph2) + 1.6 * acq * this.acqSignP);
      this.target = T;
      const range = this._range() + (T.crab ? 0 : T.rad * 0.6);
      const inRange = dist < range * (w.kind === 'charger' ? 1.0 : 1.05);
      // circle-strafe a little while holding position (a squad that stands still gets slammed)
      if (!wantMove && !th.level && w.kind !== 'charger') {
        if (this.strafeT <= 0) { this.strafeT = 0.8 + Math.random() * 1.4; this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeAmp = 0.35 + Math.random() * 0.4; }
        this.strafeS += (this.strafe * this.strafeAmp - this.strafeS) * (1 - Math.exp(-4 * dt));
        const nx = _v2.x / Math.max(dist, 0.01), nz = _v2.z / Math.max(dist, 0.01);
        move.set(-nz * this.strafeS, 0, nx * this.strafeS);
        if (dist < 4) move.x -= nx * 0.6, move.z -= nz * 0.6;   // not right under its claws
        wantMove = move.lengthSq() > 0.01;
      }
      const off = Math.hypot(angleDiff(this.aimYaw, idealYaw), this.aimPitch - idealPitch);
      const tol = Math.max(0.05, Math.atan2(T.rad, Math.max(dist, 0.5))) * (this._firing ? 2.4 : 1.5);
      this._firing = false;
      if (inRange && T.los && off < tol && this.react <= 0 && inkFrac > 0.02) {
        const wr = a.weaponRunner;
        if (w.kind === 'charger') { it.fire = !(wr.charging && wr.charge >= this.chargeRelease); if (wr.charging) move.multiplyScalar(0.3); }
        else if (w.kind === 'splatling') { it.fire = !wr.streaming && !(wr.charging && wr.charge >= this.chargeRelease * 0.9); if (wr.charging) move.multiplyScalar(0.45); }
        else if (w.kind === 'spinner') { it.fire = wr.burstT <= 0 && !(wr.charging && wr.charge >= this.chargeRelease); if (wr.charging) move.multiplyScalar(0.6); }
        // hold-to-charge kits: the bow draws to the release point; the Cutlass charges its heavy cut to full (its runner
        // never sets .charging, only .charge) and lets go
        else if (w.kind === 'bow') it.fire = !(wr.charging && wr.charge >= Math.max(0.5, this.chargeRelease));
        else if (w.kind === 'blade') it.fire = !(wr.charge >= 0.98);
        // Brolly: pump the trigger (holding it would unfold the canopy, then launch it)
        else if (w.kind === 'brolly') { it.fire = !this._pump; this._pump = it.fire; }
        else if (w.kind === 'roller') it.fire = dist < 5.5 || (wr.rolling && dist < 8);
        else it.fire = true;
        this._firing = it.fire;
        this.mode = 'fight';   // (the aim spring's combat stiffness while shooting; reset each frame)
        if (this.bombCd <= 0 && !T.crab && a.ink > SUB.bomb.inkCost + 10 && dist > 5 && dist < 13 && Math.random() < 0.025) { it.sub = true; this.bombCd = 6 + Math.random() * 6; this._bombAim = true; }
      } else if ((w.kind === 'charger' || w.kind === 'splatling' || w.kind === 'spinner' || w.kind === 'bow') && a.weaponRunner.charging && T.los) it.fire = true;   // hold a charge through a blink
      // specials: slam from under its claws, the storm cloud onto it
      if (a.specialReady() && !th.level && !T.crab) {
        if (w.special === 'slam' && dist < 5.5) it.special = true;
        if (w.special === 'storm' && dist < 13 && T.los) it.special = true;
      }
    }
    // ---- not shooting it: clean boss ink off the way (and rollers roll it up)
    if (!it.fire && this.mode !== 'refill' && !dive && inkFrac > 0.15) {
      const aheadYaw = wantMove ? Math.atan2(move.x, move.z) : a.yaw;
      const st = G.paint.regionStats(a.pos.x + Math.sin(aheadYaw) * 3, a.pos.y, a.pos.z + Math.cos(aheadYaw) * 3, 2.5, a.team, _stats);
      if (a.groundTeam === 2 || (st.n && st.enemy > 0.2)) {
        this.sweep += dt * 2.1;
        if (this.mode !== 'fight') { wantYaw = aheadYaw + (w.kind === 'roller' ? 0 : Math.sin(this.sweep) * 0.5); wantPitch = w.kind === 'charger' ? -0.12 : w.kind === 'blaster' ? -0.28 : -0.42; }
        it.fire = w.kind === 'roller' ? wantMove : w.kind !== 'charger' && w.kind !== 'splatling' ? true : !a.weaponRunner.charging || a.weaponRunner.charge < 0.6;
      }
    }
    if (this.mode === 'refill') {
      it.squid = a.groundTeam === 1 || this._pathRemaining() > 2;
      if (a.groundTeam !== 1 && this._pathRemaining() < 1.5 && inkFrac > 0.03) { it.squid = false; it.fire = true; wantPitch = -1.0; }
    }
    // ---- dodges: hop the shockwave, dive under the sweep, swim when travelling through own ink
    if (th.ringIn >= 0 && th.ringIn < 0.2 && a.grounded && this.jumpCd <= 0 && !this.hopMiss) { it.jump = true; this.jumpCd = 0.5; }
    if (dive) { it.squid = true; it.fire = false; }
    else if (!it.fire && !a.weaponRunner.charging && a.groundTeam === 1 && (this._pathRemaining() > 4 || evading)) it.squid = true;
    if (!wantMove && !it.fire && a.groundTeam !== 1) it.squid = false;
    this._tail(dt, move, wantYaw, wantPitch, aimDist, wantMove);
    if (this.mode === 'fight') this.mode = 'boss';
  }

  // what to shoot: a crablet that's closing in, else the part of the boss worth hitting that it can see
  _bossPerceive(boss) {
    const a = this.a, eye = _v3.copy(a.pos); eye.y += 1.2;
    let T = null;
    for (const c of boss.crabs.values()) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - a.pos.x, c.z - a.pos.z);
      if (d > 9 || (T && d >= T.dist)) continue;
      if (!G.physics.los(eye, _v.set(c.x, c.y + 0.35, c.z))) continue;
      T = { crab: c, pos: new THREE.Vector3(c.x, c.y + 0.35, c.z), rad: 0.5, dist: d, los: true };
    }
    if (T) { T.pos.set(T.crab.x, T.crab.y + 0.35, T.crab.z); }
    else if (boss.visible && !boss.dead) {
      // keep a chosen spot for a while; the belly (when open) and the eyes are worth 2.5×
      this.shapeT = (this.shapeT || 0) - 0.2;
      const shapes = boss.model.hitShapes.filter((h) => h.active);
      const belly = shapes.find((h) => h.weak && h.socket === 'belly');
      let pick = this.bTgt && !this.bTgt.crab && this.shapeT > 0 && this.bTgt.shape.active ? this.bTgt.shape : null;
      if (belly && pick !== belly) pick = null;
      if (!pick) {
        this.shapeT = 1.2 + Math.random() * 1.5;
        const eyes = this.a.weapon.kind === 'charger' || Math.random() < 0.25 + this.diff.fireDiscipline * 0.3;
        const order = shapes.slice().sort((h1, h2) => {
          const s = (h) => (h === belly ? -100 : h.weak && eyes ? -50 : h.weak ? 10 : 0) + h.pos.distanceTo(eye);
          return s(h1) - s(h2);
        });
        for (const h of order) if (G.physics.los(eye, h.pos)) { pick = h; break; }
        if (!pick) pick = order.find((h) => !h.weak) || null;
      }
      if (pick) {
        const los = G.physics.los(eye, pick.pos);
        T = this.bTgt && this.bTgt.shape === pick ? this.bTgt : { shape: pick, rad: pick.r * 0.85, weak: pick.weak, dist: pick.pos.distanceTo(a.pos) };
        T.los = los;
      }
    }
    const prev = this.bTgt;
    if (T && (!prev || (prev.shape || prev.crab) !== (T.shape || T.crab))) {
      this.react = this.diff.reaction * (0.6 + Math.random() * 0.5);
      this.acqT = 0; this.acqSignY = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5); this.acqSignP = (Math.random() - 0.5) * 1.2;
    }
    this.bTgt = T;
  }

  // a spot to fight from: weapon range off its flank (not in front of it — slams, sweeps and charges go that way), clear
  // of the other bots, seeing it. When it's stunned everyone rushes the belly.
  _bossGoal(boss) {
    const a = this.a, w = a.weapon, nav = G.nav;
    this.goalTimer = 2.4 + Math.random() * 2;
    const stunned = boss.stunned || (boss.phase >= 3 && Math.random() < 0.3);
    this._rushing = boss.stunned;
    const fwd = boss.yaw, bx = boss.pos.x, bz = boss.pos.z;
    // rollers keep the squad's routes clean while the boss isn't open
    if (w.kind === 'roller' && !boss.stunned) {
      let bestP = null, bs = 0.25;
      for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI * 2, r = 3 + Math.random() * 12;
        _v.set(a.pos.x + Math.cos(ang) * r, a.pos.y, a.pos.z + Math.sin(ang) * r);
        const st = G.paint.regionStats(_v.x, _v.y, _v.z, 2.2, a.team, _stats);
        if (!st.n || boss.hz.threat(_v.x, _v.y, _v.z, 1.5).level > 0) continue;
        const sc = st.enemy - r * 0.02;
        if (sc > bs) { bs = sc; bestP = _v.clone(); }
      }
      if (bestP && Math.random() < 0.7) { this._pathTo(bestP, 0.4); return; }
    }
    const reach = w.kind === 'charger' ? 15 : w.kind === 'roller' ? 3.2 : clamp(this._range() * 0.7, 4.5, 11);
    const R = 3.4 + (boss.stunned ? Math.min(reach, 6) : reach);
    const mates = G.actors.filter((o) => o !== a && o.bot && o.alive && o.bot.goal >= 0);
    let best = -1, bs = -Infinity;
    for (let i = 0; i < 12; i++) {
      // bearing: its front when it's open (belly), else a flank or the rear
      const off = stunned ? (Math.random() - 0.5) * 1.3 : (Math.random() < 0.5 ? 1 : -1) * (0.95 + Math.random() * 1.9);
      const ang = fwd + off, r = R * (0.85 + Math.random() * 0.3);
      _v.set(bx + Math.sin(ang) * r, boss.pos.y + 0.5, bz + Math.cos(ang) * r);
      const id = nav.nearest(_v, 2.5);
      if (id < 0) continue;
      const n = nav.nodes[id];
      if (Math.hypot(n.x - _v.x, n.z - _v.z) > 2.5) continue;
      let s = -Math.hypot(n.x - a.pos.x, n.z - a.pos.z) * 0.08 + Math.random();
      if (boss.hz.threat(n.x, n.y, n.z, 1.5).level > 0) s -= 6;
      if (G.physics.los(_v2.set(n.x, n.y + 1.3, n.z), _v3.set(bx, boss.pos.y + 2.5, bz))) s += 3;
      for (const m of mates) { const g = nav.nodes[m.bot.goal]; if (Math.hypot(g.x - n.x, g.z - n.z) < 4) s -= 2.5; }
      if (s > bs) { bs = s; best = id; }
    }
    if (best < 0) { this.path = null; return; }
    const n = nav.nodes[best];
    this._pathTo(_v.set(n.x, n.y, n.z), 1.0);
  }

  // out of a telegraph: the reachable spot nearby with the least danger, biased along the escape direction
  _bossEvade(boss, th) {
    const a = this.a, nav = G.nav;
    let best = -1, bs = -Infinity;
    for (let i = 0; i < 12; i++) {
      const ang = Math.atan2(th.ax, th.az) + (Math.random() - 0.5) * 2.4, r = 3 + Math.random() * 5;
      _v.set(a.pos.x + Math.sin(ang) * r, a.pos.y, a.pos.z + Math.cos(ang) * r);
      const id = nav.nearest(_v, 1.2);
      if (id < 0) continue;
      const n = nav.nodes[id];
      const t = boss.hz.threat(n.x, n.y, n.z, 1.6);
      const s = -t.level * 8 - Math.hypot(n.x - a.pos.x, n.z - a.pos.z) * 0.25 + (Math.sin(ang) * th.ax + Math.cos(ang) * th.az) * 1.5 + Math.random() * 0.5;
      if (s > bs) { bs = s; best = id; }
    }
    if (best < 0) return;
    const n = nav.nodes[best];
    this._pathTo(_v.set(n.x, n.y, n.z), 1.0);
    this.goalTimer = 0.8;
  }
}
