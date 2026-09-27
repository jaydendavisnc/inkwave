// INKWAVE UI — tiny DOM / colour / motion helpers shared by menus.js and hud.js.
// Pure DOM; no three.js dependency.

// ---------------------------------------------------------------- DOM
export function h(tag, props = null, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') {
        if (typeof v === 'string') el.style.cssText = v;
        else for (const s in v) { if (s.startsWith('--')) el.style.setProperty(s, v[s]); else el.style[s] = v[s]; }
      } else if (k === 'data') { for (const d in v) el.dataset[d] = v[d]; }
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  appendKids(el, kids);
  return el;
}
function appendKids(el, kids) {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) appendKids(el, c);
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}
/** Parse an HTML/SVG string into its first element. */
export function frag(markup) {
  const t = document.createElement('template');
  t.innerHTML = String(markup).trim();
  return t.content.firstElementChild;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Restart a CSS animation on an element by toggling a class across a reflow. */
export function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // eslint-disable-line no-void
  el.classList.add(cls);
}

// ---------------------------------------------------------------- maths
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Critically-under-damped spring (gives the bouncy overshoot used by the focus cursor etc.). */
export class Spring {
  constructor(value = 0, stiffness = 260, damping = 20) {
    this.x = value; this.v = 0; this.target = value; this.k = stiffness; this.c = damping;
  }
  step(dt) {
    const n = Math.min(8, Math.max(1, Math.ceil(dt / (1 / 120))));
    const hh = Math.min(dt, 0.1) / n;
    for (let i = 0; i < n; i++) {
      const a = this.k * (this.target - this.x) - this.c * this.v;
      this.v += a * hh; this.x += this.v * hh;
    }
    return this.x;
  }
  snap(v = this.target) { this.x = this.target = v; this.v = 0; }
  get settled() { return Math.abs(this.target - this.x) < 0.02 && Math.abs(this.v) < 0.02; }
}

