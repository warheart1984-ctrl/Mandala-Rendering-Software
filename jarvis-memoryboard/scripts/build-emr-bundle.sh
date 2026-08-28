#!/usr/bin/env bash
# Assemble EMR release bundle: tests, eval, MANIFEST.json, zip + SHA-256.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi
exec python "$ROOT/scripts/build-emr-bundle.py" "$@"
