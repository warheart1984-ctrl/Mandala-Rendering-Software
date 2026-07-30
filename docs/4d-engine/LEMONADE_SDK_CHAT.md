# Lemonade SDK Live Chat (Sovereign-X / MRS)

> **Status:** chat path **partial** (live round-trip proven on this host)  
> **Vendor pin:** `vendor/lemonade` @ SHA in `docs/4d-engine/proofs/legacy-efficient/upstream-vendor-pins.json`  
> **Adapter:** `sovereign-x/router/modules/gpu/amd/lemonadeSdkChatAdapter.js`  
> **Façade:** `lemonadeSdkAdapter.js` (stable SX import path)

## What this is

Our **Live SDK chat adapter** wrapping Lemonade Server’s OpenAI-compatible API (`/api/v1` or `/v1`). Distinct from `lemonadeSdAdapter.js` (images / SD / multimodal).

| Method | Purpose |
|--------|---------|
| `connect()` | Probe bases; pick first healthy OpenAI surface |
| `listModels({ showAll })` | `GET /models` (+ optional `?show_all=true`) |
| `ensureModel(name)` | `POST /pull` when not downloaded |
| `chatCompletions()` | `POST /chat/completions` (non-stream) |
| `chatCompletionsStream()` | SSE stream aggregation |
| `capabilityProbe()` | Health + models + optional ensure/chat |

## Default bases

When env is unset (probe order):

1. `http://localhost:8000/api/v1` — older docs / pastes  
2. `http://localhost:13305/api/v1` — official Lemonade Server (this host)

Override:

- `LEMONADE_SDK_BASE_URL` / `LEMONADE_LLM_BASE_URL`
- `LEMONADE_SDK_HOST` + `LEMONADE_SDK_PORT`
- Optional `LEMONADE_API_KEY` / `LEMONADE_SDK_API_KEY`

## Host setup (FX-8350 / R9 380) — Vulkan path

Prefer **Vulkan** llama.cpp (avoid AVX2-only CPU binaries that `ILLEGAL_INSTRUCTION` on pre-Haswell CPUs). This is the proven chat path on R9 380 / Tonga:

```bash
# one-time backend
lemonade backends install llamacpp:vulkan

# pull + load (recipe must be Vulkan, not CPU)
lemonade pull Llama-3.2-1B-Instruct-GGUF
lemonade load Llama-3.2-1B-Instruct-GGUF --llamacpp vulkan

# verify
lemonade status
# expect: Device=gpu, Recipe=llamacpp, model ready on :13305
```

| Step | Why |
|------|-----|
| `llamacpp:vulkan` | Uses host Vulkan 1.2 on Tonga; bypasses AVX2 CPU llama |
| Official API | `http://localhost:13305/api/v1` (OpenAI-compatible) |
| `:8000` | Older paste default — often down here; probe still tries it first |
| Model | **`Llama-3.2-1B-Instruct-GGUF`** is the proven live `"OK"` model |

Also pulled on this host for experiments: `Qwen3-0.6B-GGUF`, `Bonsai-1.7B-gguf` (Qwen3 may emit empty/garbled text here; Bonsai may be loaded in `lemonade status` while SX live proof still targets Llama).

**Not this path:** Lemonade SD / `SD-Turbo` image generation remains **blocked** on this host (`HOST_LEGACY_GCN` + sd-server). See `lemonade-capability-report.json`.

## Invoke (SX)

```bash
# Capability report → docs/4d-engine/proofs/legacy-efficient/lemonade-sdk-capability-report.json
node sovereign-x/cli/sx-legacy-efficient.mjs --probe-lemonade-sdk

# Live chat via router (intent required for Layer-3 gate)
node sovereign-x/cli/sx-legacy-efficient.mjs --intent demo --provider lemonade-sdk --chat "Reply with exactly: OK"

# Dedicated live proof writer
node sovereign-x/cli/sx-lemonade-sdk-live-proof.mjs
```

Programmatic:

```js
import {
  LemonadeSdkChatClient,
  DEFAULT_CHAT_MODEL,
} from "../router/modules/gpu/amd/lemonadeSdkChatAdapter.js";

const client = new LemonadeSdkChatClient();
await client.connect();
await client.ensureModel(DEFAULT_CHAT_MODEL);
const chat = await client.chatCompletions({
  model: DEFAULT_CHAT_MODEL,
  prompt: "Reply with exactly: OK",
  max_tokens: 16,
});
```

## Proofs

| File | Meaning |
|------|---------|
| `docs/4d-engine/proofs/legacy-efficient/lemonade-sdk-live-chat-proof.json` | Live round-trip transcript |
| `docs/4d-engine/proofs/legacy-efficient/lemonade-sdk-capability-report.json` | Probe (+ optional chat) |
| `docs/governance/cecp/trails/sx-legacy-efficient-3layer-2026-07/09-lemonade-sdk-live-chat-adapter.md` | CECP advance note |

## Tests

```bash
node --test sovereign-x/tests/lemonadeSdkChatAdapter.test.js sovereign-x/tests/lemonadeSdkAdapter.test.js
```

Mock HTTP covers connect / list / ensure / chat / stream. Live proof is host-dependent.

## Honesty (Drive-G-1)

- Chat path is **partial**, not enforced SoT.
- Lemonade SD image gen remains **blocked** on this host (AVX2 / Tonga).
- Assist-only; non-authoritative for Digital Printer / print SoT.
