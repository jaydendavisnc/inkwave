// Halyard Marina — the Long Stages slice (2026-09-30). Every half of the marina is 24 m longer than the first build: the
// quay, the clubhouse and everything standing on them (the base) moved out along the spawn axis, and the three lanes run
// on across the new land between the first build's quay front (z = ∓31) and the new one (z = ∓55):
//   • the Long Pier carries on, with the VISITOR PONTOONS in the slip beside it: a floating pontoon row 0.9 m below the
//     piers (gangways down from the Long Pier and the fuel dock), fingers with visiting yachts berthed between them
//     (their hulls and deckhouses are the cover), a long finger north to the first build's finger pier
//   • the fuel dock carries on past the CHANDLERY: a timber shop on piles over the channel with its LOADING DECK (1.3 m,
//     the strategic point: ramps up from the fuel dock and from the hardstanding, a view down the channel to mid)
//   • the boatyard carries on round the TRAVEL-LIFT DOCK: a slip cut into the hardstanding from the channel, the yard's
//     big portal hoist straddling it with a motor cruiser hanging in its slings (cover), a plank across the slip's mouth
//     and the hardstanding round its head
// Placements here are Alpha's (mirrored like the rest of the stage dressing). maps.js builds the playable blocks from
// the same constants (SLICE), dressing.js adds SLICE_PLACEMENTS to the stage's list.
//
// Conventions as props-marina-*.js: metres, Y up, pier decks at y 0, sea surface y = -1.6.

// the shift and the cut (Alpha): base-side pieces of the first build stand HALYARD_D further out along -Z
export const HALYARD_D = 24, HALYARD_CUT = -31;
export const hq = (z) => z - HALYARD_D;                 // a base-side z of the first build (Alpha), moved out
export const QUAY_FRONT = hq(HALYARD_CUT);             // -55

// the slice's pieces (Alpha, world metres)
//   rects are [x0, x1, z0, z1]
export const SLICE = {
  // the visitor pontoons: deck 0.7 m above the water, a 0.4 m deck frame (like the floating docks')
  pontoonY: -0.9, pontoonDepth: 0.4,
  spine: [-17.3, -6.7, -45.3, -43.3],                  // the east-west pontoon, Long Pier ↔ fuel dock (gangways at both ends)
  fingers: [
    [-13.7, -12.5, -43.3, -26.55],                     // the long finger, north to the first build's finger pier
    [-9.3, -8.1, -43.3, -36.6],                        // a short finger between two berths
    [-13.0, -11.2, QUAY_FRONT + 2.1, -45.3],           // the access pontoon south to the quay's gangway
  ],
  towerFinger: [-10.05, -8.85, -43.3, -36.6],          // Tower Command: the short finger under the water-bus PUFFIN's gangway
  // the chandlery: its store (a timber shed on the hardstanding's edge) and the loading deck across the channel
  store: [9.5, 15.5, QUAY_FRONT, -48.5], storeTop: 4.2,
  booth: [-4.5, -1.7, -40.2, -37.4], boothTop: 2.6,      // the visitors' berthing booth on the fuel dock (roof off limits)
  deck: [4.5, 15.5, -48.5, -44.3], deckY: 1.3, rampW: 4.0,   // (the ramps as wide as the deck is deep: no pockets at its corners)
  // the travel-lift dock: a slip cut into the hardstanding from the channel (water), the plank across its mouth
  slip: [10, 20, -40.5, -35.5], plank: [10.4, 11.6],
  lift: { x: 15.6, w: 6.6, l: 5.2 },                   // the hoist over the slip (centre x; leg span across / along the slip)
  hung: { L: 7.6, x: 15.8, keel: 0.35 },               // the motor cruiser in its slings (length, centre x, keel height)
};

