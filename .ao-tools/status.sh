#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="lazytodo"
GRAPH_PORT="3310"
GRAPH_SESSION="ao-graph-${PROJECT_ID}"
LEGACY_GRAPH_SESSION="ao-graph"
CORE_SESSION="ao-core-${PROJECT_ID}"
WATCHDOG_SESSION="ao-watchdog-${PROJECT_ID}"
AUTOPILOT_SESSION="ao-autopilot-${PROJECT_ID}"
REPO_ROOT="/mnt/d/VibeCoding/lazyTodo"
ROLE_PROFILE_PATH="${REPO_ROOT}/.ao-tools/role-profiles.json"
AUTOPILOT_STATE_PATH="${REPO_ROOT}/.ao-tools/autopilot.state.json"

echo "AO Core:  http://localhost:3000"
echo "AO Graph: http://localhost:${GRAPH_PORT}"
echo "Role profile: ${ROLE_PROFILE_PATH}"
echo "Autopilot state: ${AUTOPILOT_STATE_PATH}"
if curl -fsS "http://localhost:3000" >/dev/null 2>&1; then
  echo "Core health: up"
else
  echo "Core health: down"
fi
if curl -fsS "http://localhost:${GRAPH_PORT}/health" >/dev/null 2>&1; then
  echo "Graph health: up"
else
  echo "Graph health: down"
fi
echo
ao session ls --project "${PROJECT_ID}" || true
echo
tmux ls 2>/dev/null | grep -E "${CORE_SESSION}" || echo "Core tmux not running"
tmux ls 2>/dev/null | grep -E "${GRAPH_SESSION}|${LEGACY_GRAPH_SESSION}" || echo "Graph tmux not running"
tmux ls 2>/dev/null | grep -E "${AUTOPILOT_SESSION}" || echo "Autopilot tmux not running"
tmux ls 2>/dev/null | grep -E "${WATCHDOG_SESSION}" || echo "Watchdog tmux not running"
if [[ -f "${AUTOPILOT_STATE_PATH}" ]]; then
  echo
  node -e "const fs=require('fs');const p=process.argv[1];const raw=fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'');const j=JSON.parse(raw);const loop=j.lastLoop?.loop||0;const st=j.status||'unknown';const c=j.counters||{};console.log(\`Autopilot telemetry: status=\${st} loop=\${loop} spawned=\${c.spawnedTotal||0} healed=\${c.healedTotal||0} gates=\${c.gateFailuresTotal||0}\`);" "${AUTOPILOT_STATE_PATH}" || true
fi
