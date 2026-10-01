# A/B: bots vs enemy specials

The job for `src/game/botSpecials.js` (the bots' awareness of enemy specials). Each match runs the same code with the
awareness off (`SPECIAL_AI=0`, the old behaviour) or on, random loadouts:

```sh
git fetch && git checkout bots-specials && git pull
# the main batch: per stage and side 8 Turf War (180 s) + 4 full Zone Control, plus 4 head-to-head Turf War per stage
# and side (SPECIAL_AI=team0 / team1: one team aware, the other not). 128 matches.
BOTLAB_OUT=$PWD/.botlab SLOTS=3 PAR=3 tools/botlab/specials-ab/ab.sh .botlab/results/bots-specials/main 8 4 4
# a special-heavy Turf War batch (gauges ×3: about 3× the specials), e.g. 12 per stage and side, no zones / head to head
BOTLAB_OUT=$PWD/.botlab SLOTS=3 PAR=3 SPCHARGE=3 tools/botlab/specials-ab/ab.sh .botlab/results/bots-specials/heavy 12 0 0
node tools/botlab/specials-ab/agg.cjs .botlab/results/bots-specials/main      # the summary (ab.sh prints it too)
```

- Stages: `STAGES='halyard crossmarket craters spirhalite'` by default (set it to change).
- Resumable: a match whose JSON is already in the out dir is skipped (re-run the same line after a crash).
- Killing it: stop the `xargs -P` process too (it keeps starting matches), then the `run.sh` / Electron children.
- The summary: per mode, off vs on (means per match ± sd): splats caused by each special (both teams' bots), all splats
  (and water), specials used, turf, stuck %, Zone Control captures / time in the zone, bot CPU; the aware bots'
  `SPECIAL_STATS` per match; per stage; head to head: the aware team's K/D, special deaths, turf and wins.