// ---------------------------------------------------------------------------------------------------------- berths
// visiting yachts in the pontoon berths (Alpha): [type, x, z (hull centre), length, heading (bow +1 = +Z / -1 = -Z), name]
// Moored with the waterline at the sea (y -1.6); `col` gives each hull + deckhouse colliders (the cover)
export const BERTHS = [
  ['yacht_motor', -16.55, -37.9, 9.6, 1, 'ORCA BAY'],          // N1: alongside the Long Pier, bow to mid
  ['yacht_sail', -10.9, -39.25, 7.2, 1, 'SANDPIPER'],          // N2: between the long finger and the short finger
  ['yacht_sail', -6.3, -39.3, 7.2, 1, 'MORWENNA'],             // N3: between the short finger and the fuel dock
  ['yacht_motor', -16.2, -50.2, 8.0, -1, 'LADY GREY'],         // S1: stern to the spine, bow to the quay
  ['yacht_sail', -7.9, -50.2, 7.4, -1, 'ARIEL'],               // S2
];
const berthRect = ([type, x, z, L]) => { const hb = L * (type === 'yacht_motor' ? 0.34 : 0.32) / 2; return [x - hb, x + hb, z - L / 2, z + L / 2]; };

// the sides of a pontoon rect for the floatdeck dressing (section-local stretches: 'w' open water, 'j' a join with another
// pontoon, 's' a seam against a pier / the quay, 'b' a boat alongside: fenders)
function pontoonSides(r, rects, near) {
  const inside = (x, z, a) => x > a[0] && x < a[1] && z > a[2] && z < a[3];
  const kindAt = (x, z) => {
    for (const t of rects) if (t !== r && inside(x, z, [t[0] - 0.02, t[1] + 0.02, t[2] - 0.02, t[3] + 0.02])) return 'j';
    for (const n of near) if (inside(x, z, n)) return n[4];
    return 'w';
  };
  const cx = (r[0] + r[1]) / 2, cz = (r[2] + r[3]) / 2, P = 0.35, sides = {};
  for (const [sd, ax, fixed, lo, hi] of [['+x', 'z', r[1] + P, r[2], r[3]], ['-x', 'z', r[0] - P, r[2], r[3]], ['+z', 'x', r[3] + P, r[0], r[1]], ['-z', 'x', r[2] - P, r[0], r[1]]]) {
    const segs = [], c = ax === 'z' ? cz : cx, n = Math.max(2, Math.round((hi - lo) / 0.05));
    for (let i = 0; i < n; i++) {
      const u = lo + ((hi - lo) * (i + 0.5)) / n, k = ax === 'z' ? kindAt(fixed, u) : kindAt(u, fixed), last = segs[segs.length - 1];
      if (last && last[0] === k) last[2] = +(lo + ((hi - lo) * (i + 1)) / n - c).toFixed(3);
      else segs.push([k, +(lo + ((hi - lo) * i) / n - c).toFixed(3), +(lo + ((hi - lo) * (i + 1)) / n - c).toFixed(3)]);
    }
    for (let i = 0; i < segs.length && segs.length > 1; i++) {
      if (segs[i][2] - segs[i][1] >= 0.4) continue;
      const into = i > 0 ? segs[i - 1] : segs[i + 1];
      into[1] = Math.min(into[1], segs[i][1]); into[2] = Math.max(into[2], segs[i][2]);
      segs.splice(i, 1); i = -1;
    }
    for (let i = 1; i < segs.length; i++) if (segs[i][0] === segs[i - 1][0]) { segs[i - 1][2] = segs[i][2]; segs.splice(i, 1); i--; }
    sides[sd] = segs;
  }
  return sides;
}

