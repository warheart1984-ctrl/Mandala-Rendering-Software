#!/usr/bin/env bash
set -euo pipefail

RUNTIME_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
failed=0

check_model() {
    local label="$1"
    local relative_path="$2"
    local requirement="${3:-required}"
    local path="${RUNTIME_DIR}/${relative_path}"

    if [[ -f "${path}" ]]; then
        printf 'OK      %-18s %s bytes  %s\n' "${label}" "$(stat -Lc '%s' "${path}")" "${path}"
    elif [[ "${requirement}" == "candidate" ]]; then
        printf 'PENDING %-18s optional candidate  %s\n' "${label}" "${path}"
    else
        printf 'MISSING %-18s %s\n' "${label}" "${path}" >&2
        failed=1
    fi
}

check_model "SD-Turbo GGUF" "models/image/sd-turbo-q8.gguf"
check_model "Anything V5 src" "models/image/anything-v5.safetensors"
check_model "Anything V5 Q4" "models/image/anything-v5-q4_0.gguf"
check_model "DreamShaper 8 src" "models/image/dreamshaper-8-source/DreamShaper_8_pruned.safetensors" candidate
check_model "DreamShaper 8 Q4" "models/image/dreamshaper-8-q4_0.gguf" candidate
check_model "Llama 3.2 1B" "models/llm/llama-3.2-1b-q4.gguf"
check_model "Kokoro" "models/tts/kokoro-v1.onnx"
check_model "Kokoro voices" "models/tts/kokoro-voices.bin"
check_model "Whisper Tiny src" "models/stt/ggml-tiny.bin" candidate
check_model "Whisper Tiny Q8" "models/stt/ggml-tiny-q8_0.bin"

exit "${failed}"
