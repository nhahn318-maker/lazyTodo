#!/usr/bin/env bash
set -euo pipefail

MODE="autopilot"
PROJECT_ID="${AO_PROJECT_ID:-}"
REPO_SLUG="${AO_REPO_SLUG:-}"
REQUIRE_CORE="${AO_PREFLIGHT_REQUIRE_CORE:-1}"
REQUIRED_ENV_FILE=".ao-tools/preflight.required-env"
HOOKS_DIR=".ao-tools/preflight.d"

usage() {
  cat <<'USAGE'
Usage: ./.ao-tools/preflight.sh [options]

Options:
  --mode <autopilot|manual>   Context mode (default: autopilot)
  --project <id>              AO project id
  --repo <owner/repo>         GitHub repo slug
  --no-core-check             Skip localhost:3000 health check
  -h, --help                  Show help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-autopilot}"
      shift 2
      ;;
    --project)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    --repo)
      REPO_SLUG="${2:-}"
      shift 2
      ;;
    --no-core-check)
      REQUIRE_CORE="0"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[preflight] Unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
done

fail() {
  printf '[preflight] FAIL: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '[preflight] %s\n' "$*"
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "Missing command: ${cmd}"
}

require_cmd git
require_cmd gh
require_cmd ao
require_cmd tmux
require_cmd node
require_cmd npm
require_cmd curl

if ! gh auth status >/dev/null 2>&1; then
  fail "GitHub CLI is not authenticated. Run: gh auth login"
fi

if [[ -z "$PROJECT_ID" ]]; then
  PROJECT_ID="$(basename "$repo_root" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g')"
fi

if [[ -z "$REPO_SLUG" ]]; then
  origin_url="$(git remote get-url origin 2>/dev/null || true)"
  if [[ "$origin_url" =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    REPO_SLUG="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
  fi
fi

if [[ "$MODE" == "autopilot" ]]; then
  [[ -n "$REPO_SLUG" ]] || fail "Cannot detect GitHub repo slug. Re-run bootstrap with --repo."
fi

if [[ "$REQUIRE_CORE" == "1" ]]; then
  if ! curl -fsS "http://localhost:3000" >/dev/null 2>&1; then
    fail "AO core is not healthy on http://localhost:3000"
  fi
fi

if [[ "$MODE" == "autopilot" ]]; then
  if ! ao session ls --project "$PROJECT_ID" >/dev/null 2>&1; then
    fail "AO project '${PROJECT_ID}' is not ready. Run ./.ao-tools/start-all.sh first."
  fi
fi

if [[ -f "$REQUIRED_ENV_FILE" ]]; then
  missing_env=()
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    name="$(printf '%s' "$raw" | sed -E 's/#.*$//; s/^[[:space:]]+//; s/[[:space:]]+$//')"
    [[ -z "$name" ]] && continue

    value="${!name:-}"
    if [[ -n "$value" ]]; then
      continue
    fi

    found_in_file=0
    for env_file in ".env" "backend/.env" "frontend/.env"; do
      if [[ -f "$env_file" ]] && grep -Eq "^[[:space:]]*${name}=" "$env_file"; then
        found_in_file=1
        break
      fi
    done
    [[ "$found_in_file" == "1" ]] || missing_env+=("$name")
  done < "$REQUIRED_ENV_FILE"

  if [[ "${#missing_env[@]}" -gt 0 ]]; then
    fail "Missing required env keys: ${missing_env[*]} (set env vars or define in .env/backend/.env/frontend/.env)"
  fi
fi

if [[ -d "$HOOKS_DIR" ]]; then
  while IFS= read -r -d '' hook; do
    if [[ ! -x "$hook" ]]; then
      fail "Preflight hook not executable: ${hook}"
    fi
    "$hook"
  done < <(find "$HOOKS_DIR" -maxdepth 1 -type f -name '*.sh' -print0 | sort -z)
fi

log "OK mode=${MODE} project=${PROJECT_ID} repo=${REPO_SLUG}"
