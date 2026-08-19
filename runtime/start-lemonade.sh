#!/usr/bin/env bash
# Mandala Lemonade (chat/TTS) — Linux. Public images stay on the :13305 bridge.
# Port SoT: LEMONADE_PORT default 13307 (vendor resources/defaults.json may still say 13305).
set -euo pipefail

RUNTIME_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LEMONADE_ROOT="${MANDALA_LEMONADE_ROOT:-${RUNTIME_DIR}/lemonade/lemonade-embeddable-11.6.0-ubuntu-x64}"
LEMOND="${LEMONADE_ROOT}/lemond"
MODELS_DIR="${MANDALA_LEMONADE_MODELS:-${RUNTIME_DIR}/models/lemonade}"
HOST="${LEMONADE_HOST:-127.0.0.1}"
PORT="${LEMONADE_PORT:-13307}"

if [[ ! -x "${LEMOND}" ]]; then
  echo "lemond missing or not executable: ${LEMOND}" >&2
  exit 1
fi

if [[ ! -d "${MODELS_DIR}" ]]; then
  echo "Lemonade models dir missing: ${MODELS_DIR}" >&2
  exit 1
fi

exec "${LEMOND}" "${MODELS_DIR}" --host "${HOST}" --port "${PORT}"
