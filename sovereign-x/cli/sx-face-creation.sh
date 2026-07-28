#!/usr/bin/env bash
# Face Creation Assist (assist-only). Prefer Node sibling on Windows.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$ROOT/sovereign-x/cli/sx-face-creation.mjs" "$@"
