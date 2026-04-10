#!/usr/bin/env bash
set -euo pipefail

PHASE=""
ISSUE_NUMBER=""
APPROVALS_FILE="${AO_APPROVALS_FILE:-docs/APPROVALS.md}"
STRICT="${AO_APPROVAL_GATE_STRICT:-1}"

usage() {
  cat <<'USAGE'
Usage: ./.ao-tools/approval-gate.sh --phase <label> [--issue <n>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase)
      PHASE="${2:-}"
      shift 2
      ;;
    --issue)
      ISSUE_NUMBER="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[approval-gate] Unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
done

[[ -n "$PHASE" ]] || {
  echo "[approval-gate] --phase is required" >&2
  exit 1
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

log() {
  printf '[approval-gate] %s\n' "$*"
}

fail() {
  printf '[approval-gate] FAIL: %s\n' "$*" >&2
  exit 1
}

to_stage() {
  local input
  input="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  if [[ "$input" =~ design|phase:1 ]]; then
    printf 'design'
  elif [[ "$input" =~ build|phase:2 ]]; then
    printf 'build'
  elif [[ "$input" =~ test|phase:3 ]]; then
    printf 'test'
  elif [[ "$input" =~ release|phase:4 ]]; then
    printf 'release'
  else
    printf 'unknown'
  fi
}

is_approved() {
  local token="$1"
  grep -Eiq "^\s*-\s*\[x\]\s+${token}\s+approved" "$APPROVALS_FILE"
}

require_approval() {
  local token="$1"
  if ! is_approved "$token"; then
    fail "Missing approval: ${token} (update ${APPROVALS_FILE})"
  fi
}

stage="$(to_stage "$PHASE")"

if [[ ! -f "$APPROVALS_FILE" ]]; then
  if [[ "$STRICT" == "1" ]]; then
    fail "Approvals file not found: ${APPROVALS_FILE}"
  fi
  log "Approvals file missing but strict=0. PASS."
  exit 0
fi

case "$stage" in
  design)
    log "PASS issue=${ISSUE_NUMBER:-n/a} phase=${PHASE} (design phase does not require prior approval gate)."
    ;;
  build)
    require_approval "PRD"
    require_approval "HLD"
    log "PASS issue=${ISSUE_NUMBER:-n/a} phase=${PHASE} (PRD+HLD approved)."
    ;;
  test)
    require_approval "PRD"
    require_approval "HLD"
    require_approval "TEST_PLAN"
    log "PASS issue=${ISSUE_NUMBER:-n/a} phase=${PHASE} (PRD+HLD+TEST_PLAN approved)."
    ;;
  release)
    require_approval "PRD"
    require_approval "HLD"
    require_approval "TEST_PLAN"
    log "PASS issue=${ISSUE_NUMBER:-n/a} phase=${PHASE} (all checkpoints approved)."
    ;;
  *)
    if [[ "$STRICT" == "1" ]]; then
      fail "Unknown phase '${PHASE}'. Add phase mapping before spawn."
    fi
    log "Unknown phase with strict=0. PASS."
    ;;
esac
