// Who's-ahead HUD (src/ui/hud-lead.js): drives the match state and checks the roster groups' sizes, the LEAD / DANGER
// banners, the take-the-lead flash + sting, the hysteresis (no flicker) and that nothing covers the timer / badges.
//   MAP=testbox MODE=turf  PAGE=tools/botlab/tests/hud-lead.js tools/botlab/run.sh tools/botlab/page.cjs
//   MAP=testbox MODE=zones PAGE=tools/botlab/tests/hud-lead.js tools/botlab/run.sh tools/botlab/page.cjs
//   MAP=testbox MODE=tower PAGE=tools/botlab/tests/hud-lead.js tools/botlab/run.sh tools/botlab/page.cjs
(async () => {
  const g = window.__inkwave, m = g.match, dbg = g.debug, hud = g.hud, G = __G;
  const { LEAD } = await import('./src/ui/hud-lead.js');
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info: info === undefined ? undefined : JSON.parse(JSON.stringify(info)) });
  dbg.freeze();
  const step = (s) => { const n = Math.max(1, Math.round(s * 60)); for (let i = 0; i < n; i++) dbg.step(1000 / 60); };
  // the CSS size transition runs on the wall clock: wait (nudging frames) until each group's scale reaches its class's
  const target = (sq) => (sq.classList.contains('is-grow') ? LEAD.grow : sq.classList.contains('is-shrink') ? LEAD.shrink : 1);
  const settle = async () => {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
      if (i >= 3 && hud.squads.every((sq) => Math.abs((+(getComputedStyle(sq).scale) || 1) - target(sq)) < 0.004)) break;
    }
  };
  for (const a of m.actors) if (a.bot) a.bot.update = () => {};
  for (const a of m.actors) { a.intent.move.set(0, 0, 0); a.intent.fire = false; a.intent.squid = false; }
  hud.setVisible(true);
  const snd = []; const snd0 = hud._snd.bind(hud); hud._snd = (n, o) => { if (/^lead_/.test(n)) snd.push(n); return snd0(n, o); };
  const me = hud.lead.state().me, them = 1 - me;
  const S = () => hud.lead.state();
  // [your side, their side] sizes / banners as the page shows them (classes) + computed scales
  const look = () => hud.squads.map((sq) => ({ size: sq.dataset.lead || 'norm', grow: sq.classList.contains('is-grow'), shrink: sq.classList.contains('is-shrink'),
    banner: sq.querySelector('.iw-lead').classList.contains('is-on') ? sq.querySelector('.iw-lead').dataset.kind : null,
    text: sq.querySelector('.iw-lead__txt').textContent, scale: +(getComputedStyle(sq).scale) || 1 }));
  const sizes = () => look().map((l) => l.size).join('/');
  const banners = () => look().map((l) => l.banner || '-').join('/');
  const near = (a, b) => Math.abs(a - b) < 0.02;
  const rect = (el) => el.getBoundingClientRect();
  const hit = (a, b) => a.width > 0 && b.width > 0 && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  // the banners (when up) must not cover the timer, the count badges, the widgets under the timer or the "you" caret
  const clear = () => {
    const tags = [...hud.el.querySelectorAll('.iw-lead.is-on .iw-lead__tag')].map(rect);
    const others = [hud.timer, ...hud.zc, hud.zo.querySelector('.iw-zo__chip'), hud.twTrack, hud.twStatus, ...hud.el.querySelectorAll('.iw-sq.is-self .iw-sq__you'), ...hud.el.querySelectorAll('.iw-sq')]
      .filter((e) => e && e.offsetParent !== null).map(rect);
    return tags.length > 0 && tags.every((t) => others.every((o) => !hit(t, o)));
  };
  const mode = m.mode;
  R(`mode: ${mode}, the lead HUD is on and everything starts normal`, S().mode === mode && sizes() === 'norm/norm' && banners() === '-/-', { st: S(), sizes: sizes(), banners: banners() });

  if (mode === 'turf') {
    const P = G.paint, N = P.turfTotal;
    const cov = (t0, t1) => { P.counts[me] = Math.round(t0 * N); P.counts[them] = Math.round(t1 * N); };   // (yours, theirs) as shares of the whole map
    cov(0.12, 0.05); step(3);
    R('early game (17 % of the map inked, 12 vs 5): nothing yet', S().leader === -1 && sizes() === 'norm/norm', { st: S().turf, sizes: sizes() });
    cov(0.45, 0.40); step(3);
    R('close game (45 vs 40 %): both normal, no banners', S().leader === -1 && sizes() === 'norm/norm' && banners() === '-/-', { turf: S().turf, sizes: sizes() });
    cov(0.38, 0.36);
    // flicker: the share see-saws across the "ahead" line every sample — it must never show
    let flips = 0, prev = sizes();
    for (let i = 0; i < 16; i++) { cov(i % 2 ? 0.37 : 0.452, 0.316); step(0.5); if (sizes() !== prev) { flips++; prev = sizes(); } }
    R('the share see-sawing across the line every sample never shows (hold)', flips === 0 && S().leader === -1, { flips, sizes: sizes() });
    cov(0.45, 0.30); step(0.4);
    const early = S().leader;
    step(1.5);
    await settle();
    let L = look();
    R('you pull ahead (60 %): after a short hold you grow and they shrink', early === -1 && S().leader === me && L[0].grow && L[1].shrink && near(L[0].scale, LEAD.grow) && near(L[1].scale, LEAD.shrink), { early, L });
    R('taking the lead: the LEAD pop on your side + the rising sting, once', L[0].banner === 'lead' && L[0].text === 'LEAD' && !L[1].banner && snd.join() === 'lead_ours', { L, snd });
    { const call = hud.zcalls.querySelector('.iw-zcall__txt'); R('taking the lead is called out: "WE TOOK THE LEAD!"', S().lastCall === 'WE TOOK THE LEAD!' && !!call && call.textContent === 'WE TOOK THE LEAD!', { lastCall: S().lastCall, shown: call && call.textContent }); }
    R('the banner is clear of the timer, the badges and the "you" caret', clear(), { tag: [...hud.el.querySelectorAll('.iw-lead.is-on .iw-lead__tag')].map((e) => { const r = rect(e); return [r.left, r.top, r.right, r.bottom].map(Math.round); }), timer: (() => { const r = rect(hud.timer); return [r.left, r.top, r.right, r.bottom].map(Math.round); })() });
    step(3);
    R('turf has no standing LEAD banner: the pop goes after a few seconds (sizes stay)', banners() === '-/-' && sizes() === 'grow/shrink', { banners: banners(), sizes: sizes() });
    cov(0.44, 0.34); step(2);   // 56.4 %: under "ahead" but over "ahead off"
    R('hysteresis: dipping to 56 % keeps the lead', S().leader === me && sizes() === 'grow/shrink', { turf: S().turf });
    cov(0.43, 0.37); step(2);   // 53.75 %
    await settle(); L = look();
    R('back to a close game (54 %): both normal again', S().leader === -1 && sizes() === 'norm/norm' && near(L[0].scale, 1) && near(L[1].scale, 1), { turf: S().turf, L });
    cov(0.46, 0.40); step(2);   // 53.5 %, 6 points
    R('late and close (46 vs 40 % of the map): still normal', S().leader === -1 && sizes() === 'norm/norm', { turf: S().turf });
    cov(0.452, 0.35); step(2);   // 56 %, but 10 points more of the map
    R('a 10-point lead on a well-inked map (45 vs 35) shows; the same team ahead again: no second sting', S().leader === me && snd.length === 1 && banners() === '-/-', { turf: S().turf, snd });
    cov(0.55, 0.22); step(2);   // 71 %
    await settle(); L = look();
    R('near-landslide (71 / 29): DANGER bounces on the losing side', S().slide && L[1].banner === 'danger' && L[1].text === 'DANGER' && !L[0].banner && L[1].shrink && L[0].grow, { turf: S().turf, L });
    R('the DANGER banner is clear of everything', clear());
    R('the DANGER banner bounces (animated)', getComputedStyle(hud.squads[1].querySelector('.iw-lead__tag')).animationName.includes('iw-lead-alarm'), getComputedStyle(hud.squads[1].querySelector('.iw-lead__tag')).animationName);
    cov(0.52, 0.27); step(2);   // 65.8 %: over "slide off"
    R('hysteresis: 66 % keeps DANGER up', S().slide && banners() === '-/danger', { turf: S().turf });
    cov(0.50, 0.29); step(2);   // 63 %
    R('63 %: DANGER goes, the lead stays', !S().slide && banners() === '-/-' && sizes() === 'grow/shrink', { turf: S().turf, banners: banners() });
    cov(0.30, 0.49); step(3);
    await settle(); L = look();
    R('they take the lead: they grow, you shrink, their side pops LEAD + the falling sting', S().leader === them && L[1].grow && L[0].shrink && L[1].banner === 'lead' && snd.join() === 'lead_ours,lead_theirs',
      { st: S(), L, snd });
    { const call = hud.zcalls.querySelector('.iw-zcall__txt'); R('their taking the lead is called out: "WE LOST THE LEAD!"', S().lastCall === 'WE LOST THE LEAD!' && !!call && /LEAD/.test(call.textContent), { lastCall: S().lastCall, shown: call && call.textContent }); }
  }

  if (mode === 'zones') {
    const Z = m.zones;
    Z.nextSwap = 999;                                        // (no rotation mid-test)
    const zs = () => Z.active.zones;
    const paintZones = (team, frac) => { for (const z of zs()) z.cells.forEach((c, i) => { G.paint.grid[c] = i < z.cells.length * frac ? team + 1 : 0; }); };
    const inkOver = (team, frac, holder) => { for (const z of zs()) z.cells.forEach((c, i) => { G.paint.grid[c] = i < z.cells.length * frac ? team + 1 : holder + 1; }); };
    step(1);
    R('level counts (100 / 100): nobody leads', S().leader === -1 && sizes() === 'norm/norm' && banners() === '-/-', { count: Z.count, sizes: sizes() });
    Z.count = [100, 100]; Z.count[me] = 92;
    step(0.2);
    const early = S().leader;
    step(0.6);
    await settle();
    let L = look();
    R('you count lower (92 vs 100): you grow + bouncing LEAD on your side; they stay normal (nobody holds the zone)',
      early === -1 && S().leader === me && L[0].grow && L[0].banner === 'lead' && !L[1].banner && L[1].size === 'norm' && near(L[0].scale, LEAD.grow) && near(L[1].scale, 1), { early, L, owner: Z.owner });
    R('the rising sting played once', snd.join() === 'lead_ours', snd);
    R('the LEAD banner bounces and is clear of the count badges / objective chip / timer', getComputedStyle(hud.squads[0].querySelector('.iw-lead__tag')).animationName.includes('iw-lead-bounce') && clear());
    paintZones(me, 1); step(1.5);
    await settle(); L = look();
    R('you (ahead) hold the zone: they shrink', Z.owner === me && S().leader === me && L[1].shrink && near(L[1].scale, LEAD.shrink) && L[0].grow, { owner: Z.owner, L });
    inkOver(them, 0.33, me); step(1);
    await settle(); L = look();
    R('they contest it (33 % of the zone inked back): they\'re back to normal', Z.owner === me && S().contested && L[1].size === 'norm' && near(L[1].scale, 1), { owner: Z.owner, share: zs().map((z) => z.share), L });
    inkOver(them, 0.26, me); step(1);
    R('hysteresis: 26 % still counts as contesting', S().contested && sizes() === 'grow/norm', { share: zs().map((z) => z.share) });
    inkOver(them, 0.15, me); step(1);
    R('pushed back (15 %): they shrink again', !S().contested && sizes() === 'grow/shrink', { share: zs().map((z) => z.share) });
    Z.count[them] = Z.count[me] - 6; step(1);
    await settle(); L = look();
    R('they take the lead (count lower): they grow + LEAD moves to their side; you (holding) are normal, falling sting',
      S().leader === them && L[1].grow && L[1].banner === 'lead' && !L[0].banner && L[0].size === 'norm' && snd.join() === 'lead_ours,lead_theirs', { count: Z.count, owner: Z.owner, L, snd });
    inkOver(them, 0.45, me); step(0.6);                     // (neutralised: nobody's count moves any more)
    Z.count[me] = Z.count[them] = 70; step(1.4);
    R('level again: nobody leads (after a longer hold), banners down', Z.owner === -1 && S().leader === -1 && sizes() === 'norm/norm' && banners() === '-/-', { count: Z.count, owner: Z.owner });
    Z.count[them] = 67; step(1);
    R('the same team back ahead: no second sting', S().leader === them && snd.length === 2, snd);
  }

  if (mode === 'tower') {
    const T = m.tower, A = m.actors.filter((a) => a.team === me), B = m.actors.filter((a) => a.team === them);
    const park = (a, i = 0) => { const ang = (a.team * 4 + i) * 0.7; a.pos.set(T.pos.x + 9 + Math.cos(ang) * 2, T.pos.y + 0.2, T.pos.z + Math.sin(ang) * 2 + (a.team ? -12 : 12)); a.vel.set(0, 0, 0); a.grounded = false; };
    const onTop = (a, k = 0) => { const off = [[0.65, 0.65], [-0.65, 0.65], [0.65, -0.65], [-0.65, -0.65]][k % 4]; a.pos.set(T.pos.x + off[0], T.top + 0.05, T.pos.z + off[1]); a.vel.set(0, 0, 0); a.grounded = false; };
    const sgn = me === 0 ? 1 : -1;                         // s > 0 is Bravo's half: your push runs toward +sgn
    [...A, ...B].forEach((a, i) => { if (!a.alive) a.respawn?.(); park(a, i); });
    step(0.5);
    R('nobody has pushed (100 / 100): nobody leads', S().leader === -1 && sizes() === 'norm/norm', { score: T.scores() });
    onTop(A[0]); step(4);
    await settle();
    let L = look();
    R('you ride it into their half and score: you grow + LEAD; they shrink (you control it on their half)',
      T.owner === me && sgn * T.s > 1 && S().leader === me && L[0].grow && L[0].banner === 'lead' && L[1].shrink && near(L[0].scale, LEAD.grow) && near(L[1].scale, LEAD.shrink), { s: T.s, score: T.scores(), L });
    R('the rising sting played once; the banner is clear of the badges / track', snd.join() === 'lead_ours' && clear(), snd);
    onTop(B[0], 1); step(1);
    R('they jump on (contested): they\'re back to normal', T.contested && sizes() === 'grow/norm', { contested: T.contested, sizes: sizes() });
    A.forEach((a, i) => park(a, i)); step(1.2);
    R('they claim it on their own half: still normal', T.owner === them && sgn * T.s > 0 && sizes() === 'grow/norm', { owner: T.owner, s: T.s });
    T.s = -sgn * 1.2; T._place(1); step(1);               // (just over the centre: not far enough to score past your 96)
    R('they (behind) ride it on your half: normal, you still lead', T.owner === them && S().leader === me && sizes() === 'grow/norm', { s: T.s, score: T.scores() });
    B.forEach((a, i) => park(a, i)); onTop(A[0]); step(1.5);
    R('you retake it on your own half: they stay normal (you aren\'t on their half)', T.owner === me && sgn * T.s < 0 && sizes() === 'grow/norm', { s: T.s, owner: T.owner });
    A.forEach((a, i) => park(a, i));
    T.count[them] = T.count[me] - 5; T.s = -sgn * 6; T._place(1); onTop(B[0]); step(1.5);
    await settle(); L = look();
    R('they go ahead and control it on your half: they grow + LEAD, you shrink, falling sting',
      S().leader === them && T.owner === them && L[1].grow && L[1].banner === 'lead' && !L[0].banner && L[0].shrink && snd.join() === 'lead_ours,lead_theirs', { score: T.scores(), s: T.s, L, snd });
    B.forEach((a, i) => park(a, i)); onTop(A[0]); step(1.5);
    R('you (behind) retake it on your half: normal again', T.owner === me && sizes() === 'norm/grow', { owner: T.owner, s: T.s, sizes: sizes() });
  }

  // practice / boss: nothing (the whole feature is off)
  m.practice = true; step(0.3); await settle();
  const off = look();
  R('practice: both groups normal, no banners', S().mode === null && off.every((l) => l.size === 'norm' && !l.banner && near(l.scale, 1)), off);
  m.practice = false; m.mode = 'boss'; step(0.3);
  R('boss mode: off', S().mode === null && sizes() === 'norm/norm', S());
  return out;
})()
