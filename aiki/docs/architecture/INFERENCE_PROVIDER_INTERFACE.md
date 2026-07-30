# Inference Provider Interface (IPI)

**Status:** **declared** / **skeleton** (Drive-G-1)  
**Not enforced.** No live provider calls in this scaffold.

## Mission Lock applies

Every IPI feature must still answer:

1. Does it improve understanding?
2. Does it preserve evidence and reproducibility?
3. Will it still make sense ten years from now?

If any answer is **no**, rethink the implementation.  
Full lock: [MISSION_LOCK.md](../charter/MISSION_LOCK.md)

## Architecture (not nesting)

AIKI owns knowledge, understanding, learning, and publication. Inference is a **pluggable side interface**, not a parent system and not an AAIS-owned core.

```text
AIKI
  Knowledge Engine
  Understanding Engine
  Learning Engine
  Publication Engine
        │
Inference Provider Interface (IPI)
├── OpenAI
├── Anthropic
├── Google
├── Mistral
├── Local Ollama
├── vLLM
├── AAIS          ← optional local runtime, one provider among many
└── Future Providers
```

## Principles (vendor neutrality)

- AIKI must **not** depend on any single model or “uncensored” stack.
- Knowledge Engine, Understanding Engine, CKO pipeline, and replay call a **common inference interface**; backends swap via config (`config/inference.yaml`).
- **AAIS** is one optional local inference runtime (script drafting, visual prompts, image analysis, knowledge extraction, educational dialogue). It is **replaceable**. Swapping Mistral/Ollama/etc. must not change AIKI core.
- AIKI stays focused on knowledge, understanding, and educational infrastructure.

## Task routing examples (placeholders)

| Task class | Example use | Default route (config stub) |
|------------|-------------|-------------------------------|
| reasoning | Script draft critique, CKO gap analysis | `providers.default_reasoning` |
| image | Thumbnail / diagram prompt assist | `providers.default_image` |
| vision | Slide/screenshot understanding | `providers.default_vision` |
| local | Offline drafting / private notes | `providers.default_local` |

Routing is configuration, not hard-coded vendor branches in engines.

## Code surface

Skeleton only: `aiki/pipeline/inference/` — abstract `InferenceProvider` + stub adapters. **No API keys. No network calls.**

## Relationship to CKO-0001

CKO-0001 build path does not require IPI at publish time (recorded voice MVP). IPI is declared now so future assistive drafting remains vendor-neutral when enabled.
