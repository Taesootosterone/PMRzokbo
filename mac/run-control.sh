#!/bin/bash
set -euo pipefail
PMRZ_PROJECT_DIRECTORY="$(cd "$(dirname "$0")/.." && pwd)"
PMRZ_NODE_EXECUTABLE=""
# Finder does not read interactive shell setup. Look for exactly Node 24,
# including nvm installs, without changing the user's default Node version.
for candidate in "$(command -v node || true)" /opt/homebrew/opt/node@24/bin/node /usr/local/opt/node@24/bin/node /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/v24.*/bin/node; do
  if [ -x "$candidate" ] && [ "$("$candidate" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)" = "24" ]; then
    PMRZ_NODE_EXECUTABLE="$candidate"
    break
  fi
done
if [ -z "$PMRZ_NODE_EXECUTABLE" ]; then
  echo 'Node.js 24를 먼저 설치하세요. 이미 nvm을 쓴다면: nvm install 24'
  exit 1
fi
export PATH="$(dirname "$PMRZ_NODE_EXECUTABLE"):/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$PMRZ_PROJECT_DIRECTORY"
exec "$PMRZ_NODE_EXECUTABLE" scripts/mac-apps.mjs setup
