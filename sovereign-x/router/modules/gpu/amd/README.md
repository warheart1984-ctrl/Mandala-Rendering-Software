# AMD GPU module slot



Capabilities:



| ID | Status | Notes |

|----|--------|-------|

| `gpu.inference.amd.rocm` | **declared** | skills at `~/.agents/skills/amd-gpu-assist/` / rocm-setup |

| `gpu.compute.amd.hip` | **declared** / SDK **partial** when installed | `hipSdkProbe.js`; re-run `sx-hip-sdk-probe.mjs` |

| `gpu.compute.amd.legacy_efficient` | **partial** | 3-Layer Path + Lemonade adapter + OpenCL still |



## Legacy efficient path (R9 380 / GCN)



- **Invoke:** `node sovereign-x/cli/sx-legacy-efficient.mjs --intent <id>`

- **Still:** `--still --provider auto` (Lemonade SD then OpenCL Tonga)

- **Lemonade SD probe:** `--probe-lemonade`

- **Lemonade SDK chat:** `--provider lemonade-sdk --chat "…"` / `--probe-lemonade-sdk` (OpenAI `:8000` then `:13305`); see `docs/4d-engine/LEMONADE_SDK_CHAT.md`

- **Router:** `route("gpu.compute.amd.legacy_efficient", { intentId, requestStill, beautyProvider })`

- **Adapters:** `lemonadeSdAdapter.js` (images/SD); `lemonadeSdkChatAdapter.js` (LLM/chat; façade `lemonadeSdkAdapter.js`)

- **OpenCL stand-in:** `scripts/legacy-efficient/opencl_tonga_still.py`

- **Honesty:** Lemonade SD often **blocked** on FX-8350 (AVX2) + Tonga (no ROCm); SDK chat **partial** with Vulkan GGUF (`Llama-3.2-1B-Instruct-GGUF`); OpenCL still is **partial** GPU proof. Never print SoT.

- **HIP/ROCm:** toolchain **absent** on this Windows discrete GCN card; `vendor/HIP` headers pinned — see CECP trail notes 08–09.

