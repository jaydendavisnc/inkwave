// Botlab test arenas (never shipped): registered in the game page before a match starts, by page.cjs and match.cjs.
//   testbox — a flat 56 × 96 m deck, spawn steps and one wall (a zipline target)
//   podbox  — the same with sprout pods (src/game/pods.js, mirrored) in the engine's planters (troughs for the walls,
//             tubs for the canopies): two bramble walls, each across a real gap — 'gate' closes the 6 m gap in a
//             barrier (x 11…28 at z = −16, running into the water: the way round is past its west end), 'lane' seals a
//             4 m dead-end lane (x 20…24, z −36…−22: no way round); five canopies — 'mid' in the open, 'calib' in the
//             open east of the wall block, 'edge' at the water's edge, 'track' beside the tower track (it waits while the
//             tower's by), 'ontrack' on it (off in Tower Command). The tower track runs x = −8 from the centre to z = 32
//             (tools/botlab/tests/pods.js)
const TEST_MAPS = ['testbox', 'podbox'];
function defineTestMap(MAP) {
  return `(async () => {
    const { MAPS } = await import('./src/config.js'); const { MAP_LAYOUTS } = await import('./src/world/maps.js');
    const id = '${MAP}';
    if (!MAPS.find((m) => m.id === id)) MAPS.push({ id, name: id === 'podbox' ? 'Pod Box' : 'Test Box', blurb: '', theme: 'day', times: { day: 'day', dusk: 'sunset' } });
    const B = (x0, x1, y0, y1, z0, z1, o = {}) => ({ kind: 'box', min: [x0, y0, z0], max: [x1, y1, z1], color: '#d8d2c4', pattern: 3, ...o });
    MAP_LAYOUTS[id] = { id, bounds: { minX: -28, maxX: 28, minZ: -48, maxZ: 48 }, spawnPads: [[0, 2.4, -44], [0, 2.4, 44]], spawnBarrier: 4.2,
      single: [B(-28, 28, -1.2, 0, -40, 40)], half: [B(-8, 8, -1.2, 2.4, -48, -40), B(14, 15, 0, 4, -8, 8)], decor: { lamps: [], palms: [], flags: [] } };
    if (id === 'podbox') {
      const L = MAP_LAYOUTS.podbox;
      const wall = { paint: false, roof: true, color: '#b9b2a4' };
      // the dead-end lane: 4 m wide between walls you can't ink or stand on
      L.half.push(B(19.5, 20, 0, 2.6, -36.5, -22, wall), B(24, 24.5, 0, 2.6, -36.5, -22, wall), B(20, 24, 0, 2.6, -36.5, -36, wall));
      // the barrier with the gate's gap (x 17…23), 3 m tall, from x 11 into the water
      L.half.push(B(11, 17, 0, 3, -16.5, -15.5, wall), B(23, 28, 0, 3, -16.5, -15.5, wall));
      const Q = Math.PI / 2;
      Object.assign(L, {
        tower: { path: [[0, 0], [-8, 0], [-8, 32]], checkpoints: [[-8, 16]] },
        pods: { mirror: true, planter: true, list: [
          { id: 'mid', kind: 'canopy', pos: [0, 0, -6], rotY: 0 },
          { id: 'gate', kind: 'wall', pos: [20, 0, -16], rotY: 0, size: [6, 2.7, 1.2] },
          { id: 'lane', kind: 'wall', pos: [22, 0, -27], rotY: 0, size: [4, 2.7, 1.2] },
          { id: 'edge', kind: 'canopy', pos: [26.3, 0, 8], rotY: Q },
          { id: 'track', kind: 'canopy', pos: [-4.85, 0, 14], rotY: 0 },
          { id: 'ontrack', kind: 'canopy', pos: [-8, 0, 24], rotY: 0 },
          { id: 'calib', kind: 'canopy', pos: [19.5, 0, -6], rotY: 0 },
        ] },
      });
    }
    return true; })()`;
}
module.exports = { TEST_MAPS, defineTestMap };
