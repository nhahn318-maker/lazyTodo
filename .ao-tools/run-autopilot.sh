#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/mnt/d/VibeCoding/lazyTodo"
PROJECT_ID="lazytodo"
REPO_SLUG="nhahn318-maker/lazyTodo"
ROLE_PROFILE_PATH="${REPO_ROOT}/.ao-tools/role-profiles.json"

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

EXTRA_ARGS=()
if [[ "${AO_AUTOPILOT_NO_PREFLIGHT:-0}" == "1" ]]; then
  EXTRA_ARGS+=(--no-preflight)
fi
if [[ "${AO_AUTOPILOT_NO_APPROVAL_GATE:-0}" == "1" ]]; then
  EXTRA_ARGS+=(--no-approval-gate)
fi
if [[ "${AO_AUTOPILOT_NO_PHASE_GATE:-0}" == "1" ]]; then
  EXTRA_ARGS+=(--no-phase-gate)
fi
if [[ "${AO_AUTOPILOT_NO_STARTER:-0}" == "1" ]]; then
  EXTRA_ARGS+=(--no-starter)
fi
if [[ -n "${AO_AUTOPILOT_STARTER_SCRIPT:-}" ]]; then
  EXTRA_ARGS+=(--starter-script "${AO_AUTOPILOT_STARTER_SCRIPT}")
fi
if [[ -n "${AO_AUTOPILOT_STUCK_MINUTES:-}" ]]; then
  EXTRA_ARGS+=(--stuck-minutes "${AO_AUTOPILOT_STUCK_MINUTES}")
fi
if [[ -n "${AO_AUTOPILOT_STALE_WORKING_MINUTES:-}" ]]; then
  EXTRA_ARGS+=(--stale-working-minutes "${AO_AUTOPILOT_STALE_WORKING_MINUTES}")
fi
if [[ -n "${AO_AUTOPILOT_STUCK_RESTARTS:-}" ]]; then
  EXTRA_ARGS+=(--stuck-restarts "${AO_AUTOPILOT_STUCK_RESTARTS}")
fi
if [[ -n "${AO_AUTOPILOT_STUCK_COOLDOWN_SEC:-}" ]]; then
  EXTRA_ARGS+=(--stuck-cooldown-sec "${AO_AUTOPILOT_STUCK_COOLDOWN_SEC}")
fi
if [[ -n "${AO_AUTOPILOT_PREFLIGHT_CACHE_SEC:-}" ]]; then
  EXTRA_ARGS+=(--preflight-cache-sec "${AO_AUTOPILOT_PREFLIGHT_CACHE_SEC}")
fi
if [[ -n "${AO_AUTOPILOT_APPROVAL_GATE_CACHE_SEC:-}" ]]; then
  EXTRA_ARGS+=(--approval-gate-cache-sec "${AO_AUTOPILOT_APPROVAL_GATE_CACHE_SEC}")
fi
if [[ -n "${AO_AUTOPILOT_PHASE_GATE_CACHE_SEC:-}" ]]; then
  EXTRA_ARGS+=(--phase-gate-cache-sec "${AO_AUTOPILOT_PHASE_GATE_CACHE_SEC}")
fi
if [[ -n "${AO_AUTOPILOT_STATE_FILE:-}" ]]; then
  EXTRA_ARGS+=(--state-file "${AO_AUTOPILOT_STATE_FILE}")
fi
if [[ -n "${AO_AUTOPILOT_TELEMETRY_EVENTS:-}" ]]; then
  EXTRA_ARGS+=(--telemetry-events "${AO_AUTOPILOT_TELEMETRY_EVENTS}")
fi

cd "${REPO_ROOT}"
ao-autopilot --path "${REPO_ROOT}" --project-id "${PROJECT_ID}" --repo "${REPO_SLUG}" --role-profiles "${ROLE_PROFILE_PATH}" "${EXTRA_ARGS[@]}" "$@"