// ------------------------------------------------------------------------------------------------------ placements
// (same format as src/world/dressing.js; Alpha's half, mirrored unless mirror: false)
function slicePlacements() {
  const P = Math.PI, out = [], S = SLICE, QF = QUAY_FRONT;
  // ---- pier edges round the new land (pieredge: along local +X, water on local +Z; see dressing.js for the corner rules)
  // Long Pier, inner side (the houseboat's slip, then the visitor berths): the visitor gangway, fenders at ORCA BAY
  out.push({ type: 'pieredge', pos: [-19.5, 0, -26.4], rotY: P / 2, length: -26.4 - QF, ext0: -0.1, ext1: -0.1, skip: [[17.05, 18.75]], cleats: [3.0, 15.6, 21.6], fenders: [8.6, 13.4] });
  // fuel dock, west side (the visitor gangway) and east side (the chandlery's berth; the channel's run is dressing.js's)
  out.push({ type: 'pieredge', pos: [-4.5, 0, QF], rotY: -P / 2, length: HALYARD_CUT - QF, ext0: -0.1, skip: [[9.85, 11.55]], dfender: true, cleats: [3.4, 15.6, 20.8], fenders: [5.6, 17.2], ladders: [22.2] });
  out.push({ type: 'pieredge', pos: [4.5, 0, S.deck[2]], rotY: P / 2, length: S.deck[2] - QF, ext0: -0.1, ext1: -0.1, dfender: true, cleats: [3.2] });
  // hardstanding: the channel side between the loading deck and the slip, the slip's edges (the plank across its mouth)
  out.push({ type: 'pieredge', pos: [10, 0, S.deck[3]], rotY: -P / 2, length: S.slip[2] - S.deck[3], ext0: -0.1, ext1: 0.1 });
  out.push({ type: 'pieredge', pos: [S.slip[0], 0, S.slip[2]], rotY: 0, length: S.slip[1] - S.slip[0], s1: 0.75, skip: [[S.plank[0] - S.slip[0] - 0.05, S.plank[1] - S.slip[0] + 0.05]], cleats: [3.2, 7.2] });
  out.push({ type: 'pieredge', pos: [S.slip[1], 0, S.slip[3]], rotY: P, length: S.slip[1] - S.slip[0], s0: 0.75, ext1: 0.1, skip: [[S.slip[1] - S.plank[1] - 0.05, S.slip[1] - S.plank[0] + 0.05]], cleats: [1.3, 5.3] });
  out.push({ type: 'pieredge', pos: [S.slip[1], 0, S.slip[2]], rotY: -P / 2, length: S.slip[3] - S.slip[2], ext0: -0.1, ext1: -0.1 });
  // ---- the visitor pontoons (floating-dock sections 0.9 m down: frames, rub rails, cleats, float tubs, fenders at boats)
  const rects = [S.spine, ...S.fingers], rectsT = [S.spine, S.fingers[0], S.towerFinger, S.fingers[2]];
  const near = [
    [-24, -19.5, QF, 0, 's'], [-4.5, 4.5, QF, -8.6, 's'], [-24, 24, QF - 15, QF, 's'], [-19.5, -12.5, -26.4, -25.2, 's'],
    ...BERTHS.map((b) => [...berthRect(b), 'b']),
  ];
  const nearT = near.filter((n) => !(n[4] === 'b' && Math.abs((n[0] + n[1]) / 2 - BERTHS[1][1]) < 0.01));
  for (const [list, nb, tag] of [[rects, near, { notIn: 'tower' }], [rectsT, nearT, { onlyIn: 'tower' }]]) for (const r of list) {
    const shared = r !== S.fingers[1] && r !== S.towerFinger;
    if (shared && tag.onlyIn) continue;   // (the shared sections are placed once, with the Turf War build's sides)
    out.push({ type: 'floatdeck', pos: [(r[0] + r[1]) / 2, S.pontoonY, (r[2] + r[3]) / 2], w: r[1] - r[0], d: r[3] - r[2], y0: -S.pontoonDepth, sea: -1.6 - S.pontoonY, sides: pontoonSides(r, list, nb), piles: [], lite: true, ...(shared ? {} : tag) });
  }
  // ---- the visiting yachts (hull + deckhouse colliders: the cover along the pontoons)
  // (Tower Command: SANDPIPER's berth is kept clear for the water-bus PUFFIN's gangway down onto the moved short finger)
  for (const [type, x, z, L, dir, name] of BERTHS) out.push({ type, pos: [x, -1.6, z], rotY: dir > 0 ? 0 : P, length: L, name, col: true, fenderSide: x < -12 ? -1 : 1, notIn: name === 'SANDPIPER' ? 'tower' : undefined });
  // ---- the travel-lift dock: the yard's portal hoist straddling the slip (legs on the hardstanding either side, open end
  //      to the channel) with a motor cruiser hanging in its slings; its workbench + pressure washer by the mouth
  const liftZ = (S.slip[2] + S.slip[3]) / 2, H = S.hung, wl = H.keel + 0.6;   // (the motor cruiser's keel is 0.6 below its waterline)
  out.push({ type: 'travellift', pos: [S.lift.x, 0, liftZ], rotY: -P / 2, w: S.lift.w, l: S.lift.l, hang: { y: H.keel + 0.1, hb: H.L * 0.34 / 2 + 0.04, top: wl + 1.1, z: [-1.7, 1.5].map((d) => d + S.lift.x - H.x) } });
  out.push({ type: 'yacht_motor', pos: [H.x, wl, liftZ], rotY: P / 2, length: H.L, name: 'BLUE HERON', color: '#f4f1ea', accent: '#3b5f8a', col: 'roof' });
  out.push({ type: 'workbench', pos: [S.slip[0] + 0.45, 0, S.slip[3] + 2.2], rotY: P / 2, washerSide: 1 });
  // ---- the chandlery: its store (dressing round the block), the store's pier edge over its berth, the loading deck
  //      (staging, railing + davit, the cover on it), its RIB in the berth, the gas cage + a pallet by its side door
  const st = S.store, dk = S.deck;
  out.push({ type: 'chandlery', pos: [(st[0] + st[1]) / 2, 0, (st[2] + st[3]) / 2], w: st[1] - st[0], d: st[3] - st[2], h: S.storeTop, deck: S.deckY, wall: '#566b80' });
  out.push({ type: 'pieredge', pos: [st[0], 0, QF], rotY: -P / 2, length: st[3] - QF, ext0: -0.1, ext1: -0.1, fenders: [2.2], cleats: [4.6] });
  out.push({ type: 'loadingdeck', pos: [(dk[0] + dk[1]) / 2, S.deckY, (dk[2] + dk[3]) / 2], w: dk[1] - dk[0], d: dk[3] - dk[2], y: S.deckY, wet: 10 - (dk[0] + dk[1]) / 2, gap: [-3.6, -2.2] });
  out.push({ type: 'boat_rib', pos: [7.0, -1.6, -52.2], rotY: P / 2 + 0.06, length: 3.6, color: '#3f6fb0' });
  out.push({ type: 'gascage', pos: [st[1] + 0.45, 0, -52.6], rotY: P / 2, count: 5 });
  out.push({ type: 'pallet', pos: [st[1] + 0.75, 0, -50.2], rotY: 0.2, variant: 2 });
  // ---- the fuel dock's shore end: the visitors' berthing booth (dresses the booth block), an ICE chest and fish boxes,
  //      a trolley at the quay end
  const bo = S.booth;
  // (turned so its door faces the lane and its service hatch + VISITORS fascia face the quay and the spawn)
  out.push({ type: 'harbouroffice', pos: [(bo[0] + bo[1]) / 2, 0, (bo[2] + bo[3]) / 2], rotY: P / 2, w: bo[3] - bo[2], d: bo[1] - bo[0], h: S.boothTop, label: 'VISITORS' });
  out.push({ type: 'cooler', pos: [3.55, 0, -40.8], rotY: -P / 2, variant: 1 });
  out.push({ type: 'crates', pos: [3.4, 0, -35.6], rotY: 0.15, variant: 1, color: '#3f6fb0' });
  out.push({ type: 'palletjack', pos: [2.6, 0, -51.8], rotY: 0.4 });
  out.push({ type: 'bollard', pos: [-3.9, 0, -48.4], variant: 1 });
  out.push({ type: 'quaycrates', pos: [-3.25, 0, -50.2], rotY: P / 2 + 0.06, variant: 1 });
  out.push({ type: 'vending', pos: [-3.75, 0, -29.6], rotY: P / 2, variant: 1, color: 'teal' });
  out.push({ type: 'cabinet', pos: [3.85, 0, -30.4], rotY: -P / 2 });
  // ---- the Long Pier's new stretch: shore power at ORCA BAY, a dock box, a crate stack, crab pots, a bench
  //      facing the berths, bollard lights, a life ring, the pontoon sign at the gangway head
  out.push({ type: 'shorepower', pos: [-19.88, 0, -35.2], rotY: P / 2, berth: 'V1' });
  out.push({ type: 'dockbox', pos: [-23.1, 0, -37.4], rotY: P / 2 });
  out.push({ type: 'crates', pos: [-22.75, 0, -50.4], rotY: P / 2 + 0.1, variant: 0 });
  out.push({ type: 'crabtrap', pos: [-22.9, 0, -43.0], rotY: 0.3, variant: 1 });
  out.push({ type: 'bench', pos: [-23.3, 0, -46.2], rotY: P / 2 });
  out.push({ type: 'kayakrack', pos: [-23.25, 0, -29.6], rotY: P / 2 });
  out.push({ type: 'bollardlight', pos: [-23.72, 0, -33.4] });
  out.push({ type: 'bollardlight', pos: [-23.72, 0, -54.0] });
  out.push({ type: 'lifering', pos: [-23.6, 0, -41.0], rotY: P / 2 });
  out.push({ type: 'pontoonsign', pos: [-20.15, 0, -46.3], rotY: -P / 2, text: 'VISITORS', sub: 'PONTOON V · 1-6' });
  // ---- the pontoons: gangway trusses (rail colliders), shore power + a dock box on the spine
  out.push({ type: 'gangwayrails', pos: [S.spine[0], S.pontoonY, -44.3], rotY: -P / 2, run: S.spine[0] + 19.5, rise: -S.pontoonY, width: 1.6, thick: 0.2, posts: 3 });
  out.push({ type: 'gangwayrails', pos: [S.spine[1], S.pontoonY, -44.3], rotY: P / 2, run: -4.5 - S.spine[1], rise: -S.pontoonY, width: 1.6, thick: 0.2, posts: 3 });
  out.push({ type: 'gangwayrails', pos: [-13.1, S.pontoonY, -28.75], rotY: 0, run: 2.35, rise: -S.pontoonY, width: 1.2, thick: 0.2, posts: 3 });
  out.push({ type: 'gangwayrails', pos: [-12.1, S.pontoonY, S.fingers[2][2]], rotY: P, run: S.fingers[2][2] - QF, rise: -S.pontoonY, width: 1.6, thick: 0.2, posts: 3 });
  out.push({ type: 'shorepower', pos: [-9.9, S.pontoonY, -43.6], rotY: 0, berth: 'V2' });
  out.push({ type: 'dockbox', pos: [-15.6, S.pontoonY, -44.95], rotY: P });
  // ---- the hardstanding: a yacht laid up on stands by the quay, the mast rack, a trailer, drums
  out.push({ type: 'yardyacht', pos: [17.6, 0, -51.5], rotY: 0, length: 8.0, name: 'OYSTERCATCHER', color: '#2f3a57', accent: '#c9a24a' });
  out.push({ type: 'mastrack', pos: [22.35, 0, -47.4], rotY: 0, length: 8, notIn: 'tower' });
  out.push({ type: 'barrel', pos: [23.2, 0, -37.2], rotY: 0.4, variant: 1, color: '#2f6b62', notIn: 'tower' });
  out.push({ type: 'dinghy_trailer', pos: [22.2, 0, -33.6], rotY: P / 2 - 0.05, notIn: 'tower' });
  return out;
}
export const SLICE_PLACEMENTS = slicePlacements();
