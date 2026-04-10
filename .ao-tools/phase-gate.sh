#!/usr/bin/env bash
set -euo pipefail

PHASE=""
ISSUE_NUMBER=""
STRICT="${AO_PHASE_GATE_STRICT:-1}"

usage() {
  cat <<'USAGE'
Usage: ./.ao-tools/phase-gate.sh --phase <label> [--issue <n>]

Examples:
  ./.ao-tools/phase-gate.sh --phase phase:design --issue 7
  ./.ao-tools/phase-gate.sh --phase phase:test --issue 11
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
      echo "[phase-gate] Unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
done

[[ -n "$PHASE" ]] || {
  echo "[phase-gate] --phase is required" >&2
  exit 1
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

log() {
  printf '[phase-gate] %s\n' "$*"
}

fail() {
  printf '[phase-gate] FAIL: %s\n' "$*" >&2
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

ensure_file() {
  local file="$1"
  [[ -f "$file" ]] || fail "Required file missing: ${file}"
}

stage="$(to_stage "$PHASE")"
qgate="./.ao-tools/quality-gate.sh"

case "$stage" in
  design)
    log "PASS issue=${ISSUE_NUMBER:-n/a} phase=${PHASE} (design has no hard gate)."
    ;;
  build)
    ensure_file "$qgate"
    [[ -x "$qgate" ]] || chmod +x "$qgate"
    log "PASS issue=${ISSUE_NUMBER:-n/a} phase=${PHASE} (build baseline gate ready)."
    ;;
  test)
    ensure_file "$qgate"
    [[ -x "$qgate" ]] || chmod +x "$qgate"
    "$qgate" --skip-install --strict || fail "quality-gate failed before test phase."
    log "PASS issue=${ISSUE_NUMBER:-n/a} phase=${PHASE} (test gate passed)."
    ;;
  release)
    ensure_file "$qgate"
    [[ -x "$qgate" ]] || chmod +x "$qgate"
    "$qgate" --skip-install --run-e2e --strict || fail "quality-gate failed before release phase."
    ensure_file "docs/DEFINITION_OF_DONE.md"
    ensure_file "docs/PRODUCT_METRICS.md"
    log "PASS issue=${ISSUE_NUMBER:-n/a} phase=${PHASE} (release gate passed)."
    ;;
  *)
    if [[ "$STRICT" == "1" ]]; then
      fail "Unknown phase '${PHASE}'. Add phase mapping before spawn."
    fi
    log "PASS issue=${ISSUE_NUMBER:-n/a} phase=${PHASE} (unknown phase allowed because strict=0)."
    ;;
esac
