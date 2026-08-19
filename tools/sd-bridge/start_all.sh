#!/usr/bin/env bash
# Linux replacement for tools/sd-bridge/start_all.bat
#
#   :13305  bridge (public OpenAI schema — AGENTS.md / ChatGPT plugin)
#   :13306  sd-server (Vulkan SD-Turbo on RX 580)
#   :13307  lemond (chat / TTS; not the image worker)
#   :13312  whisper-server (optional STT; CPU build, AVX2 off for FX-8350)
#
# Whisper starts when whisper-server + ggml-tiny-q8_0.bin exist (override with
# MANDALA_WHISPER_EXE / MANDALA_WHISPER_MODEL). Missing STT does not fail the stack.
set -euo pipefail

BRIDGE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${BRIDGE_DIR}/../.." && pwd)"
RUNTIME="${ROOT}/runtime"
LOGS="${RUNTIME}/logs"
mkdir -p "${LOGS}" "${BRIDGE_DIR}/outputs"

export SD_EXE="${SD_EXE:-${RUNTIME}/sdcpp/bin/sd-server}"
export SD_MODEL="${SD_MODEL:-${RUNTIME}/models/image/sd-turbo-q8.gguf}"
export SD_LOGS="${SD_LOGS:-${LOGS}}"
export SD_PORT="${SD_PORT:-13306}"
export LEMONADE_PORT="${LEMONADE_PORT:-13307}"
export BRIDGE_HOST="${BRIDGE_HOST:-127.0.0.1}"
export BRIDGE_PORT="${BRIDGE_PORT:-13305}"
export WHISPER_PORT="${WHISPER_PORT:-13312}"
export MANDALA_WHISPER_EXE="${MANDALA_WHISPER_EXE:-${RUNTIME}/whispercpp/bin/whisper-server}"
export MANDALA_WHISPER_MODEL="${MANDALA_WHISPER_MODEL:-${RUNTIME}/models/stt/ggml-tiny-q8_0.bin}"

port_in_use() {
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${1}$"
}

stop_lemond_on_port() {
  local port="$1"
  local pids
  pids="$(pgrep -f "lemond .*--port ${port}" || true)"
  if [[ -n "${pids}" ]]; then
    echo "Stopping lemond on :${port} (pids ${pids})"
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
    sleep 1
  fi
}

if [[ ! -x "${SD_EXE}" ]]; then
  echo "sd-server missing: ${SD_EXE}" >&2
  exit 1
fi
if [[ ! -e "${SD_MODEL}" ]]; then
  echo "SD model missing: ${SD_MODEL}" >&2
  exit 1
fi

# Lemonade must not occupy the public bridge port (Windows leftover layout).
stop_lemond_on_port 13305

if ! port_in_use "${LEMONADE_PORT}"; then
  echo "[1/4] Starting lemond on :${LEMONADE_PORT}"
  nohup "${RUNTIME}/start-lemonade.sh" >"${LOGS}/lemonade-13307.log" 2>&1 &
  echo $! >"${LOGS}/lemonade.pid"
else
  echo "[1/4] lemond already on :${LEMONADE_PORT}"
fi

if ! port_in_use "${SD_PORT}"; then
  echo "[2/4] Starting sd-server on :${SD_PORT}"
  nohup "${RUNTIME}/start-sd-gguf.sh" >"${LOGS}/sd-13306.log" 2>&1 &
  echo $! >"${LOGS}/sd-server.pid"
else
  echo "[2/4] sd-server already on :${SD_PORT}"
fi

echo "Waiting for backends..."
for i in $(seq 1 30); do
  if port_in_use "${LEMONADE_PORT}" && port_in_use "${SD_PORT}"; then
    break
  fi
  sleep 0.4
done

if ! port_in_use "${LEMONADE_PORT}"; then
  echo "lemond did not bind :${LEMONADE_PORT}. See ${LOGS}/lemonade-13307.log" >&2
  exit 1
fi
if ! port_in_use "${SD_PORT}"; then
  echo "sd-server did not bind :${SD_PORT}. See ${LOGS}/sd-13306.log" >&2
  exit 1
fi

if port_in_use "${WHISPER_PORT}"; then
  echo "[3/4] whisper-server already on :${WHISPER_PORT}"
elif [[ -x "${MANDALA_WHISPER_EXE}" && -e "${MANDALA_WHISPER_MODEL}" ]]; then
  echo "[3/4] Starting whisper-server on :${WHISPER_PORT} (Whisper-Tiny Q8_0, CPU)"
  nohup "${MANDALA_WHISPER_EXE}" -m "${MANDALA_WHISPER_MODEL}" --host 127.0.0.1 --port "${WHISPER_PORT}" -ng \
    >"${LOGS}/whisper-13312.log" 2>&1 &
  echo $! >"${LOGS}/whisper.pid"
else
  echo "[3/4] Skipping whisper-server (set MANDALA_WHISPER_EXE / need ${RUNTIME}/models/stt/ggml-tiny-q8_0.bin)"
fi

if port_in_use "${BRIDGE_PORT}"; then
  echo "Port ${BRIDGE_PORT} still in use; not starting a second bridge." >&2
  ss -ltnp | grep -E "[:.]${BRIDGE_PORT}\\b" || true
  exit 1
fi

echo "[4/4] Starting bridge on :${BRIDGE_PORT} (images -> :${SD_PORT}, chat -> :${LEMONADE_PORT}, stt -> :${WHISPER_PORT})"
cd "${BRIDGE_DIR}"
exec python3 "${BRIDGE_DIR}/bridge.py"
