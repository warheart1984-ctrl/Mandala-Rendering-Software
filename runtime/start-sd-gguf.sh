#!/usr/bin/env bash
set -euo pipefail

RUNTIME_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SD_SERVER="${MANDALA_SD_SERVER:-${RUNTIME_DIR}/sdcpp/bin/sd-server}"
SD_MODEL="${MANDALA_SD_MODEL:-${RUNTIME_DIR}/models/image/sd-turbo-q8.gguf}"
SD_HOST="${MANDALA_SD_HOST:-127.0.0.1}"
SD_PORT="${MANDALA_SD_PORT:-13306}"
SD_SEED="${MANDALA_SD_SEED:-1990}"

if [[ ! -x "${SD_SERVER}" ]]; then
    echo "Mandala SD server is not installed or executable: ${SD_SERVER}" >&2
    exit 1
fi

if [[ ! -f "${SD_MODEL}" ]]; then
    echo "Mandala SD model is missing: ${SD_MODEL}" >&2
    exit 1
fi

exec "${SD_SERVER}" \
    --listen-ip "${SD_HOST}" \
    --listen-port "${SD_PORT}" \
    --model "${SD_MODEL}" \
    --vae-tiling \
    --steps 4 \
    --cfg-scale 1.0 \
    --seed "${SD_SEED}" \
    --sampling-method euler
