// Global game context + tiny event bus. Modules read shared systems off G lazily (G.paint, G.physics, ...).
export const G = {
  renderer: null, scene: null, camera: null,
  settings: null, quality: null,
  level: null, paint: null, physics: null, fx: null, env: null,
  audio: null, music: null, hud: null, menus: null, input: null,
  match: null, actors: [], local: null, projectiles: null,
  teamColors: [null, null],      // THREE.Color (linear) per team
  teamHex: ['#ff8a14', '#2f5bff'],
  time: 0,
  mode: 'boot',                  // 'boot' | 'menu' | 'match'
};

const listeners = new Map();
export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => listeners.get(name)?.delete(fn);
}
export function emit(name, payload) {
  const set = listeners.get(name);
  if (!set) return;
  for (const fn of set) fn(payload);
}

// ---- small math helpers shared by core modules ----
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
export function dampAngle(a, b, lambda, dt) { return a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt)); }

// Seeded RNG (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
