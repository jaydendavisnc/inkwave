// Set dressing per stage: PropKit placements (see src/world/props.js). Everything listed for team 0's half is mirrored
// by the map's 180° rotation (x,z → -x,-z, rotY + π) exactly like the level blocks, so both sides stay identical.
// Only `mirror: false` items are placed once.
import { HALYARD_VESSELS } from './props-marina-vessels.js';
import { hq, QUAY_FRONT as QF, SLICE_PLACEMENTS } from './props-marina-slice.js';
import { STAGES } from './stages/index.js';

const P = Math.PI;

export const DRESSING = {
  halyard: [
    // owner: docks stream (src/world/props-marina-dock.js). Alpha half; every entry is mirrored (x,z → -x,-z).
    // ---- pier edges: `pieredge` runs start on the deck edge and run along local +X with the water on local +Z.
    //      Concave corners: one run keeps its whaler to the corner (ext 0, first pile 0.75 in), the other butts into it
    //      (ext -0.1); convex corners: one run wraps the corner (ext 0.1). Jump edges carry nothing on the deck.
    // quay front (basin)
    { type: 'pieredge', pos: [-19.5, 0, QF], rotY: 0, length: 15, s0: 0.75, s1: 0.75, skip: [[6.55, 8.25]], cleats: [3.2, 10.6], fenders: [1.9, 5.3, 12.4] },   // (the visitor gangway)
    { type: 'pieredge', pos: [4.5, 0, QF], rotY: 0, length: 5.0, s0: 0.75, s1: 0.4, ext1: -0.1 },   // (the chandlery's berth, under its store's end)
    // fuel dock: west side (fuel berth, D-fender), east side (jump edge x = 4.5), mid end (gangway)
    { type: 'pieredge', pos: [-4.5, 0, -31], rotY: -P / 2, length: 18.6, ext0: -0.1, ext1: -0.1, dfender: true, cleats: [4.2, 9.4, 14.6], ladders: [2.2], notIn: 'tower' },
    { type: 'pieredge', pos: [-4.5, 0, -31], rotY: -P / 2, length: 7.6, ext0: -0.1, dfender: true, cleats: [4.2], ladders: [2.2], onlyIn: 'tower' },   // (then the checkpoint float)
    { type: 'pieredge', pos: [-4.5, 0, -14.4], rotY: -P / 2, length: 2.0, ext1: -0.1, dfender: true, onlyIn: 'tower' },
    { type: 'pieredge', pos: [-4.5, 0, -10.4], rotY: -P / 2, length: 1.8, ext0: -0.1, dfender: true },
    { type: 'pieredge', pos: [4.5, 0, -26], rotY: P / 2, length: 5, ext0: -0.1, ext1: -0.1, dfender: true, notIn: 'tower' },
    { type: 'pieredge', pos: [4.5, 0, -8.6], rotY: P / 2, length: 15.4, ext1: -0.1, dfender: true, notIn: 'tower' },
    { type: 'pieredge', pos: [4.5, 0, -8.6], rotY: P / 2, length: 5.6, dfender: true, onlyIn: 'tower' },   // (the workboat lies alongside beyond)
    { type: 'pieredge', pos: [-4.5, 0, -8.6], rotY: 0, length: 9, ext0: 0.1, ext1: 0.1, skip: [[2.5, 6.5]], dfender: true },
    // long pier inner side (houseboat berth), finger pier, boardwalk
    { type: 'pieredge', pos: [-19.5, 0, -26.4], rotY: P / 2, length: 4.6, ext0: -0.1, ext1: -0.1 },
    { type: 'pieredge', pos: [-19.5, 0, -12.4], rotY: P / 2, length: 12.8, ext0: -0.1, ext1: -0.1, skip: [[5.4, 7.4]], cleats: [2.4, 10.4], fenders: [3.9, 9.2] },
    { type: 'pieredge', pos: [-19.5, 0, 0], rotY: P / 2, length: 10.4, ext1: -0.1, notIn: 'tower' },
    { type: 'pieredge', pos: [-19.5, 0, -25.2], rotY: 0, length: 7, s0: 0.75, ext1: 0.1, cleats: [2.6, 5.9], fenders: [1.6, 4.3] },
    { type: 'pieredge', pos: [-12.5, 0, -26.4], rotY: P, length: 7, ext0: 0.1, s1: 0.75, cleats: [1.1, 4.4], fenders: [2.7, 5.4], ladders: [6.1] },
    { type: 'pieredge', pos: [-12.5, 0, -25.2], rotY: P / 2, length: 1.2 },
    { type: 'pieredge', pos: [-19.5, 0, -10.4], rotY: 0, length: 15, s0: 0.75, s1: 0.75, cleats: [4.1, 10.9], notIn: 'tower' },
    { type: 'pieredge', pos: [-4.5, 0, -12.4], rotY: P, length: 15, s0: 0.75, s1: 0.75, cleats: [4.1, 10.9], fenders: [7.5], notIn: 'tower' },
    { type: 'pieredge', pos: [-10.0, 0, -10.4], rotY: 0, length: 5.5, s1: 0.75, cleats: [1.4], onlyIn: 'tower' },
    { type: 'pieredge', pos: [-4.5, 0, -12.4], rotY: P, length: 15, s0: 0.75, s1: 0.75, skip: [[5.45, 8.4]], cleats: [4.1, 10.9], onlyIn: 'tower' },
    // boatyard: west side (jump edge z -24…-8.6), north end, strip (jump edge to the ferry, plank landing)
    { type: 'pieredge', pos: [10, 0, -33.5], rotY: -P / 2, length: 7.5, ext0: 0.1, ext1: -0.1, notIn: 'tower' },
    { type: 'pieredge', pos: [10, 0, -24], rotY: -P / 2, length: 17, ext0: -0.1, notIn: 'tower' },
    { type: 'pieredge', pos: [10, 0, -14.2], rotY: -P / 2, length: 7.2, onlyIn: 'tower' },   // (the workboat lies alongside before it)
    { type: 'pieredge', pos: [10, 0, -7], rotY: 0, length: 9.5, ext0: 0.1, s1: 0.75, cleats: [2.2] },
    { type: 'pieredge', pos: [19.5, 0, -7], rotY: -P / 2, length: 7, ext0: -0.1, skip: [[1.9, 4.6]], notIn: 'tower' },
    { type: 'pieredge', pos: [19.5, 0, -7], rotY: -P / 2, length: 4.4, ext0: -0.1, skip: [[1.9, 4.6]], onlyIn: 'tower' },
    // walkway fuel dock ↔ yard
    { type: 'pieredge', pos: [4.5, 0, -24], rotY: 0, length: 5.5, s0: 0.75, s1: 0.75 },
    { type: 'pieredge', pos: [10, 0, -26], rotY: P, length: 5.5, s0: 0.75, s1: 0.75, notIn: 'tower' },
    // arena perimeter (outer edges): tall capped piles
    { type: 'pieredge', pos: [-24, 0, hq(-51.95)], rotY: -P / 2, length: -hq(-51.95), outer: true, cleats: [10.5, 27.5, 43.5, 55.5, 65.5] },
    { type: 'pieredge', pos: [24, 0, 0], rotY: P / 2, length: -hq(-51.95), outer: true, spacing: 4.0, cleats: [8.5, 24.5, 30.0, 45.5, 52.5] },   // 4.0: vessels' marina gangway (z hq(-37.9)) sits between the piles (s 61.9 between 59.8 / 63.75)
    { type: 'pieredge', pos: [24, 0, hq(-51.95)], rotY: P, length: 48, outer: true, ext0: 0.1, ext1: 0.1, spacing: 6.0, wraps: false },
    // ---- clubhouse (facade fittings on the back wall + upper storey / roofs / cupola / flagstaff behind it, collides)
    { type: 'clubhouse', pos: [0, 0, hq(-45.4)], rotY: 0 },
    // terrace: planters with little trees at the back corners (outside the 4.2 m spawn circle)
    { type: 'planter', pos: [-6.4, 2.4, hq(-44.72)], rotY: 0, variant: 2, color: 'tealdark' },
    { type: 'planter', pos: [6.4, 2.4, hq(-44.72)], rotY: 0, variant: 2, color: 'tealdark' },
    // ---- quay: boathouse + harbour office dressing, café terrace, benches, bins, bikes, kayaks, site map
    { type: 'boathouse', pos: [18.5, 0, hq(-43.0)], rotY: 0 },
    { type: 'harbouroffice', pos: [-19.8, 0, hq(-42.9)], rotY: 0 },
    { type: 'cafeset', pos: [-15.35, 0, hq(-43.55)], rotY: 0.3, variant: 0 },
    { type: 'cafeset', pos: [-14.0, 0, hq(-41.7)], rotY: 0.9, variant: 1 },
    { type: 'aboard', pos: [-11.75, 0, hq(-44.75)], rotY: 0.25 },
    { type: 'planter', pos: [-10.0, 0, hq(-44.95)], rotY: 0, length: 1.2, width: 0.6, variant: 1, color: 'tealdark' },
    { type: 'bench', pos: [-15.4, 0, hq(-31.75)], rotY: 0 },
    { type: 'bench', pos: [-8.9, 0, hq(-31.75)], rotY: 0 },
    { type: 'bench', pos: [7.6, 0, hq(-31.75)], rotY: 0 },
    { type: 'trashbin', pos: [-13.95, 0, hq(-31.95)] },
    { type: 'trashbin', pos: [9.05, 0, hq(-32.0)] },
    { type: 'bikerack', pos: [10.85, 0, hq(-44.55)], count: 2, bikes: 0 },
    { type: 'scooter', pos: [12.05, 0, hq(-44.7)], rotY: 0.12, variant: 0 },
    { type: 'kayakrack', pos: [23.25, 0, hq(-43.0)], rotY: P / 2 },
    { type: 'surfrack', pos: [14.18, 0, hq(-42.1)], rotY: -P / 2, variant: 1 },
    { type: 'mapboard', pos: [-23.35, 0, hq(-34.2)], rotY: P / 2 },
    // ---- dock hardware: shore power at the berths, bollard lights + life rings on the edges, mooring bitts
    { type: 'shorepower', pos: [-19.88, 0, -22.3], rotY: P / 2, berth: 'H1' },
    { type: 'shorepower', pos: [-17.2, 0, hq(-31.38)], rotY: 0, berth: 'Q4' },
    { type: 'bollardlight', pos: [-23.72, 0, -27.0] },
    { type: 'bollardlight', pos: [-23.72, 0, -13.0] },
    { type: 'bollardlight', pos: [23.72, 0, -27.5] },
    { type: 'bollardlight', pos: [23.72, 0, -15.5] },
    { type: 'bollardlight', pos: [-4.15, 0, -26.0] },
    { type: 'lifering', pos: [-23.6, 0, -21.0], rotY: P / 2 },
    { type: 'bollard', pos: [-23.55, 0, hq(-38.0)], variant: 2 },
    { type: 'bollard', pos: [23.55, 0, hq(-34.0)], variant: 2 },
    // ---- boatyard: laid-up launch under a tarp at the yard edge, scaffold at the tug's bow beside (not on) the ramp,
    //      drums by the tug's stern (the tug's own stands, cribbing and ladder come from vessels; the travel lift and its
    //      workbench went to the travel-lift dock in the slice: props-marina-slice.js)
    { type: 'tarpboat', pos: [23.2, 0, -11.4], rotY: P / 2 },
    { type: 'scaffold', pos: [19.66, 0, -12.36], rotY: 0 },
    { type: 'barrel', pos: [21.1, 0, -23.25], rotY: P / 2, variant: 1, color: '#3f6fb0', color2: '#c9453b' },
    // ---- ramps (dressing outside the walking widths; handrails carry rail colliders): grand stair balustrade, fuel-dock
    //      gangway rails, houseboat gangway rails (land1: its high end lands on the houseboat deck edge 0.25 before the top)
    { type: 'grandstair', pos: [0, 0, hq(-32.4)], rotY: P, run: 6.1, rise: 2.4, width: 6 },
    { type: 'gangwayrails', pos: [0, 0, -8.8], rotY: 0, run: 3.85, rise: 1.3, width: 3.4, thick: 0.22, posts: 5 },
    { type: 'gangwayrails', pos: [-19.7, 0, -18.8], rotY: P / 2, run: 2.35, rise: 0.7, width: 1.6, thick: 0.18, posts: 3, land1: 2.1 },
    // ---- harbour beacon crown (the beacon block straddles the lane seam; the mirror copy dresses the far one)
    { type: 'beacon', pos: [-22.6, 0, 0], rotY: 0 },
    // ---- outside the arena: breakwater arm with a green pier-head light, channel markers
    { type: 'breakwater', pos: [42, 0, hq(-62)], rotY: 0, length: 72 - hq(0) },
    { type: 'channelmarker', pos: [37.0, -1.6, 21.5], variant: 0 },
    { type: 'channelmarker', pos: [31.0, -1.6, 17.0], variant: 1 },
    // ---- required cover (gameplay footprints from docs/HALYARD.md — colliders are exact)
    { type: 'fuelpump', pos: [3.5, 0, -13.8], rotY: 0, price: '1.89' },
    { type: 'fuelpump', pos: [-3.5, 0, -13.8], rotY: P, price: '1.89' },
    { type: 'dockbox', pos: [-23.1, 0, -7.5], rotY: P / 2 },
    { type: 'pumpout', pos: [-22.7, 0, -19.0], rotY: P / 2 },
    { type: 'keelblocks', pos: [11.9, 0, -10.8], rotY: 0 },
    { type: 'quaycrates', pos: [-10.3, 0, hq(-34.4)], rotY: 0, variant: 0 },
    { type: 'quaycrates', pos: [11.5, 0, hq(-35.6)], rotY: 0, variant: 1 },
    // ---- fuel dock: hut kit (roof sign + roof kit collide), ice chest + bait cooler, landmark sign, life ring
    { type: 'fuelhut', pos: [0, 0, -20.65], rotY: 0, notIn: 'tower' },
    { type: 'cooler', pos: [-0.85, 0, -22.9], rotY: P, variant: 1, notIn: 'tower' },
    { type: 'cooler', pos: [-0.55, 0.94, -22.85], rotY: P + 0.18, variant: 0, color: 'teal', notIn: 'tower' },
    // Tower Command: the roof is a lookout up a timber ramp from the spawn side (maps.js fuel-hut-ramp) — the roof sign up on
    // a gantry, the door round the side, the ice chest + bait cooler beside the ramp's foot
    { type: 'fuelhut', pos: [0, 0, -20.65], rotY: 0, ramp: { run: 6.1, rise: 2.7, w: 2.4 }, onlyIn: 'tower' },
    { type: 'cooler', pos: [-1.6, 0, -27.0], rotY: -P / 2, variant: 1, onlyIn: 'tower' },
    { type: 'cooler', pos: [-1.62, 0.94, -26.8], rotY: -P / 2 + 0.18, variant: 0, color: 'teal', onlyIn: 'tower' },
    { type: 'fueldocksign', pos: [-4.2, 0, -9.3], rotY: 0 },
    // ---- Tower Command cover: the user's inflatables (drawn on Bravo's half, authored there; mirrored). Nudged only to
    //      clear the track (-10.85, 21.6: was -11.2), a deck edge (±2.85, 30.1: was ±3.3) or the tug's bow ramp (-17, 23.2)
    { type: 'inflatable', size: 'small', pos: [20.5, 0, 13.2], onlyIn: 'tower' },
    { type: 'inflatable', size: 'small', pos: [2.2, 0, 13.8], onlyIn: 'tower' },
    { type: 'inflatable', size: 'small', pos: [-2.2, 0, 13.9], onlyIn: 'tower' },
    { type: 'inflatable', size: 'small', pos: [-10.85, 0, 21.6], onlyIn: 'tower' },
    { type: 'inflatable', size: 'small', pos: [-17.0, 2.6, 23.2], onlyIn: 'tower' },
    { type: 'inflatable', size: 'square', pos: [2.85, 0, 30.1], onlyIn: 'tower' },
    { type: 'inflatable', size: 'square', pos: [-2.85, 0, 30.1], onlyIn: 'tower' },
    { type: 'lifering', pos: [-4.12, 0, -16.6], rotY: P / 2, notIn: 'tower' },
    { type: 'lifering', pos: [-4.12, 0, -12.95], rotY: P / 2, onlyIn: 'tower' },   // (off the track: on the pocket's edge)
  ],
};

// stage packs that own their own placement lists
const EXTRA = { halyard: [...HALYARD_VESSELS, ...SLICE_PLACEMENTS] };
for (const [id, st] of Object.entries(STAGES)) if (st.PLACEMENTS) EXTRA[id] = st.PLACEMENTS;

// Expand the half-list into world placements for both halves.
export function dressingFor(layoutId) {
  const src = [...(DRESSING[layoutId] || []), ...(EXTRA[layoutId] || [])];
  const out = [];
  for (const it of src) {
    out.push(it);
    if (it.mirror === false) continue;
    const [x, y, z] = it.pos;
    out.push({ ...it, pos: [-x, y, -z], rotY: (it.rotY || 0) + P, team: it.team === undefined ? undefined : 1 - it.team });
  }
  return out;
}
