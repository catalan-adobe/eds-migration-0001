#!/usr/bin/env bash
# One line: the latest monitor snapshot of a run, and the harness's output.
set -euo pipefail
# shellcheck disable=SC2012  # the newest run by time: ls -t is the point; run ids are plain
R=$(ls -td ~/repos/ai/migration-tests/e2e-runs/"$1"*/ | head -1)
tail -1 "$R/e2e/monitor.jsonl" | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); if (s.stop) { console.log("STOP", s.stop); process.exit(0); } console.log(s.minutes+"min", "$"+s.cost, "turns", s.turns, "err", s.toolErrors, JSON.stringify(s.toolCalls), Object.entries(s.steps).filter(([k])=>!["elements","blocks"].includes(k)).map(([k,v])=>k+":"+v).join(" "), JSON.stringify(s.progress), "wf", s.workflows.length)'
tail -2 "$2"
