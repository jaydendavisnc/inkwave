// Mode variants of a stage. A layout piece (single / half) or a dressing item may carry
//   onlyIn: 'zones'   — built only in that mode (e.g. Zone Control access ramps)
//   notIn:  'zones'   — built in every mode except that one (e.g. benches cleared out of a zone)
// (either may list several modes: notIn: ['zones', 'tower'])
// Everything untagged is shared. A stage with no tagged items for a mode builds (and bakes) exactly as its Turf War
// layout; one with tagged items gets its own world + lightmap (assets/lightmaps/<id>.<mode>.{png,json}).
const hit = (v, mode) => (Array.isArray(v) ? v.includes(mode) : v === mode);
export const inMode = (it, mode) => (!it.onlyIn || hit(it.onlyIn, mode)) && (!it.notIn || !hit(it.notIn, mode));

// does building this stage for `mode` differ from its Turf War build?
export function hasVariant(layout, dressing, mode) {
  if (!mode || mode === 'turf') return false;
  const any = (list) => (list || []).some((it) => (it.onlyIn || it.notIn) && inMode(it, mode) !== inMode(it, 'turf'));
  return any(layout?.single) || any(layout?.half) || any(dressing);
}

// the layout as built in `mode` (pieces filtered; zones, bounds, spawns … shared)
export function layoutFor(layout, mode) {
  return { ...layout, single: layout.single.filter((d) => inMode(d, mode)), half: layout.half.filter((d) => inMode(d, mode)) };
}

// world / lightmap key: '<id>' for the shared build, '<id>.<mode>' for a mode variant
export const variantKey = (layoutId, layout, dressing, mode) => (hasVariant(layout, dressing, mode) ? `${layoutId}.${mode}` : layoutId);
