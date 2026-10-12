#!/bin/bash
# SessionStart hook: in Claude Code cloud sessions, install the npm packages (jsdom for `npm run smoke`, the Capacitor
# CLI for `npm run cap:sync`). Skipped locally, and skipped when node_modules is already newer than package-lock.json.
# `npm ci` never rewrites the lockfile, so the working tree stays clean.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

if [ -f node_modules/.package-lock.json ] && [ node_modules/.package-lock.json -nt package-lock.json ]; then
  echo "npm packages are up to date"
  exit 0
fi

npm ci --no-audit --no-fund
