# 09 — Lemonade SDK Live Chat Adapter → **partial**

| Field | Value |
|-------|-------|
| `trailId` | `sx-legacy-efficient-3layer-2026-07` |
| `noteId` | `09-lemonade-sdk-live-chat-adapter` |
| `date` | 2026-07-29 / 2026-07-30 |
| `roles` | Implementor (Integrator SC) + mrs-crew foreman |
| `crew` | advance note (extends 08; no charter edits) |

## Intent

Replace the Lemonade SDK probe stub with a first-class Live SDK chat adapter wrapping Lemonade’s OpenAI-compatible API; unblock live chat on FX-8350 / R9 380 via Vulkan GGUF; prove one successful round-trip.

## Upstream pin

| Repo | Path | SHA |
|------|------|-----|
| lemonade-sdk/lemonade | `vendor/lemonade` | `044138de2694562f8128ba1254960c34ff866465` |

Evidence: `docs/4d-engine/proofs/legacy-efficient/upstream-vendor-pins.json`

## What advanced (**partial**)

| Surface | Tag | Evidence |
|---------|-----|----------|
| `LemonadeSdkChatClient` | **partial** | `lemonadeSdkChatAdapter.js` — connect, listModels, ensureModel (`POST /pull`), chatCompletions, chatCompletionsStream, capabilityProbe |
| SX façade | **partial** | `lemonadeSdkAdapter.js` re-exports; `--provider lemonade-sdk` / `--chat` / `--probe-lemonade-sdk` |
| Backend | **partial** | `lemonade backends install llamacpp:vulkan` (avoids AVX2 CPU binary on FX-8350) |
| Live chat | **partial** | `Llama-3.2-1B-Instruct-GGUF` → content `"OK"`; proof JSON |
| Unit tests (mock HTTP) | **partial** | `sovereign-x/tests/lemonadeSdkChatAdapter.test.js` (14 tests green) |
| Docs | **partial** | `docs/4d-engine/LEMONADE_SDK_CHAT.md`; PHOTOREAL invoke updated |

## Live proof (this host)

| Field | Value |
|-------|-------|
| Base | `http://localhost:13305/api/v1` (`:8000` down) |
| Model | `Llama-3.2-1B-Instruct-GGUF` |
| Also pulled | `Qwen3-0.6B-GGUF`, `Bonsai-1.7B-gguf` (Qwen3 garbled/empty here) |
| Reply | `"OK"` |
| Proof | `docs/4d-engine/proofs/legacy-efficient/lemonade-sdk-live-chat-proof.json` |

## Invoke

```bash
node sovereign-x/cli/sx-legacy-efficient.mjs --probe-lemonade-sdk
node sovereign-x/cli/sx-legacy-efficient.mjs --intent demo --provider lemonade-sdk --chat "Reply with exactly: OK"
node sovereign-x/cli/sx-lemonade-sdk-live-proof.mjs
```

## Still **blocked** / **absent** / **partial** (HIP)

| Surface | Tag |
|---------|-----|
| Lemonade SD image generation | **blocked** (AVX2 / Tonga) |
| HIP SDK (Program Files) | **partial** when `hipcc` found — see `hip-sdk-detection-report.json`; re-run `sx-hip-sdk-probe.mjs` after installer |
| HIP beauty kernel on Tonga | **declared** sketch only (`hipBeautyAssistSketch`); device enum may still fail |
| Photoreal vs 40-series claims | **not claimed** |

## Protected paths

None edited (`constitution/`, `AGENTS.md`, charter/policies untouched).

## Status tag (normative)

Chat path: **partial** — live round-trip succeeded (`Llama-3.2-1B-Instruct-GGUF`); assist-only; not print SoT.
HIP toolchain: **partial** (SDK on disk) ≠ enforced ROCm device support on R9 380.
