#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/mnt/d/VibeCoding/lazyTodo"
PROJECT_ID="lazytodo"
REPO_SLUG="nhahn318-maker/lazyTodo"
GRAPH_PORT="3310"
CORE_SESSION="ao-core-${PROJECT_ID}"
GRAPH_SESSION="ao-graph-${PROJECT_ID}"
LEGACY_GRAPH_SESSION="ao-graph"
AUTOPILOT_SESSION="ao-autopilot-${PROJECT_ID}"
ROLE_PROFILE_PATH="${REPO_ROOT}/.ao-tools/role-profiles.json"

INTERVAL_SEC="${AO_WATCHDOG_INTERVAL_SEC:-15}"
FAIL_THRESHOLD="${AO_WATCHDOG_FAIL_THRESHOLD:-2}"
RESTART_COOLDOWN_SEC="${AO_WATCHDOG_RESTART_COOLDOWN_SEC:-20}"
AUTOPILOT_ENABLE="${AO_WATCHDOG_AUTOPILOT_ENABLE:-1}"
LOG_FILE="${REPO_ROOT}/.ao-tools/watchdog.log"

mkdir -p "${REPO_ROOT}/.ao-tools"

log() {
  printf '[%s] %s\n' "$(date -Iseconds)" "$*" | tee -a "${LOG_FILE}" >/dev/null
}

ensure_repo_slug() {
  if [[ -n "${REPO_SLUG}" ]]; then
    return
  fi
  local origin_url
  origin_url="$(git -C "${REPO_ROOT}" remote get-url origin 2>/dev/null || true)"
  if [[ "${origin_url}" =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    REPO_SLUG="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
  fi
}

start_core() {
  tmux has-session -t "${CORE_SESSION}" 2>/dev/null && tmux kill-session -t "${CORE_SESSION}" || true
  tmux new-session -d -s "${CORE_SESSION}" "cd \"${REPO_ROOT}\" && ao stop >/dev/null 2>&1 || true; ao start \"${PROJECT_ID}\""
  log "restarted core session ${CORE_SESSION}"
}

start_graph() {
  ensure_repo_slug
  if [[ -z "${REPO_SLUG}" ]]; then
    log "skip graph restart: repo slug not found"
    return
  fi

  tmux has-session -t "${GRAPH_SESSION}" 2>/dev/null && tmux kill-session -t "${GRAPH_SESSION}" || true
  tmux has-session -t "${LEGACY_GRAPH_SESSION}" 2>/dev/null && tmux kill-session -t "${LEGACY_GRAPH_SESSION}" || true
  tmux new-session -d -s "${GRAPH_SESSION}" "cd \"${REPO_ROOT}\" && node graph-dashboard/server.js --port \"${GRAPH_PORT}\" --project \"${PROJECT_ID}\" --repo \"${REPO_SLUG}\" --cwd \"${REPO_ROOT}\" --role-profiles \"${ROLE_PROFILE_PATH}\" --autopilot-state \"${REPO_ROOT}/.ao-tools/autopilot.state.json\" --watchdog-log \"${REPO_ROOT}/.ao-tools/watchdog.log\""
  log "restarted graph session ${GRAPH_SESSION}"
}

start_autopilot() {
  tmux has-session -t "${AUTOPILOT_SESSION}" 2>/dev/null && tmux kill-session -t "${AUTOPILOT_SESSION}" || true
  tmux new-session -d -s "${AUTOPILOT_SESSION}" "cd \"${REPO_ROOT}\" && ./.ao-tools/run-autopilot.sh --from-existing --all-open --keep-alive"
  log "restarted autopilot session ${AUTOPILOT_SESSION}"
}

core_fail=0
graph_fail=0
autopilot_fail=0
last_core_restart=0
last_graph_restart=0
last_autopilot_restart=0

log "watchdog started: project=${PROJECT_ID} interval=${INTERVAL_SEC}s threshold=${FAIL_THRESHOLD} autopilot=${AUTOPILOT_ENABLE}"

while true; do
  now="$(date +%s)"

  if curl -fsS "http://localhost:3000" >/dev/null 2>&1 && ao session ls --project "${PROJECT_ID}" >/dev/null 2>&1; then
    core_fail=0
  else
    core_fail=$((core_fail + 1))
    log "core health check failed (${core_fail}/${FAIL_THRESHOLD})"
  fi

  if curl -fsS "http://localhost:${GRAPH_PORT}/health" >/dev/null 2>&1; then
    graph_fail=0
  else
    graph_fail=$((graph_fail + 1))
    log "graph health check failed (${graph_fail}/${FAIL_THRESHOLD})"
  fi

  if [[ "${AUTOPILOT_ENABLE}" == "1" ]]; then
    if tmux has-session -t "${AUTOPILOT_SESSION}" 2>/dev/null; then
      autopilot_fail=0
    else
      autopilot_fail=$((autopilot_fail + 1))
      log "autopilot health check failed (${autopilot_fail}/${FAIL_THRESHOLD})"
    fi
  fi

  if (( core_fail >= FAIL_THRESHOLD )) && (( now - last_core_restart >= RESTART_COOLDOWN_SEC )); then
    start_core
    core_fail=0
    last_core_restart="$(date +%s)"
  fi

  if (( graph_fail >= FAIL_THRESHOLD )) && (( now - last_graph_restart >= RESTART_COOLDOWN_SEC )); then
    start_graph
    graph_fail=0
    last_graph_restart="$(date +%s)"
  fi

  if [[ "${AUTOPILOT_ENABLE}" == "1" ]] && (( autopilot_fail >= FAIL_THRESHOLD )) && (( now - last_autopilot_restart >= RESTART_COOLDOWN_SEC )); then
    start_autopilot
    autopilot_fail=0
    last_autopilot_restart="$(date +%s)"
  fi

  sleep "${INTERVAL_SEC}"
done
