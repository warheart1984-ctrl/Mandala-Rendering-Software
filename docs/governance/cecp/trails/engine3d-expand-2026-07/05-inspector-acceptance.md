# 05 — Inspector: Claim ↔ Evidence & Acceptance

**Trail:** `engine3d-expand-2026-07`  
**Stage:** Inspector  
**Predecessor:** Reviewer (`04-reviewer-conformance.md`)  
**Verdict:** **PASS**

---

## 1. Verdict

**PASS**

Predecessor identity-expand gap is closed with code + test evidence.

## 2. Claim ↔ evidence table

| Claim | Evidence | Result |
|-------|----------|--------|
| `expand_world_request` is not identity | `mrs_map.py` subprocess to Node expand script; requires non-empty `objects` | Pass |
| Expand CLI uses generators | `expand-world-document.mjs` → `createWorldGenerator` + `generateWorldFromGenerator` | Pass |
| CONTRACT: expand **enforced**, stub **partial** | `CONTRACT.md` status tags | Pass |
| No `story_forge` in Genblaze `app/*.py` | Grep clean under `app/*.py` | Pass |
| Mapper + expand unit tests | `test_mrs_map.py` → **17 passed** | Pass |
| Genblaze prompt-to-scene tests | `test_prompt_to_scene.py` → **9 passed** | Pass |

## 3. Commands / probes

```text
pytest mrs/adapters/prompt-scene-bridge/test_mrs_map.py -q --tb=line
→ exit 0 | 17 passed

pytest mrs/apps/genblaze-media/tests/test_prompt_to_scene.py -q --tb=line
→ exit 0 | 9 passed
```

Expand star/mandala/determinism cases ran (Node + `dist/` present).

## 4. Replay / determinism

Same stub seed → identical object id lists / JSON (`test_expand_world_request_deterministic_same_seed`).

## 5. Gaps remaining (honest)

1. Default bridge path still leaves stub **partial** unless `--expand` / `PROMPT_SCENE_EXPAND_WORLD=1` (by design).
2. `schemas/*.schema.json` remain **partial** (not CI-validated).
3. Expand requires Node + built `engine3d-core` `dist/`.
4. Pre-existing mapper: keyword `mandala` routes to **star** generator; empty/non-star keywords → mandala type.

## 6. Acceptance

**Decision:** Accept trail `engine3d-expand-2026-07`.

| Dimension | Statement |
|-----------|-----------|
| **Enforced today** | Opt-in expand path: Node CLI + Python `expand_world_request`; star+mandala non-empty worlds; Genblaze expand env wiring; narrative ban on `app/*.py` |
| **Partial** | Unexpanded stub arrays; schema CI validation |
| **Maturity note (Drive-G-2)** | Reference-implementation expand readiness — not a claim all five maturity dimensions are production-ready |

**Reviewer boundary:** OK  
**Inspector verdict:** PASS  
**CECP lineage:** Complete for this trail id.
