// Character style catalog. Everything a squidkid can look like: skin tones, hair styles
// (built by character-geo.js getHairStyle(i)), outfits, eye colours, headgear, brows and named preset looks. The
// Character constructor resolves a style through resolveStyle(); the locker menu lists the same tables.
//
// APPEND-ONLY: never reorder, remove or restyle an existing entry — saved profiles and bots store indices.
// Every table has a parallel *_NAMES list (same length, same order) for the locker UI.
//
// A style is { hair, skin, outfit, eyes, hat, brows }, all integer indices. Missing fields: the original four derive
// from the character's name seed (so rolled bots vary); the newer optional ones (hat, brows) default to 0 = none /
// classic, so looks saved before those fields existed never change. `randomStyle(rng)` rolls a complete look.

// ---- skin: natural tones with deliberate undertones (the skin shader adds warmth/sheen from the base colour) --------
export const SKIN_TONES = [
  '#ffd9c2', // 0 fair, rosy
  '#eab48e', // 1 light warm (freckled)
  '#b37a52', // 2 tan
  '#6e4429', // 3 deep brown
  '#f9e1d3', // 4 porcelain, cool pink undertone
  '#d9a577', // 5 honey, golden undertone
  '#c29a72', // 6 olive, green-gold undertone
  '#8f5a3a', // 7 chestnut, warm red undertone
  '#4a2c20', // 8 ebony, deep cool undertone
];
export const SKIN_NAMES = ['Rosy', 'Peach', 'Tan', 'Cocoa', 'Porcelain', 'Honey', 'Olive', 'Chestnut', 'Ebony'];

// ---- outfits: tee cut, graphic language (pattern → cloth shader), coordinated colourway. Base colours stay in the
// neutral / earth family so every team ink (orange, cobalt, pink, mint, lemon, grape, aqua, cherry, lime, magenta)
// reads as the accent without clashing.
export const OUTFITS = [
  { shirt: '#f4f2ec', shorts: '#27304a', shoe: '#272b34', sole: '#f4f2ec', sock: '#f7f7f4', strap: '#30343d', pattern: 0 },
  { shirt: '#2b2e36', shorts: '#cfbb92', shoe: '#f3f2ee', sole: '#c98b4e', sock: '#f7f7f4', strap: '#24262c', pattern: 1 },
  { shirt: '#bfc5cf', shorts: '#1f2127', shoe: '#f3f2ee', sole: '#2a2c33', sock: '#2a2c33', strap: '#2a2c33', pattern: 2 },
  { shirt: '#f2e6c9', shorts: '#3a5683', shoe: '#3a3f4b', sole: '#f4f2ec', sock: '#f7f7f4', strap: '#3a3f4b', pattern: 3 },
  { shirt: '#f3efe4', shorts: '#2c3038', shoe: '#ece9e0', sole: '#c69256', sock: '#f5f4ef', strap: '#2a3550', pattern: 4 },
  { shirt: '#26282e', shorts: '#4a5160', shoe: '#1e2026', sole: '#f2f1ec', sock: '#1e2026', strap: '#1b1d22', pattern: 5 },
  { shirt: '#5f6446', shorts: '#b5a37f', shoe: '#6a5238', sole: '#2b2622', sock: '#e6e0d0', strap: '#3b3a2c', pattern: 6 },
  { shirt: '#ebe4d6', shorts: '#41608f', shoe: '#f2f1ec', sole: '#d9cbb0', sock: '#f7f7f4', strap: '#39404f', pattern: 7 },
  { shirt: '#f2f2ef', shorts: '#23262d', shoe: '#23262d', sole: '#f2f1ec', sock: '#f7f7f4', strap: '#23262d', pattern: 8 },
  { shirt: '#1f2a44', shorts: '#1f2a44', shoe: '#f2f1ec', sole: '#1f2a44', sock: '#f7f7f4', strap: '#161b29', pattern: 9 },
];
export const OUTFIT_NAMES = ['Basic Ringer', 'Night Pinstripe', 'Raglan Runner', 'Chevron Tee', 'Breton Stripe', 'Splatter Tee', 'Splat Camo', 'Dip-Dye Tee', 'Pro Jersey', 'Track Top'];

// ---- eyes: iris gradient [top, bottom] ---------------------------------------------------------------------------
export const IRIS = [
  ['#ffcf3a', '#ff7a00'], // 0 amber
  ['#4ff0dc', '#0b7fb0'], // 1 lagoon
  ['#c9a2ff', '#5b2ad6'], // 2 violet
  ['#a8f56a', '#1d9a4a'], // 3 lime
  ['#ffa3cf', '#d0246e'], // 4 rose
  ['#e6b36a', '#6b3a14'], // 5 hazel
  ['#e4f4ff', '#4f7fc4'], // 6 frost
  ['#ff8f6b', '#b3121c'], // 7 ember
];
export const IRIS_NAMES = ['Amber', 'Lagoon', 'Violet', 'Lime', 'Rose', 'Hazel', 'Frost', 'Ember'];

// ---- hair: built by character-geo.js (STYLES, same order). Tentacle hair always takes the team ink colour. ----------
export const HAIR_STYLE_NAMES = ['Tide', 'Spike', 'Twin', 'Bob', 'Pony', 'Crest', 'Knot', 'Swoop'];
export const HAIR_STYLES = HAIR_STYLE_NAMES.length;

