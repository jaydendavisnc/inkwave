// sub-tweaks pictures: staged views of the changed subs on testbox, for tools/botlab/shoot.cjs (PRE=this file,
// PRE_ARGS=<scene>; PLAY=1 so shoot.cjs keeps the paint). Each scene freezes its devices in a telling moment — a
// sonar ping half way out, a windup half way through with its flash on, a curtain's ink held — while the camera
// moves to each picture (SubSystem.update is wrapped to hold them). Scenes:
// (a windup is held with its beep pulse firing every frame, so the glow is in the picture with its danger ring)
//   sprinkler      a sprinkler after 10 s of spraying, with rings at its old reach (3.2 m, white) and the new (5.5 m, dark)
//   mine-owner     a Lurk Mine as its own team sees it (a ghost)      mine-enemy   the same mine, the enemy's eyes (nothing)
//   mine-reveal    tripped by a foe: popped up, mid-windup, for everyone
//   beacon         two Hop Beacons, 2 jumps left and 1 jump left, a sonar ping half way out
//   curtain        two Drip Curtains, full and half ink (meter), seen from the front and the back
//   windup         a Skitter Bomb, a Waddle Bomb and a Lurk Mine mid-windup by their targets
// The pictures in <OUT>/ (PNG → JPEG q78), each scene staged round (-10, 0, -14):
//   S='[{"name":"mine-owner","from":[-7.4,1.8,-10.8],"look":[-10,0.1,-14],"fov":50}]'
//   MAP=testbox MODE=turf PLAY=1 PRE=tools/botlab/scenes/sub-tweaks.js PRE_ARGS=mine-owner SHOTS="$S" \
//     tools/botlab/run.sh tools/botlab/shoot.cjs                     (ACTORS=1 for mine-reveal and windup: the targets)
//   sprinkler: [-2,10,-4] → [-10,0,-14] fov 55, top [-10.02,17,-14] fov 50 · mine-*: as above (reveal [-6.6,2.6,-9.6] fov 55)
//   beacon: [-10,2.6,-6.5] → [-10,0.7,-14] fov 55, 10 m [-9,1.7,-4] → [-10,0.9,-14] fov 60
//   curtain: front [-10,1.8,-5] / back [-10,1.8,-23] → [-10,1.6,-14] fov 60 · windup: [-10,3.4,-21] → [-10,0.3,-13.6] fov 62
(async () => {
  const g = window.__inkwave, m = g.match, dbg = g.debug, THREE = await import('three');
  const { SUBS, PLAYER } = await import('./src/config.js');
  const { SUB_KITS } = await import('./src/game/kits/registry.js');
  const G = window.__G, S = G.subs, K = SUB_KITS, SC = window.__preArgs || 'sprinkler';
  dbg.freeze();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const DT = 1 / 60, frame = () => { g._skipRender = true; g._frame(DT); g._skipRender = false; };
  const step = (s) => { for (let i = 0, n = Math.max(1, Math.round(s * 60)); i < n; i++) frame(); };
  const me = m.local, others = m.actors.filter((a) => a !== me), foes = others.filter((a) => a.team !== me.team);
  const zero = (a) => { const it = a.intent; it.move.set(0, 0, 0); it.fire = it.squid = it.jump = it.sub = it.special = false; };
  for (const a of m.actors) if (a.bot) a.bot.update = () => zero(a);
  const put = (a, p, yaw = 0) => { a.pos.copy(p); a.pos.y += 0.02; a.vel.set(0, 0, 0); a.yaw = a.aimYaw = yaw; if (a.bot) { a.bot.aimYaw = yaw; a.bot.aimPitch = 0; } };
  const hide = (a, i) => { put(a, V(-24 + (i % 4) * 1.5, 0, 36 + Math.floor(i / 4) * 1.5)); a.character.setVisible?.(false); a.character.root.visible = false; };
  const show = (a, p, yaw) => { put(a, p, yaw); a.character.setVisible?.(true); a.character.root.visible = true; };
  S.clear(); G.projectiles.clear(); G.paint.clear();
  for (const a of m.actors) { if (!a.alive) a.respawn(); a.hp = 1e6; a.invuln = 0; zero(a); }
  others.forEach(hide); hide(me, 7);
  step(0.2);
  const last = (a) => a[a.length - 1], items = (k) => S.items.filter((it) => it.kind === k && it.state !== 'dead');
  const place = (a, kind, p) => { put(a, p, 0); step(0.03); S.use(a, SUBS[kind]); const it = last(items(kind)); hide(a, 7); return it; };
  const holds = [];   // per-frame holds (before the devices update): a frozen moment
  const u0 = S.update.bind(S);
  S.update = (dt) => { for (const h of holds) h(); u0(dt); };
  const info = { scene: SC };
  // (staged off the deck's middle: testbox draws a stray dark dome / quad at the world origin in these pictures)
  const O = V(-10, 0, -14), at = (x, y, z) => V(O.x + x, O.y + y, O.z + z);
  const ring = (r, col, w = 0.05) => { const mm = new THREE.Mesh(new THREE.RingGeometry(r - w, r + w, 128).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false })); mm.position.set(O.x, 0.03, O.z); mm.renderOrder = 5; G.scene.add(mm); return mm; };

  if (SC === 'sprinkler') {
    S._throw(me, SUBS.sprinkler, at(0, 0.5, 0), V(0, -2, 0), false);
    step(10);
    holds.push(() => { for (const it of items('sprinkler')) it.pulseT = 9; });   // (no more drops while the pictures are taken)
    ring(3.2, 0xffffff, 0.04); ring(SUBS.sprinkler.sprayRadius, 0x15121c, 0.05);
    info.cov = 'rings: white 3.2 m (old), dark 5.5 m (new)';
  } else if (SC.startsWith('mine')) {
    const it = place(me, 'mine', at(0, 0, 0));
    step(1);
    S.viewer = SC === 'mine-enemy' ? foes[0].team : me.team;
    if (SC === 'mine-reveal') {
      S.viewer = foes[0].team;
      show(foes[0], at(1.7, 0, 0.6), -Math.PI / 2 - 0.3);
      step(0.05);
      const D = SUBS.mine.delay;
      holds.push(() => { if (it.fuse != null) { it.fuse = D * 0.45; it.tripT = 0.3; it.flashT = 0.97; } });
      step(0.1);
    }
    info.look = S.mineLook(it, S.viewer); info.visible = it.mesh.visible;
  } else if (SC === 'beacon') {
    const a = place(me, 'beacon', at(-1.2, 0, 0)), b = place(me, 'beacon', at(1.2, 0, 0));
    S._useBeacon(b, 1);
    holds.push(() => { a.born = G.time - 0.62; b.born = G.time - 0.62 + 0.9; });
    step(0.1);
    info.uses = [a.uses, b.uses];
  } else if (SC === 'curtain') {
    S._throw(me, SUBS.curtain, at(-2.1, 0.5, 0), V(0, -2, 0.02), false);
    S._throw(me, SUBS.curtain, at(2.1, 0.5, 0), V(0, -2, 0.02), false);
    step(0.6);
    const [c1, c2] = items('curtain');
    holds.push(() => { c1.hp = SUBS.curtain.hp + SUBS.curtain.decay * DT; c2.hp = SUBS.curtain.hp / 2 + SUBS.curtain.decay * DT; });
    step(0.1);
    info.hp = [c1.hp, c2.hp];
  } else if (SC === 'windup') {
    const [f1, f2, f3] = foes, D = 0.45;
    // each bomb held part-way through its windup (40 % to go, its flash on) once it has wound up 0.25 s
    holds.push(() => {
      for (const it of items('seeker')) if (it.state === 'prime' && it.t > 0.25) { it.fuse = D * 0.4; it.t = 0.3; it.flashT = 0.97; }
      for (const it of K.waddle.items) if (it.state === 'prime' && it.t > 0.25) { it.fuse = D * 0.4; it.t = 0.31; it.flashT = 0.97; }
      for (const it of items('mine')) if (it.fuse != null && it.tripT > 0.25) { it.fuse = D * 0.4; it.tripT = 0.3; it.flashT = 0.97; }
    });
    // a Lurk Mine (armed first), then its foe on it
    const mi = place(me, 'mine', at(4, 0, 0));
    step(1);
    // a Skitter Bomb at its target
    show(f1, at(-4, 0, 1.1), Math.PI);
    S._throw(me, SUBS.seeker, at(-4, 0.6, 0), V(0, -2, 0), false);
    // a Waddle Bomb at its target
    show(f2, at(0, 0, 1.1), Math.PI);
    S.use(me, SUBS.waddle); const wd = last(K.waddle.items); wd.pos.copy(at(0, 0.5, 0)); wd.vel.set(0, -1, 0);
    show(f3, at(4, 0, 1.6), Math.PI);
    step(0.12); wd.state = 'walk'; wd.target = f2; wd.t = 0; wd.walkT = 0; wd.pos.copy(at(0, 0, 0.1));
    step(0.5);
    info.states = [items('seeker').map((x) => x.state), wd.state, mi.fuse != null ? 'tripped' : 'lurking'];
  }
  return info;
})()
