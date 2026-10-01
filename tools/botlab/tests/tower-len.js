// Tower Command numbers on a stage: each side's track length, the one-rider speed, the checkpoints (m along, s) and
// the seconds from the centre to the goal with one rider (travel + checkpoints).
//   MAP=<id> MODE=tower PAGE=tools/botlab/tests/tower-len.js tools/botlab/run.sh tools/botlab/page.cjs
(async () => {
  const out = []; const R = (name, ok, info) => out.push({ name, ok: !!ok, info });
  const T = window.__inkwave.match.tower;
  const cps = T.cps.filter((c) => c.team === 0);
  const toGoal = T.path.len.map((L, t) => +(L / T.speed[t] + T.cps.filter((c) => c.team === t).reduce((a, c) => a + c.dur, 0)).toFixed(1));
  R('tower track', !T.placeholder, { len: T.path.len.map((v) => +v.toFixed(1)), speed: T.speed.map((v) => +v.toFixed(3)), cps: cps.map((c) => [+c.d.toFixed(1), +c.dur.toFixed(1)]), cpPoints: +T.cpPoints.toFixed(1), toGoal });
  return out;
})()
