// Stage modules (src/world/stages/<id>/): each stage owns its folder — layout.js (LAYOUT), props.js (register,
// PLACEMENTS), surfaces.js (SURF, SURFACES) and murals.js (drawMurals). Halyard keeps its data in maps.js / dressing.js /
// murals.js. Static imports: a stage that ships is always loaded, so there is no dynamic loader to go wrong.
import * as tidewaterLayout from './tidewater/layout.js';
import * as tidewaterProps from './tidewater/props.js';
import * as tidewaterSurfaces from './tidewater/surfaces.js';
import * as tidewaterMurals from './tidewater/murals.js';
import * as kelplineLayout from './kelpline/layout.js';
import * as kelplineProps from './kelpline/props.js';
import * as kelplineSurfaces from './kelpline/surfaces.js';
import * as kelplineMurals from './kelpline/murals.js';
import * as saltpanLayout from './saltpan/layout.js';
import * as saltpanProps from './saltpan/props.js';
import * as saltpanSurfaces from './saltpan/surfaces.js';
import * as saltpanMurals from './saltpan/murals.js';
import * as crossmarketLayout from './crossmarket/layout.js';
import * as crossmarketProps from './crossmarket/props.js';
import * as crossmarketSurfaces from './crossmarket/surfaces.js';
import * as crossmarketMurals from './crossmarket/murals.js';
import * as lockgateLayout from './lockgate/layout.js';
import * as lockgateProps from './lockgate/props.js';
import * as lockgateSurfaces from './lockgate/surfaces.js';
import * as lockgateMurals from './lockgate/murals.js';
import * as terracesLayout from './terraces/layout.js';
import * as terracesProps from './terraces/props.js';
import * as terracesSurfaces from './terraces/surfaces.js';
import * as terracesMurals from './terraces/murals.js';
import * as cargoLayout from './cargo/layout.js';
import * as cargoProps from './cargo/props.js';
import * as cargoSurfaces from './cargo/surfaces.js';
import * as cargoMurals from './cargo/murals.js';
import * as nantaiLayout from './nantai/layout.js';
import * as nantaiProps from './nantai/props.js';
import * as nantaiSurfaces from './nantai/surfaces.js';
import * as nantaiMurals from './nantai/murals.js';
import * as cratersLayout from './craters/layout.js';
import * as cratersProps from './craters/props.js';
import * as cratersSurfaces from './craters/surfaces.js';
import * as cratersMurals from './craters/murals.js';
import * as calamariLayout from './calamari/layout.js';
import * as calamariProps from './calamari/props.js';
import * as calamariSurfaces from './calamari/surfaces.js';
import * as calamariMurals from './calamari/murals.js';
import * as spirhaliteLayout from './spirhalite/layout.js';
import * as spirhaliteProps from './spirhalite/props.js';
import * as spirhaliteSurfaces from './spirhalite/surfaces.js';
import * as spirhaliteMurals from './spirhalite/murals.js';
import * as treehillsLayout from './treehills/layout.js';
import * as treehillsProps from './treehills/props.js';
import * as treehillsSurfaces from './treehills/surfaces.js';
import * as treehillsMurals from './treehills/murals.js';

// STAGES[id] = { LAYOUT, register, PLACEMENTS, SURF, SURFACES, drawMurals } (missing pieces are simply absent)
export const STAGES = {
  tidewater: { ...tidewaterLayout, ...tidewaterProps, ...tidewaterSurfaces, ...tidewaterMurals },
  kelpline: { ...kelplineLayout, ...kelplineProps, ...kelplineSurfaces, ...kelplineMurals },
  saltpan: { ...saltpanLayout, ...saltpanProps, ...saltpanSurfaces, ...saltpanMurals },
  crossmarket: { ...crossmarketLayout, ...crossmarketProps, ...crossmarketSurfaces, ...crossmarketMurals },
  lockgate: { ...lockgateLayout, ...lockgateProps, ...lockgateSurfaces, ...lockgateMurals },
  terraces: { ...terracesLayout, ...terracesProps, ...terracesSurfaces, ...terracesMurals },
  cargo: { ...cargoLayout, ...cargoProps, ...cargoSurfaces, ...cargoMurals },
  nantai: { ...nantaiLayout, ...nantaiProps, ...nantaiSurfaces, ...nantaiMurals },
  craters: { ...cratersLayout, ...cratersProps, ...cratersSurfaces, ...cratersMurals },
  calamari: { ...calamariLayout, ...calamariProps, ...calamariSurfaces, ...calamariMurals },
  spirhalite: { ...spirhaliteLayout, ...spirhaliteProps, ...spirhaliteSurfaces, ...spirhaliteMurals },
  treehills: { ...treehillsLayout, ...treehillsProps, ...treehillsSurfaces, ...treehillsMurals },
};
export const STAGE_IDS = Object.keys(STAGES);