// ---------------------------------------------------------------- colour
/** Accepts '#rrggbb', '#rgb', 0xRRGGBB, THREE.Color-like ({r,g,b} 0..1 or getHexString()). */
export function toHex(c, fallback = '#ff8a14') {
  if (c == null) return fallback;
  if (typeof c === 'string') {
    if (c[0] === '#') return c.length === 4 ? '#' + c.slice(1).split('').map((x) => x + x).join('') : c.slice(0, 7);
    return c;
  }
  if (typeof c === 'number') return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
  if (typeof c.getHexString === 'function') return '#' + c.getHexString();
  if (typeof c.r === 'number') return rgbToHex(c.r * 255, c.g * 255, c.b * 255);
  return fallback;
}
export function hexToRgb(hex) {
  let s = toHex(hex).replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r, g, b) {
  const f = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
/** t < 0 darkens toward ink-black, t > 0 lightens toward white. */
export const shade = (hex, t) => (t < 0 ? mix(hex, '#120e1c', -t) : mix(hex, '#ffffff', t));
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Text colour to put on top of a fill (black on light inks, white on dark ones). */
export const inkOn = (hex) => (luminance(hex) > 0.36 ? '#15121c' : '#ffffff');
export function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

/** Writes --name, --name-rgb, --name-dark, --name-deep, --name-light, --name-ink onto an element. */
export function colorVars(el, name, color) {
  const hex = toHex(color);
  const s = el.style;
  s.setProperty(`--${name}`, hex);
  s.setProperty(`--${name}-rgb`, hexToRgb(hex).join(','));
  s.setProperty(`--${name}-dark`, shade(hex, -0.32));
  s.setProperty(`--${name}-deep`, shade(hex, -0.62));
  s.setProperty(`--${name}-light`, shade(hex, 0.45));
  s.setProperty(`--${name}-ink`, inkOn(hex));
  return hex;
}

// ---------------------------------------------------------------- shapes
const f1 = (v) => Math.round(v * 10) / 10;
/** Smooth closed curve through points (Catmull-Rom → cubic Bézier) as an SVG path string. */
export function closedCurve(pts, tension = 1) {
  const n = pts.length;
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension, c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension, c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension;
    d += `C${f1(c1x)} ${f1(c1y)} ${f1(c2x)} ${f1(c2y)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d + 'Z';
}
/** Organic wobbly blob. */
export function blobPath(cx, cy, r, { points = 9, wobble = 0.16, seed = 1, sx = 1, sy = 1 } = {}) {
  const R = rng(seed);
  const pts = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 + (R() - 0.5) * (Math.PI / points) * 0.8;
    const rr = r * (1 + (R() * 2 - 1) * wobble);
    pts.push([cx + Math.cos(a) * rr * sx, cy + Math.sin(a) * rr * sy]);
  }
  return closedCurve(pts);
}
/** Ink splat: lumpy core with rounded, bulb-tipped arms + satellite droplets. Returns { core, drops:[{x,y,r}] }. */
export function splatShape(cx, cy, r, { arms = 9, seed = 7, armLen = 0.42, drops = 6 } = {}) {
  const R = rng(seed);
  const TAU = Math.PI * 2, step = TAU / arms;
  const P = (a, d) => [cx + Math.cos(a) * d, cy + Math.sin(a) * d];
  const pts = [];
  const armDirs = [];
  const rot = R() * TAU;
  for (let i = 0; i < arms; i++) {
    const a0 = rot + i * step + (R() - 0.5) * step * 0.25;
    pts.push(P(a0, r * (0.8 + R() * 0.1)));                       // valley
    const big = R() < 0.62;
    const L = big ? r * (1 + armLen * (0.55 + R() * 0.75)) : r * (0.98 + R() * 0.1);
    const am = a0 + step * (0.45 + (R() - 0.5) * 0.2);
    armDirs.push([am, L]);
    if (big) {
      const neck = step * (0.12 + R() * 0.05), bulb = step * (0.2 + R() * 0.08);
      pts.push(P(am - neck, r * 0.98 + (L - r) * 0.35));           // neck
      pts.push(P(am - bulb * 0.9, L * 0.96));                       // bulb side
      pts.push(P(am, L * 1.02));                                    // tip
      pts.push(P(am + bulb * 0.9, L * 0.96));
      pts.push(P(am + neck, r * 0.98 + (L - r) * 0.35));
    } else {
      pts.push(P(am, L));
    }
  }
  const ds = [];
  for (let i = 0; i < drops; i++) {
    const [am, L] = armDirs[Math.floor(R() * armDirs.length)];
    const a = am + (R() - 0.5) * step * 0.5;
    const d = Math.max(L, r * 1.1) + r * (0.22 + R() * 0.45);
    ds.push({ x: f1(cx + Math.cos(a) * d), y: f1(cy + Math.sin(a) * d), r: f1(r * (0.06 + R() * 0.1)) });
  }
  return { core: closedCurve(pts, 1), drops: ds };
}
/** SVG markup for a splat filled with `cls` (css class) or explicit fill. */
export function splatSVG({ seed = 7, cls = 'iw-fa', fill = null, viewBox = 200, r = 58, arms = 9, drops = 7, extra = '' } = {}) {
  const c = viewBox / 2;
  const s = splatShape(c, c, r, { seed, arms, drops });
  const fa = fill ? `fill="${fill}"` : `class="${cls}"`;
  return `<svg viewBox="0 0 ${viewBox} ${viewBox}" aria-hidden="true" ${extra}><path ${fa} d="${s.core}"/>${s.drops
    .map((d) => `<circle ${fa} cx="${d.x}" cy="${d.y}" r="${d.r}"/>`).join('')}</svg>`;
}

// ---------------------------------------------------------------- text
export function fmtTime(s) {
  const t = Math.max(0, Math.ceil(s - 1e-6));
  const m = Math.floor(t / 60), ss = t % 60;
  return `${m}:${ss < 10 ? '0' : ''}${ss}`;
}
const NF = new Intl.NumberFormat('en-US');
export const fmtInt = (n) => NF.format(Math.round(n));
/** Normalises a percentage that may be supplied as 0..1 or 0..100. */
export function pct(a, b) {
  const both = [a, b].map((v) => +v || 0);
  if (both[0] <= 1.0001 && both[1] <= 1.0001) return both.map((v) => v * 100);
  return both;
}

// ---------------------------------------------------------------- misc
export const now = () => performance.now() / 1000;
export function safeCall(fn, ...args) { try { return fn?.(...args); } catch (e) { console.error('[ui]', e); return undefined; } }
export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
