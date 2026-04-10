#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="lazytodo"
GRAPH_SESSION="ao-graph-${PROJECT_ID}"
LEGACY_GRAPH_SESSION="ao-graph"
CORE_SESSION="ao-core-${PROJECT_ID}"
WATCHDOG_SESSION="ao-watchdog-${PROJECT_ID}"
AUTOPILOT_SESSION="ao-autopilot-${PROJECT_ID}"

tmux has-session -t "${GRAPH_SESSION}" 2>/dev/null && tmux kill-session -t "${GRAPH_SESSION}" || true
tmux has-session -t "${LEGACY_GRAPH_SESSION}" 2>/dev/null && tmux kill-session -t "${LEGACY_GRAPH_SESSION}" || true
tmux has-session -t "${CORE_SESSION}" 2>/dev/null && tmux kill-session -t "${CORE_SESSION}" || true
tmux has-session -t "${AUTOPILOT_SESSION}" 2>/dev/null && tmux kill-session -t "${AUTOPILOT_SESSION}" || true
tmux has-session -t "${WATCHDOG_SESSION}" 2>/dev/null && tmux kill-session -t "${WATCHDOG_SESSION}" || true
ao stop || true
echo "Stopped core/graph/autopilot/watchdog sessions and requested AO stop."
