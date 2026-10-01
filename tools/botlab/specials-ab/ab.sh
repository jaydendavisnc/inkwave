#!/bin/bash
# A/B: bots vs enemy specials (src/game/botSpecials.js). The awareness off (SPECIAL_AI=0: the old behaviour, same code)
# vs on, random loadouts, Turf War (180 s) and full Zone Control matches on four stages; and head to head in Turf War
# (SPECIAL_AI=team0 / team1: one team on, the other off — the on team's K/D and turf against the old behaviour).
#   tools/botlab/specials-ab/ab.sh <outdir> [N_TURF=8] [N_ZONES=4] [N_H2H=4]      (per stage and side)
# Env: BOTLAB_OUT / SLOTS (run.sh's lock), PAR (matches at once, default 3), STAGES (default below), SPCHARGE (match.cjs:
# the special gauge ×; e.g. 3 for a special-heavy batch — use its own <outdir>).
# Resumable: a match whose JSON is already in <outdir> is skipped. Summary: node tools/botlab/specials-ab/agg.cjs <outdir>
set -u
OUT=${1:?usage: ab.sh <outdir> [N_TURF] [N_ZONES] [N_H2H]}; NT=${2:-8}; NZ=${3:-4}; NH=${4:-4}; PAR=${PAR:-3}
STAGES=${STAGES:-halyard crossmarket craters spirhalite}
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
count() { local i=1; while [ "$i" -le "$1" ]; do echo "$i"; i=$((i + 1)); done; }   # (1…n; none for 0 — seq 1 0 counts down)
list() {
  for i in $(count "$NT"); do for S in $STAGES; do for AI in 0 1; do echo "turf $S $AI $i"; done; done; done
  for i in $(count "$NZ"); do for S in $STAGES; do for AI in 0 1; do echo "zones $S $AI $i"; done; done; done
  for i in $(count "$NH"); do for S in $STAGES; do for AI in team0 team1; do echo "turf $S $AI h$i"; done; done; done
}
run_one() {
  local MODE=$1 S=$2 AI=$3 I=$4 f="$OUT/$1-$2-$3-$4"
  [ -s "$f.json" ] && return 0
  MAP=$S MODE=$MODE SECS=180 SPECIAL_AI=$AI OUT="$f.json" WATCHDOG=1200000 "$ROOT/tools/botlab/run.sh" "$ROOT/tools/botlab/match.cjs" > "$f.log" 2>&1
  echo "$(date +%H:%M:%S) $MODE $S $AI $I $([ -s "$f.json" ] && echo ok || echo FAILED)"
}
export -f run_one; export OUT ROOT; [ -n "${SPCHARGE:-}" ] && export SPCHARGE
list | xargs -P "$PAR" -L 1 bash -c 'run_one "$0" "$1" "$2" "$3"'
node "$ROOT/tools/botlab/specials-ab/agg.cjs" "$OUT"
