#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/mnt/d/VibeCoding/lazyTodo"
PROJECT_ID="lazytodo"
AUTOPILOT_SESSION="ao-autopilot-${PROJECT_ID}"

cd "${REPO_ROOT}"
tmux has-session -t "${AUTOPILOT_SESSION}" 2>/dev/null && tmux kill-session -t "${AUTOPILOT_SESSION}" || true
tmux new-session -d -s "${AUTOPILOT_SESSION}" "cd \"${REPO_ROOT}\" && ./.ao-tools/run-autopilot.sh --from-existing --all-open --keep-alive"

echo "Autopilot tmux: ${AUTOPILOT_SESSION}"
