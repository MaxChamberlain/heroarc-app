#!/usr/bin/env bash
# Render build entry point: scripts/render-build.sh <turbo filter>
#   e.g. scripts/render-build.sh '@heroarc/web...'
# Makes sure the pnpm version pinned in package.json#packageManager is on PATH,
# installs all dependencies (dev ones are needed to build), then builds the target
# package and everything it depends on.
set -euo pipefail

FILTER="${1:?usage: scripts/render-build.sh <turbo filter>}"
PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@')[1]")"

if ! command -v pnpm >/dev/null 2>&1 || [ "$(pnpm -v)" != "$PNPM_VERSION" ]; then
  mkdir -p "$HOME/.local/bin"
  export PATH="$HOME/.local/bin:$PATH"
  if ! corepack enable --install-directory "$HOME/.local/bin" pnpm 2>/dev/null; then
    npm install --global --prefix "$HOME/.local" "pnpm@$PNPM_VERSION"
  fi
fi

echo "node $(node -v), pnpm $(pnpm -v)"
pnpm install --frozen-lockfile --prod=false
pnpm turbo run build --filter="$FILTER"
