#!/usr/bin/env bash
# Sovereign X — NIM FLUX shell image ingest (assist-only).
# Cross-platform: prefer the Node sibling on Windows.
# Usage: ./sovereign-x/cli/sx-flux-image.sh --image ./still.png --dry-run
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$ROOT/sovereign-x/cli/sx-flux-image.mjs" "$@"
