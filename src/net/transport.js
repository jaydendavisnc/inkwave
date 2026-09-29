// WebSocket link to the room relay (server/src/index.js). Game payloads travel as raw JSON strings wrapped in a tiny
// envelope the relay never parses: "b|<json>" broadcast, "s|<to>|<json>" to one member; incoming "m|<from>|<json>".
// Control frames are JSON objects (welcome / join / leave / err / pong).

export const PROTO = 1;

// Where the relay lives. ?relay=… wins (an absolute URL, the override). The deployed site and `wrangler dev` are this
// page's own origin: one Worker serves the files and the rooms, so the socket is the relative path `/room/…` and the
// browser picks ws or wss from the page. `npm start` is a static server with no sockets, so a local or LAN page on
// any port other than 8787 falls back to the absolute sidecar address ws://<host>:8787.
export function relayURL() {
  const q = new URLSearchParams(location.search).get('relay');
  if (q) return q.replace(/\/$/, '');
  const h = location.hostname;
  const local = h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h) || h.endsWith('.local');
  if (local && location.port !== '8787') return `ws://${h}:8787`;
  return '';
}

// Debug: simulate a real connection on localhost — ?netlag=ms (extra one-way delay on everything received),
// &netjitter=ms (random extra, delivered in order like TCP: late packets bunch up) and &netspike=p (chance per
// message of a 250 ms Wi-Fi hiccup that holds everything behind it).
const SIM = (() => {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const lag = +q.get('netlag') || 0, jit = +q.get('netjitter') || 0, spike = +q.get('netspike') || 0;
  return lag || jit || spike ? { lag, jit, spike, last: 0 } : null;
})();

export class Transport {
  constructor() {
    this.ws = null;
    this.id = null;
    this.onControl = null;   // (obj) => void   welcome / join / leave
    this.onMessage = null;   // (from, obj) => void
    this.onClose = null;     // (reason) => void
    this.rtt = 0;            // smoothed round trip to the relay, ms
    this._pingT = null; this._pingSent = 0;
    this.bytesIn = 0; this.bytesOut = 0;
  }

  /** Resolves with the welcome frame, rejects with an Error carrying a player-facing message. */
  connect(code, name, create) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
      const url = `${relayURL()}/room/${encodeURIComponent(code)}?name=${encodeURIComponent(name)}&v=${PROTO}${create ? '&create=1' : ''}`;
      let ws;
      try { ws = new WebSocket(url); } catch { reject(new Error('Could not connect')); return; }
      this.ws = ws;
      const timer = setTimeout(() => { done(reject, new Error('Could not connect')); try { ws.close(); } catch { /* ignore */ } }, 8000);
      const handle = (ev) => {
        const s = typeof ev.data === 'string' ? ev.data : '';
        this.bytesIn += s.length;
        if (s === 'pong') {   // answered by the relay runtime itself (it doubles as our liveness signal there)
          if (this._pingSent) { const r = performance.now() - this._pingSent; this._pingSent = 0; this.rtt = this.rtt ? this.rtt + (r - this.rtt) * 0.3 : r; }
          return;
        }
        if (s.charCodeAt(0) === 109 && s.charCodeAt(1) === 124) {            // "m|from|json"
          const k = s.indexOf('|', 2);
          let obj; try { obj = JSON.parse(s.slice(k + 1)); } catch { return; }
          this.onMessage?.(s.slice(2, k), obj);
          return;
        }
        let o; try { o = JSON.parse(s); } catch { return; }
        if (o.t === 'err') { done(reject, new Error(o.e || 'Could not connect')); return; }
        if (o.t === 'pong') { const r = performance.now() - o.c; this.rtt = this.rtt ? this.rtt + (r - this.rtt) * 0.3 : r; return; }
        if (o.t === 'welcome') { this.id = o.id; this._startPing(); done(resolve, o); }
        this.onControl?.(o);
      };
      ws.onmessage = !SIM ? handle : (ev) => {
        const t = Math.max(performance.now() + SIM.lag + Math.random() * SIM.jit + (Math.random() < SIM.spike ? 250 : 0), SIM.last);
        SIM.last = t;
        setTimeout(() => { if (this.ws === ws) handle(ev); }, t - performance.now());
      };
      ws.onclose = (ev) => {
        this._stopPing();
        if (!settled) { done(reject, new Error(ev.reason || 'Could not connect')); return; }
        this.onClose?.(ev.reason || 'Disconnected');
      };
      ws.onerror = () => { if (!settled) done(reject, new Error('Could not connect')); };
    });
  }

  _startPing() {
    this._stopPing();
    const ping = () => {
      if (!this._pingSent) this._pingSent = performance.now();   // time the oldest unanswered one (pongs come in order)
      this._raw('ping');                                          // always sent: the relay reads silence as a dead link
    };
    ping();
    this._pingT = setInterval(ping, 2000);
  }
  _stopPing() { if (this._pingT) clearInterval(this._pingT); this._pingT = null; }

  _raw(s) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    this.bytesOut += s.length;
    ws.send(s);
    return true;
  }
  broadcast(obj) { return this._raw('b|' + JSON.stringify(obj)); }
  sendTo(id, obj) { return this._raw('s|' + id + '|' + JSON.stringify(obj)); }
  lock(v) { return this._raw(JSON.stringify({ t: 'lock', v: !!v })); }
  get open() { return !!this.ws && this.ws.readyState === 1; }

  close() {
    this._stopPing();
    const ws = this.ws; this.ws = null;
    if (ws) { ws.onclose = null; try { ws.close(1000, 'bye'); } catch { /* ignore */ } }
  }
}
