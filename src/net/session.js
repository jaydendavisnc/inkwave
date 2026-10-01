// Online session: rooms, the lobby and match orchestration (contract: docs/NET.md). Exposed as G.net.
//
// The host (the room's oldest member, elected by the relay) owns the lobby: players send their own changes to the
// host, the host validates them (team balance, host-only settings) and broadcasts the whole lobby. Starting a match
// sends one roster to everyone; every client builds the stage, reports ready, and the host says go — so intros start
// together. In the match NetMatch (netmatch.js) does the replication.
import { G, emit } from '../core/ctx.js';
import { MAPS, WEAPONS, WEAPON_ORDER, SUBS, SUB_ORDER, SPECIALS, SPECIAL_ORDER, MATCH, ZONES, TOWER, BOT_NAMES, TEAM_PALETTES, mapNoBots, mapBossOk, bossFallbackMap, noBotsStartBlock } from '../config.js';
import { randomStyle } from '../game/character-style.js';
import { Transport } from './transport.js';
import { NetMatch } from './netmatch.js';

// no 0/O or 1/I (misread), and no W/A/S/D: those move the menu cursor, so any other key typed on the online hub can
// only mean a room code (28⁵ ≈ 17 M codes)
const CODE_CHARS = 'BCEFGHJKLMNPQRTUVXYZ23456789';
const TEAM = 4;
// a loadout's sub / special: a known id, or null (= the weapon's own)
const subOf = (id) => (SUBS[id] ? id : null), specialOf = (id) => (SPECIALS[id] ? id : null);

export class NetSession {
  constructor() {
    this.state = 'offline';
    this.code = null;
    this.myId = null;
    this.hostId = null;
    this.error = null;
    this.lobby = this._blankLobby();
    this._subs = new Map();
    this.tr = null;
    this.match = null;          // NetMatch while playing
    this._members = new Map();  // relay membership (id → name), authoritative for who is connected
    this._startCfg = null;
    this._botsPref = null;      // host: the "fill with bots" choice, kept while a humans-only stage forces bots off
  }

  get isHost() { return !!this.myId && this.myId === this.hostId; }
  get active() { return this.state === 'match' && !!this.match; }

