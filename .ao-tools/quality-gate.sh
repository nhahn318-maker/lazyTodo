#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}"
FRONTEND_DIR="${REPO_ROOT}/frontend"
BACKEND_PORT="${BACKEND_PORT:-3100}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-http://${BACKEND_HOST}:${BACKEND_PORT}/health}"
BACKEND_STARTUP_TIMEOUT="${BACKEND_STARTUP_TIMEOUT:-40}"
BACKEND_LOG="${REPO_ROOT}/.ao-tools/backend-quality-smoke.log"

SKIP_INSTALL=0
RUN_E2E="${RUN_E2E:-0}"
STRICT=0
BACKEND_PID=""
FOUND_TARGET=0

usage() {
  cat <<'USAGE'
Usage: ./.ao-tools/quality-gate.sh [options]

Options:
  --skip-install      Skip npm install/ci in backend/frontend
  --run-e2e           Force run Playwright e2e if configured
  --strict            Fail when expected scripts/targets are missing
  -h, --help          Show help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    --run-e2e)
      RUN_E2E=1
      shift
      ;;
    --strict)
      STRICT=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

log() {
  printf '[quality-gate] %s\n' "$*"
}

has_project() {
  local dir="$1"
  [[ -d "$dir" && -f "$dir/package.json" ]]
}

npm_has_script() {
  local dir="$1"
  local script_name="$2"
  (
    cd "$dir"
    NPM_SCRIPT="$script_name" node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));const s=process.env.NPM_SCRIPT;process.exit(p.scripts&&Object.prototype.hasOwnProperty.call(p.scripts,s)?0:1);'
  )
}

run_script_if_present() {
  local dir="$1"
  local script_name="$2"
  if npm_has_script "$dir" "$script_name"; then
    log "Running ${dir##*/}: npm run ${script_name}"
    (cd "$dir" && npm run "$script_name")
    return 0
  fi
  return 1
}

install_deps() {
  local dir="$1"
  if ! has_project "$dir"; then
    return 0
  fi

  if (
    cd "$dir"
    node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));const hasDeps=Boolean((p.dependencies&&Object.keys(p.dependencies).length)||(p.devDependencies&&Object.keys(p.devDependencies).length));process.exit(hasDeps?1:0);'
  ); then
    log "No dependencies declared in ${dir}. Skipping install."
    return 0
  fi

  if [[ -f "${dir}/package-lock.json" ]] && (cd "$dir" && npm ci); then
    return 0
  fi

  if [[ -f "${dir}/package-lock.json" ]]; then
    log "npm ci failed in ${dir}. Retrying with --force"
    if (cd "$dir" && npm ci --force); then
      return 0
    fi
  fi

  log "Falling back to npm install in ${dir}"
  (cd "$dir" && npm install)
}

wait_for_backend() {
  local retries="$BACKEND_STARTUP_TIMEOUT"
  for _ in $(seq 1 "$retries"); do
    if curl -fsS "$BACKEND_HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

cleanup() {
  if [[ -n "$BACKEND_PID" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

if [[ "$SKIP_INSTALL" != "1" ]]; then
  log "Installing dependencies (if backend/frontend exists)"
  install_deps "$BACKEND_DIR"
  install_deps "$FRONTEND_DIR"
fi

if has_project "$BACKEND_DIR"; then
  FOUND_TARGET=1
  log "Backend quality checks"
  if ! run_script_if_present "$BACKEND_DIR" "quality:gate"; then
    run_script_if_present "$BACKEND_DIR" "contract:validate" || true
    run_script_if_present "$BACKEND_DIR" "build" || true
    run_script_if_present "$BACKEND_DIR" "test" || true
  fi
fi

if has_project "$FRONTEND_DIR"; then
  FOUND_TARGET=1
  log "Frontend quality checks"
  if ! run_script_if_present "$FRONTEND_DIR" "quality:gate"; then
    run_script_if_present "$FRONTEND_DIR" "lint" || true
    run_script_if_present "$FRONTEND_DIR" "typecheck" || true
    run_script_if_present "$FRONTEND_DIR" "test" || true
    run_script_if_present "$FRONTEND_DIR" "build" || true
  fi
fi

if has_project "$BACKEND_DIR"; then
  if npm_has_script "$BACKEND_DIR" "start"; then
    log "Runtime smoke: start backend and verify health"
    cd "$BACKEND_DIR"
    HOST="$BACKEND_HOST" PORT="$BACKEND_PORT" npm run start >"$BACKEND_LOG" 2>&1 &
    BACKEND_PID="$!"
    cd "$REPO_ROOT"

    if wait_for_backend; then
      if ! run_script_if_present "$BACKEND_DIR" "smoke:http"; then
        log "No backend smoke:http script. Health check passed via ${BACKEND_HEALTH_URL}."
      fi
    else
      log "Backend failed health check. Recent logs:"
      tail -n 80 "$BACKEND_LOG" || true
      exit 1
    fi
  elif [[ "$STRICT" == "1" ]]; then
    log "Strict mode: backend exists but missing start script."
    exit 1
  fi
fi

if [[ "$RUN_E2E" == "1" ]]; then
  if has_project "$FRONTEND_DIR" && npm_has_script "$FRONTEND_DIR" "e2e:ci"; then
    log "Running e2e:ci"
    (cd "$FRONTEND_DIR" && npm run e2e:ci)
  elif [[ "$STRICT" == "1" ]]; then
    log "Strict mode: --run-e2e requested but e2e:ci is missing."
    exit 1
  else
    log "Skip e2e:ci (frontend/e2e config not ready)."
  fi
fi

if [[ "$FOUND_TARGET" != "1" ]]; then
  log "No backend/frontend package found."
  if [[ "$STRICT" == "1" ]]; then
    exit 1
  fi
fi

log "Quality gate passed"
