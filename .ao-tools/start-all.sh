#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/mnt/d/VibeCoding/lazyTodo"
PROJECT_ID="lazytodo"
REPO_SLUG="nhahn318-maker/lazyTodo"
GRAPH_PORT="3310"
GRAPH_SESSION="ao-graph-${PROJECT_ID}"
LEGACY_GRAPH_SESSION="ao-graph"
CORE_SESSION="ao-core-${PROJECT_ID}"
WATCHDOG_SESSION="ao-watchdog-${PROJECT_ID}"
AUTOPILOT_SESSION="ao-autopilot-${PROJECT_ID}"
ROLE_PROFILE_PATH="${REPO_ROOT}/.ao-tools/role-profiles.json"
AUTOPILOT_AUTO_START="${AO_AUTOPILOT_AUTO_START:-1}"

if [[ -z "${REPO_SLUG}" ]]; then
  ORIGIN_URL="$(git -C "${REPO_ROOT}" remote get-url origin 2>/dev/null || true)"
  if [[ "${ORIGIN_URL}" =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    REPO_SLUG="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
  fi
fi

if [[ -z "${REPO_SLUG}" ]]; then
  echo "Cannot detect repo slug. Pass --repo to bootstrap again." >&2
  exit 1
fi

wait_http() {
  local url="$1"
  local retries="${2:-30}"
  for i in $(seq 1 "$retries"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_core() {
  tmux has-session -t "${CORE_SESSION}" 2>/dev/null && tmux kill-session -t "${CORE_SESSION}" || true
  tmux new-session -d -s "${CORE_SESSION}" "cd \"${REPO_ROOT}\" && ao stop >/dev/null 2>&1 || true; ao start \"${PROJECT_ID}\""
}

start_graph() {
  tmux has-session -t "${GRAPH_SESSION}" 2>/dev/null && tmux kill-session -t "${GRAPH_SESSION}" || true
  tmux has-session -t "${LEGACY_GRAPH_SESSION}" 2>/dev/null && tmux kill-session -t "${LEGACY_GRAPH_SESSION}" || true
  tmux new-session -d -s "${GRAPH_SESSION}" "cd \"${REPO_ROOT}\" && node graph-dashboard/server.js --port \"${GRAPH_PORT}\" --project \"${PROJECT_ID}\" --repo \"${REPO_SLUG}\" --cwd \"${REPO_ROOT}\" --role-profiles \"${ROLE_PROFILE_PATH}\" --autopilot-state \"${REPO_ROOT}/.ao-tools/autopilot.state.json\" --watchdog-log \"${REPO_ROOT}/.ao-tools/watchdog.log\""
}

start_autopilot() {
  tmux has-session -t "${AUTOPILOT_SESSION}" 2>/dev/null && tmux kill-session -t "${AUTOPILOT_SESSION}" || true
  tmux new-session -d -s "${AUTOPILOT_SESSION}" "cd \"${REPO_ROOT}\" && ./.ao-tools/run-autopilot.sh --from-existing --all-open --keep-alive"
}

cd "${REPO_ROOT}"
start_core
if ! wait_http "http://localhost:3000" 30; then
  echo "AO core did not become healthy in 30s. Retrying once..."
  start_core
  wait_http "http://localhost:3000" 30 || true
fi

if [[ -x "${REPO_ROOT}/.ao-tools/sync-role-labels.sh" ]]; then
  "${REPO_ROOT}/.ao-tools/sync-role-labels.sh" || true
fi

start_graph
wait_http "http://localhost:${GRAPH_PORT}/health" 20 || true

if [[ "${AUTOPILOT_AUTO_START}" == "1" ]]; then
  start_autopilot
fi

tmux has-session -t "${WATCHDOG_SESSION}" 2>/dev/null && tmux kill-session -t "${WATCHDOG_SESSION}" || true
tmux new-session -d -s "${WATCHDOG_SESSION}" "cd \"${REPO_ROOT}\" && ./.ao-tools/watchdog.sh"

echo "AO Core:  http://localhost:3000"
echo "AO Graph: http://localhost:${GRAPH_PORT}"
echo "Core tmux: ${CORE_SESSION}"
echo "Graph tmux: ${GRAPH_SESSION}"
if [[ "${AUTOPILOT_AUTO_START}" == "1" ]]; then
  echo "Autopilot tmux: ${AUTOPILOT_SESSION}"
else
  echo "Autopilot tmux: disabled (set AO_AUTOPILOT_AUTO_START=1 to enable)"
fi
echo "Watchdog tmux: ${WATCHDOG_SESSION}"
echo "Role profiles: ${ROLE_PROFILE_PATH}"
