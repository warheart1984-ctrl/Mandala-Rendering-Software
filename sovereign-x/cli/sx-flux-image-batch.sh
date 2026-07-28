#!/usr/bin/env bash
# Batch NIM FLUX shell image ingest (assist-only).
# Usage: ./sovereign-x/cli/sx-flux-image-batch.sh --dir ./stills --dry-run
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$ROOT/sovereign-x/cli/sx-flux-image-batch.mjs" "$@"
