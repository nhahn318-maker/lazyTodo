#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
REPO_SLUG="${1:-}"
ROLE_PROFILE_PATH="${2:-${REPO_ROOT}/.ao-tools/role-profiles.json}"

if [[ -z "${REPO_SLUG}" ]]; then
  ORIGIN_URL="$(git -C "${REPO_ROOT}" remote get-url origin 2>/dev/null || true)"
  if [[ "${ORIGIN_URL}" =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    REPO_SLUG="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
  fi
fi

if [[ -z "${REPO_SLUG}" ]]; then
  echo "Cannot detect repo slug. Skip label sync."
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh not found. Skip label sync."
  exit 0
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh not authenticated. Skip label sync."
  exit 0
fi

if [[ ! -f "${ROLE_PROFILE_PATH}" ]]; then
  echo "Role profile file not found: ${ROLE_PROFILE_PATH}"
  exit 0
fi

node - "${ROLE_PROFILE_PATH}" "${REPO_SLUG}" <<'NODE'
const fs = require('fs');
const { spawnSync } = require('child_process');
const [profilePath, repoSlug] = process.argv.slice(2);

const data = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
const roles = Array.isArray(data.roles) ? data.roles : [];
const set = new Set(['role:unknown']);

for (const role of roles) {
  const id = String(role.id || '').trim();
  if (id.startsWith('role:')) set.add(id);
  for (const alias of Array.isArray(role.aliases) ? role.aliases : []) {
    const v = String(alias || '').trim();
    if (v.startsWith('role:')) set.add(v);
  }
}

for (const label of [...set]) {
  const create = spawnSync('gh', ['label', 'create', label, '--repo', repoSlug, '--color', '1f6feb', '--description', 'AO role label'], { stdio: 'pipe', encoding: 'utf8' });
  if (create.status === 0) {
    process.stdout.write(`created label ${label}\n`);
    continue;
  }
  const edit = spawnSync('gh', ['label', 'edit', label, '--repo', repoSlug, '--color', '1f6feb', '--description', 'AO role label'], { stdio: 'pipe', encoding: 'utf8' });
  if (edit.status === 0) process.stdout.write(`updated label ${label}\n`);
}
NODE
