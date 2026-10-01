// Who is revealed to a team: an enemy shows on that team's map (and counts as located for its bots, botSight.js)
// only while something gives their position away (the user's rules, 2026-09-29):
//   • located — tracked by that team (Echo Orb, Lurk Mine, Tracer … status.track) or pinged by its Deep Sonar
//   • standing in that team's ink (their own groundTeam reads enemy ink)
//   • hit by that team's ink — hurt, not back to full health — and not in their own ink (two teams: any damage an enemy
//     carries came from the other team's ink, shots or floor)
//   • anything registered later: registerReveal(id, (actor, team) => bool) — a stage gimmick or new mechanic that gives
//     a player's position away adds its own test here and the map and the bots both follow it
// Everything read is synced for remote players too (status, groundTeam, hp: net/netmatch.js), so online guests see
// the same map.
import { PLAYER } from '../config.js';

const REVEALS = [
  { id: 'located', test: (e, team) => (e.status?.track > 0 && e.status.trackTeam === team) || (e.status?.reveal > 0 && e.status.revealTeam === team) },
  { id: 'inYourInk', test: (e) => e.groundTeam === 2 },
  { id: 'hurt', test: (e) => e.hp < PLAYER.hp - 0.5 && e.groundTeam !== 1 },
];

export function registerReveal(id, test) {
  const i = REVEALS.findIndex((r) => r.id === id);
  if (i >= 0) REVEALS[i] = { id, test }; else REVEALS.push({ id, test });
}

// the first reason `e` is revealed to `team` ('located', 'inYourInk', 'hurt', or a registered id), or null
export function revealedTo(e, team) {
  if (!e || !e.alive || e.team === team) return null;
  for (const r of REVEALS) { try { if (r.test(e, team)) return r.id; } catch (err) { /* a broken test reveals nothing */ } }
  return null;
}
