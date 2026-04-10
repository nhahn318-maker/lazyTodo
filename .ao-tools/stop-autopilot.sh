#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="lazytodo"
AUTOPILOT_SESSION="ao-autopilot-${PROJECT_ID}"

tmux has-session -t "${AUTOPILOT_SESSION}" 2>/dev/null && tmux kill-session -t "${AUTOPILOT_SESSION}" || true
echo "Stopped autopilot session: ${AUTOPILOT_SESSION}"
