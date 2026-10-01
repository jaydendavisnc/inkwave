// Registry of every stage's surface materials (src/world/stages/<id>/surfaces.js) for texlib.js + levelMaterial.js.
// PATTERN slots 0–27 are the shared kit (mapkit.js); each stage owns three slots from 28 up (STAGE_SLOTS below). The
// slots only exist in the shader's slot table. Imports only the surfaces files (no props / layout), so texlib.js never
// pulls in stage geometry.
import * as tidewater from './tidewater/surfaces.js';
import * as kelpline from './kelpline/surfaces.js';
import * as saltpan from './saltpan/surfaces.js';
import * as crossmarket from './crossmarket/surfaces.js';
import * as lockgate from './lockgate/surfaces.js';
import * as terraces from './terraces/surfaces.js';
import * as cargo from './cargo/surfaces.js';
import * as nantai from './nantai/surfaces.js';
import * as craters from './craters/surfaces.js';
import * as calamari from './calamari/surfaces.js';
import * as spirhalite from './spirhalite/surfaces.js';
import * as treehills from './treehills/surfaces.js';

const PACKS = { tidewater, kelpline, saltpan, crossmarket, lockgate, terraces, cargo, nantai, craters, calamari, spirhalite, treehills };
export const STAGE_SLOTS = { tidewater: [28, 29, 30], kelpline: [31, 32, 33], saltpan: [34, 35, 36], crossmarket: [37, 38, 39], lockgate: [40, 41, 42], terraces: [43, 44, 45], cargo: [46, 47, 48],
  nantai: [49, 50, 51], craters: [52, 53, 54], calamari: [55, 56, 57], spirhalite: [58, 59, 60], treehills: [61, 62, 63] };
export const FIRST_STAGE_SLOT = 28, LAST_STAGE_SLOT = 63;
// flat list: { stage, slot, name (texlib layer name, '<stage>:<name>'), group (texlib uber-program), mat, onWall, onTop }
// Each stage's layers get an uber-program of their own (group 3 + its index): compiled in parallel with the others, and
// each stays small.
export const STAGE_SURFACES = [];
Object.keys(STAGE_SLOTS).forEach((stage, k) => {
  for (const s of PACKS[stage].SURFACES || []) {
    if (!STAGE_SLOTS[stage].includes(s.slot)) { console.warn(`[inkwave] ${stage} surface '${s.name}' is not on one of its slots`, STAGE_SLOTS[stage]); continue; }
    STAGE_SURFACES.push({ stage, slot: s.slot, name: `${stage}:${s.name}`, group: 3 + k, mat: s.mat, onWall: s.onWall, onTop: s.onTop });
  }
});