// ---- headgear (optional, `hat`): built into the hair mesh by character-geo.js (HAT_KINDS, same order). Every style's
// tentacles are re-rooted under the rim so nothing clips; styles whose shape sits on top switch to a hat variant
// (low ponytail, low bun, lower twin ties, back flicks). 0 = none.
export const HATS = ['none', 'cap', 'beanie', 'bucket'];
export const HAT_NAMES = ['None', 'Snapback', 'Beanie', 'Bucket Hat'];

// ---- brows (optional, `brows`): shape of the painted-ink brow strokes. 0 = classic.
export const BROWS = ['classic', 'bold', 'arched', 'straight'];
export const BROW_NAMES = ['Classic', 'Bold', 'Arched', 'Straight'];

// ---- named full looks ("characters") the locker can offer one-click -----------------------------------------------
export const PRESETS = [
  { id: 'rookie', name: 'Rookie', blurb: 'Fresh off the ferry, ringer tee and long tentacles.', style: { hair: 0, skin: 0, outfit: 0, eyes: 0, hat: 0, brows: 0 } },
  { id: 'dash', name: 'Dash', blurb: 'Track-top sprinter with a spiky quiff.', style: { hair: 1, skin: 5, outfit: 9, eyes: 1, hat: 0, brows: 1 } },
  { id: 'pip', name: 'Pip', blurb: 'Twin tails, breton stripes, always first to the ferry deck.', style: { hair: 2, skin: 4, outfit: 4, eyes: 4, hat: 0, brows: 2 } },
  { id: 'coral', name: 'Coral', blurb: 'Dip-dyed and unbothered.', style: { hair: 3, skin: 3, outfit: 7, eyes: 5, hat: 0, brows: 0 } },
  { id: 'marlo', name: 'Marlo', blurb: 'Ponytail up, jersey on, game face.', style: { hair: 4, skin: 1, outfit: 8, eyes: 7, hat: 0, brows: 1 } },
  { id: 'riptide', name: 'Riptide', blurb: 'Mohawk crest and a splatter tee. Loud.', style: { hair: 5, skin: 7, outfit: 5, eyes: 3, hat: 0, brows: 3 } },
  { id: 'nori', name: 'Nori', blurb: 'Low bun under a bucket hat, splat camo, very patient charger main.', style: { hair: 6, skin: 6, outfit: 6, eyes: 2, hat: 3, brows: 3 } },
  { id: 'suki', name: 'Suki', blurb: 'Side-swept and too cool for the lobby.', style: { hair: 7, skin: 8, outfit: 1, eyes: 6, hat: 0, brows: 2 } },
  { id: 'kelp', name: 'Kelp', blurb: 'Beanie season, all season.', style: { hair: 3, skin: 2, outfit: 2, eyes: 3, hat: 2, brows: 0 } },
  { id: 'skipper', name: 'Skipper', blurb: 'Snapback, raglan, harbour regular.', style: { hair: 0, skin: 5, outfit: 3, eyes: 0, hat: 1, brows: 1 } },
];

const wrap = (v, n) => ((Math.round(v) % n) + n) % n;
/** Normalise a (possibly partial / out-of-range) style to valid indices; unspecified fields derive from the seed. */
export function resolveStyle(st = {}, seed = 0) {
  const hair = wrap(st.hair ?? seed % HAIR_STYLES, HAIR_STYLES);
  const skin = wrap(st.skin ?? (seed >> 3) % SKIN_TONES.length, SKIN_TONES.length);
  const outfit = wrap(st.outfit ?? (hair + skin + (seed >> 6)) % OUTFITS.length, OUTFITS.length);
  const eyes = wrap(st.eyes ?? (seed >> 9) % IRIS.length, IRIS.length);
  const hat = wrap(st.hat ?? 0, HATS.length);
  const brows = wrap(st.brows ?? 0, BROWS.length);
  return { ...st, hair, skin, outfit, eyes, hat, brows };
}

/** A complete random look (bots, "shuffle" in the locker). rng() → [0, 1). About a third of rolls wear headgear. */
export function randomStyle(rng = Math.random) {
  const pick = (n) => Math.min(n - 1, (rng() * n) | 0);
  return {
    hair: pick(HAIR_STYLES), skin: pick(SKIN_TONES.length), outfit: pick(OUTFITS.length), eyes: pick(IRIS.length),
    hat: rng() < 0.34 ? 1 + pick(HATS.length - 1) : 0, brows: pick(BROWS.length),
  };
}

/**
 * Write a resolved style's colours into a character uniform bundle (makeCharUniforms()): outfit colourway + pattern,
 * iris gradient, and the optional face uniforms. The Character constructor calls this.
 */
export function applyStyleUniforms(u, st) {
  const o = OUTFITS[st.outfit] || OUTFITS[0];
  u.uShirt.value.set(o.shirt); u.uShorts.value.set(o.shorts); u.uShoe.value.set(o.shoe);
  u.uSole.value.set(o.sole); u.uSock.value.set(o.sock); u.uStrap.value.set(o.strap); u.uPattern.value = o.pattern;
  const ir = IRIS[st.eyes] || IRIS[0];
  u.uIris.value.set(ir[0]); u.uIris2.value.set(ir[1]);
}