  // ------------------------------------------------------------------ events
  on(ev, fn) {
    let s = this._subs.get(ev);
    if (!s) this._subs.set(ev, (s = new Set()));
    s.add(fn);
    return () => s.delete(fn);
  }
  _emit(ev, data) {
    const s = this._subs.get(ev);
    if (s) for (const fn of [...s]) { try { fn(data); } catch (e) { console.error('[net]', ev, e); } }
  }
  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    this._emit('state', { state: s });
  }

  _blankLobby() {
    const g = G.game;
    // palette: the room's team colours (index into TEAM_PALETTES) — the host's current menu colours carry into the room
    // mode: 'turf' | 'zones' (Zone Control: the host runs the rules — zones.js) | 'tower' (Tower Command: likewise —
    // tower.js) | 'boss' (Boss Battle: everyone is one squad vs HULLBREAKER — docs/BOSS.md)
    const map = g?.mapDef?.id || MAPS[0].id;
    return { map, time: g?.time || 'day', duration: g?.settings?.matchLength || MATCH.defaultDuration, bots: !mapNoBots(map), difficulty: g?.settings?.difficulty || 'normal', palette: g?.paletteIndex?.() ?? 0, mode: 'turf', players: [], maxPlayers: TEAM * 2 };
  }

  _profile() {
    const p = G.game?.profile || {};
    return { name: (p.name || 'Player').slice(0, 16), weapon: WEAPONS[p.weapon] ? p.weapon : 'shooter', sub: subOf(p.sub), special: specialOf(p.special), style: p.style || null };
  }

  // ------------------------------------------------------------------ rooms
  async create(name) {
    let lastErr = null;
    for (let tries = 0; tries < 4; tries++) {
      const code = Array.from({ length: 5 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
      try { await this._connect(code, name, true); return code; } catch (e) { lastErr = e; if (e.message !== 'Room code taken') break; }
    }
    this._fail(lastErr);
    throw lastErr;
  }

  async join(code, name) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) { const e = new Error('Room not found'); this._fail(e); throw e; }
    try { await this._connect(code, name, false); } catch (e) { this._fail(e); throw e; }
  }

  async _connect(code, name, create) {
    this.leave(true);
    this.error = null;
    this._setState('connecting');
    const tr = (this.tr = new Transport());
    tr.onControl = (o) => this._control(o);
    tr.onMessage = (from, d) => this._message(from, d);
    tr.onClose = (reason) => this._closed(reason);
    const me = this._profile();
    const welcome = await tr.connect(code, name || me.name, create);
    this.code = code;
    this.myId = welcome.id;
    this.hostId = welcome.host;
    this._members.clear();
    for (const m of welcome.members) this._members.set(m.id, m.name);
    this.lobby = this._blankLobby();
    this._botsPref = this.isHost ? true : null;   // a new room fills with bots unless its stage forbids them
    if (this.isHost) {
      this.lobby.players = [this._newPlayer(this.myId, name || me.name, { weapon: me.weapon, sub: me.sub, special: me.special, style: me.style })];
      this._fixTeams();
    }
    this._setState('lobby');
    // tell the host who we are (the host already knows itself)
    if (!this.isHost) tr.sendTo(this.hostId, { k: 'me', name: name || me.name, weapon: me.weapon, sub: me.sub, special: me.special, style: me.style });
    this._pushLobby();
  }

  leave(silent = false) {
    this.match?.dispose(); this.match = null;
    this.tr?.close(); this.tr = null;
    const was = this.state;
    this.code = null; this.myId = null; this.hostId = null;
    this._members.clear();
    this.lobby = this._blankLobby();
    this._startCfg = null;
    if (!silent && was !== 'offline') { this._setState('offline'); this._emit('lobby', { lobby: this.lobby }); }
    else this.state = 'offline';
  }

  _fail(e) {
    this.error = e?.message || 'Could not connect';
    this.tr?.close(); this.tr = null;
    this._setState('error');
    this._emit('error', { message: this.error });
  }

  _closed(reason) {
    const inMatch = this.state === 'match' || this.state === 'starting';
    this.error = reason === 'bye' ? null : 'Lost connection to the room';
    this.match?.dispose(); this.match = null;
    this.tr = null;
    this.code = null;
    this._setState(this.error ? 'error' : 'offline');
    if (this.error) this._emit('error', { message: this.error });
    if (inMatch) G.game?.netMatchAborted?.(this.error);
  }

  // ------------------------------------------------------------------ relay membership
  _control(o) {
    if (o.t === 'join') {
      this._members.set(o.m.id, o.m.name);
      if (this.isHost) {
        this.lobby.players.push(this._newPlayer(o.m.id, o.m.name, {}));
        this._fixTeams();
        this._broadcastLobby();
      }
    } else if (o.t === 'leave') {
      const gone = this.lobby.players.find((p) => p.id === o.id) || { id: o.id, name: this._members.get(o.id) || 'Player' };
      this._members.delete(o.id);
      const hostChanged = o.host && o.host !== this.hostId;
      this.hostId = o.host;
      this.lobby.players = this.lobby.players.filter((p) => p.id !== o.id);
      for (const p of this.lobby.players) p.host = p.id === this.hostId;
      this.match?.onLeave(o.id, hostChanged);
      if (hostChanged) this._emit('host', { hostId: this.hostId });
      if (this.isHost) { this._fixTeams(); this._broadcastLobby(); }
      this._emit('leave', { player: gone, reason: 'left' });
      this._pushLobby();
    }
  }

  _newPlayer(id, name, o) {
    return { id, name: (name || 'Player').slice(0, 16), team: 'auto', weapon: WEAPONS[o.weapon] ? o.weapon : 'shooter', sub: subOf(o.sub), special: specialOf(o.special), style: o.style || randomStyle(), ready: false, host: id === this.hostId, ping: 0 };
  }

  // host: honour team requests while keeping ≤ 4 a side, then place everyone still on 'auto' on the smaller side
  _fixTeams() {
    const ps = this.lobby.players;
    const count = [0, 0];
    for (const p of ps) if (p.team === 0 || p.team === 1) { if (count[p.team] < TEAM) count[p.team]++; else p.team = 'auto'; }
    for (const p of ps) if (p.team === 'auto') { const t = count[0] <= count[1] ? 0 : 1; p.team = t; count[t]++; }
    for (const p of ps) p.host = p.id === this.hostId;
  }

  _broadcastLobby() {
    if (!this.isHost || !this.tr) return;
    this.tr.broadcast({ k: 'lobby', l: this._wireLobby() });
    this._pushLobby();
  }
  _wireLobby() {
    const l = this.lobby;
    return { map: l.map, time: l.time, duration: l.duration, bots: l.bots, difficulty: l.difficulty, palette: l.palette, mode: l.mode, players: l.players.map(({ id, name, team, weapon, sub, special, style, ready, ping }) => ({ id, name, team, weapon, sub, special, style, ready, ping })) };
  }
  // local view: mark you + host
  _pushLobby() {
    for (const p of this.lobby.players) { p.you = p.id === this.myId; p.host = p.id === this.hostId; }
    this._emit('lobby', { lobby: this.lobby });
  }

  // ------------------------------------------------------------------ lobby actions
  setMe(ch = {}) {
    if (!this.tr || !this.myId) return;
    const o = {};
    if (ch.name != null) o.name = String(ch.name).slice(0, 16);
    if (ch.weapon && WEAPONS[ch.weapon]) o.weapon = ch.weapon;
    if (ch.sub !== undefined) o.sub = subOf(ch.sub);
    if (ch.special !== undefined) o.special = specialOf(ch.special);
    if (ch.style) o.style = ch.style;
    if (ch.ready != null) o.ready = !!ch.ready;
    if (ch.team === 0 || ch.team === 1 || ch.team === 'auto') o.team = ch.team;
    if (this.isHost) this._applyMe(this.myId, o);
    else {
      // optimistic local echo for things the host won't refuse
      const me = this.lobby.players.find((p) => p.id === this.myId);
      if (me) { for (const k of ['name', 'weapon', 'sub', 'special', 'style', 'ready']) if (o[k] !== undefined) me[k] = o[k]; this._pushLobby(); }
      this.tr.sendTo(this.hostId, { k: 'me', ...o });
    }
  }

  _applyMe(id, o) {
    const p = this.lobby.players.find((x) => x.id === id);
    if (!p) return;
    if (o.name) p.name = o.name;
    if (o.weapon && WEAPONS[o.weapon]) p.weapon = o.weapon;
    if (o.sub !== undefined) p.sub = subOf(o.sub);
    if (o.special !== undefined) p.special = specialOf(o.special);
    if (o.style) p.style = o.style;
    if (o.ready != null) p.ready = !!o.ready;
    if (o.ping != null) p.ping = Math.round(o.ping);
    if (o.team === 'auto') p.team = 'auto';
    else if (o.team === 0 || o.team === 1) {
      const n = this.lobby.players.filter((x) => x !== p && x.team === o.team).length;
      if (n < TEAM) p.team = o.team;
    }
    this._fixTeams();
    this._broadcastLobby();
  }

  setSettings(s = {}) {
    if (!this.isHost) return;
    const l = this.lobby, wasMap = l.map;
    if (s.map && MAPS.some((m) => m.id === s.map)) l.map = s.map;
    if (s.time === 'day' || s.time === 'dusk') l.time = s.time;
    if (s.duration) l.duration = Math.max(60, Math.min(600, +s.duration | 0));
    if (s.bots != null) this._botsPref = !!s.bots;
    if (s.difficulty && ['easy', 'normal', 'hard'].includes(s.difficulty)) l.difficulty = s.difficulty;
    if (Number.isInteger(s.palette) && s.palette >= 0 && s.palette < TEAM_PALETTES.length) l.palette = s.palette;
    if (s.mode === 'turf' || s.mode === 'zones' || s.mode === 'tower' || s.mode === 'boss') l.mode = s.mode;
    // stage rules (config MAPS flags): a Boss Battle never runs on a noBoss stage — picking one in boss mode is refused,
    // switching a room on one to boss mode moves it to a boss-eligible stage; a noBots stage forces bots off (the host's
    // own choice comes back on the next stage)
    if (l.mode === 'boss' && !mapBossOk(l.map)) l.map = bossFallbackMap(wasMap);
    l.bots = mapNoBots(l.map) ? false : (this._botsPref ?? l.bots);
    this._broadcastLobby();
  }

  canStart() {
    if (!this.isHost || this.state !== 'lobby') return false;
    return !this.startBlock() && this.lobby.players.every((p) => p.ready || p.id === this.myId);
  }
  // why the room can't start regardless of ready-ups (a humans-only stage without 2+ players, one per side), else null
  startBlock() { return noBotsStartBlock(this.lobby); }

  emote(name) {
    if (!this.tr || !this.myId) return;
    this.tr.broadcast({ k: 'emote', n: String(name).slice(0, 16) });
    this._emit('emote', { id: this.myId, name });
  }

  // ------------------------------------------------------------------ match orchestration
  start() {
    if (!this.isHost || this.state !== 'lobby' || !this.tr || this.startBlock()) return false;
    const l = this.lobby;
    const bots = l.bots && !mapNoBots(l.map);   // (a humans-only stage never gets bots, whatever the setting says)
    const roster = [];
    let nid = 0;
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const boss = l.mode === 'boss' && mapBossOk(l.map);   // one squad of up to 8 (all team 0), bots fill the rest
    for (let team = 0; team < (boss ? 1 : 2); team++) {
      const humans = boss ? l.players : l.players.filter((p) => p.team === team);
      const weapons = [...WEAPON_ORDER].sort(() => Math.random() - 0.5);
      let slot = 0;
      for (const p of humans) roster.push({ nid: nid++, owner: p.id, bot: false, team, slot: slot++, name: p.name, weapon: p.weapon, sub: subOf(p.sub), special: specialOf(p.special), style: p.style });
      if (bots) {
        while (slot < (boss ? TEAM * 2 : TEAM)) {
          const used = new Set(roster.filter((r) => r.team === team).map((r) => r.weapon));
          const wpn = weapons.find((w) => !used.has(w)) || weapons[slot % weapons.length];
          // bots carry a random sub / special about half the time, as offline (else their weapon's own)
          const sub = Math.random() < 0.5 ? null : SUB_ORDER[(Math.random() * SUB_ORDER.length) | 0];
          const special = Math.random() < 0.5 ? null : SPECIAL_ORDER[(Math.random() * SPECIAL_ORDER.length) | 0];
          roster.push({ nid: nid++, owner: this.myId, bot: true, team, slot: slot++, name: names.pop() || 'Bot', weapon: wpn, sub, special, style: randomStyle() });
        }
      }
    }
    // (Zone Control and Tower Command always run their own 5:00 + overtime, as offline)
    const mode = boss ? 'boss' : l.mode === 'zones' || l.mode === 'tower' ? l.mode : 'turf';
    const cfg = { k: 'start', roster, map: l.map, time: l.time, duration: mode === 'zones' ? ZONES.duration : mode === 'tower' ? TOWER.duration : l.duration, difficulty: l.difficulty, palette: l.palette, mode, host: this.myId, id: Math.random().toString(36).slice(2, 8) };
    this.tr.lock(true);
    this.tr.broadcast(cfg);
    this._begin(cfg);
    return true;
  }

  async _begin(cfg) {
    this._startCfg = cfg;
    this._ready = new Set();
    for (const p of this.lobby.players) p.ready = false;
    this._setState('starting');
    this._emit('match', { phase: 'start' });
    // the lobby plays its 3·2·1 + super-jump launch first (resolves at once when the lobby isn't on screen)
    try { await G.game?.menus?.launchLobby?.(); } catch (e) { console.warn('[net] launch', e); }
    if (this.state !== 'starting' || this._startCfg !== cfg) return;
    this.match = new NetMatch(this, cfg);
    try {
      await G.game.startNetMatch(cfg, this.match);
    } catch (e) {
      console.error('[net] match start failed', e);
      this._fail(new Error('Could not start the match'));
      return;
    }
    if (this.isHost) this._markReady(this.myId);
    else this.tr?.sendTo(this.hostId, { k: 'ready', id: cfg.id });
  }

  _markReady(id) {
    if (!this.isHost || this.state !== 'starting' || !this._startCfg) return;
    this._ready.add(id);
    const humans = new Set(this._startCfg.roster.filter((r) => !r.bot).map((r) => r.owner));
    for (const h of humans) if (!this._members.has(h) && h !== this.myId) this._ready.add(h);   // left while loading
    const all = [...humans].every((h) => this._ready.has(h));
    if (all) this._go();
    else if (!this._goT) this._goT = setTimeout(() => this._go(), 12000);   // don't hold everyone for one slow load
  }

  _go() {
    clearTimeout(this._goT); this._goT = null;
    if (this.state !== 'starting') return;
    this.tr?.broadcast({ k: 'go', id: this._startCfg.id });
    this._launch();
  }

  _launch() {
    this._setState('match');
    this.match?.go();
    G.game.netMatchGo?.();
  }

  // the match's results have been shown: everyone back to the lobby (the room stays)
  endMatch() {
    this.match?.dispose(); this.match = null;
    this._startCfg = null;
    if (!this.tr) return;
    if (this.isHost) { this.tr.lock(false); for (const p of this.lobby.players) p.ready = false; this._broadcastLobby(); }
    this._setState('lobby');
    this._emit('match', { phase: 'end' });
    this._pushLobby();
  }

  // ------------------------------------------------------------------ incoming payloads
  _message(from, d) {
    if (!d || typeof d !== 'object') return;
    switch (d.k) {
      case 'lobby':
        if (from !== this.hostId) return;
        {
          const l = d.l;
          this.lobby.map = l.map; this.lobby.time = l.time; this.lobby.duration = l.duration; this.lobby.bots = l.bots; this.lobby.difficulty = l.difficulty;
          if (Number.isInteger(l.palette)) this.lobby.palette = l.palette;
          this.lobby.mode = l.mode === 'boss' || l.mode === 'zones' || l.mode === 'tower' ? l.mode : 'turf';
          const prev = new Map(this.lobby.players.map((p) => [p.id, p]));
          this.lobby.players = l.players.map((p) => ({ ...p, host: p.id === this.hostId }));
          for (const p of this.lobby.players) if (!prev.has(p.id)) this._emit('join', { player: p });
          this._pushLobby();
        }
        break;
      case 'me': if (this.isHost) this._applyMe(from, d); break;
      case 'emote': this._emit('emote', { id: from, name: d.n }); break;
      case 'start': if (from === this.hostId && this.state === 'lobby') this._begin(d); break;
      case 'ready': if (this.isHost && this._startCfg && d.id === this._startCfg.id) this._markReady(from); break;
      case 'go': if (from === this.hostId && this.state === 'starting') this._launch(); break;
      default: this.match?.onMessage(from, d);
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    if (this.tr && this.state === 'lobby') {
      this._pingT = (this._pingT || 0) - dt;
      if (this._pingT <= 0) {
        this._pingT = 2;
        const ping = Math.round(this.tr.rtt);
        if (this.isHost) { const me = this.lobby.players.find((p) => p.id === this.myId); if (me && me.ping !== ping) { me.ping = ping; this._broadcastLobby(); } }
        else this.tr.sendTo(this.hostId, { k: 'me', ping });
      }
    }
    this.match?.update(dt);
  }
}

export function installNet() {
  if (!G.net) G.net = new NetSession();   // ?netmock=1 (menus) may already have installed the offline stand-in
  emit('net:ready', { net: G.net });
  return G.net;
}
