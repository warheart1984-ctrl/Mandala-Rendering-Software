# 05 â€” Inspector: Claim â†” Evidence & Acceptance

**Trail:** `prompt-scene-adapter-2026-07`  
**Stage:** Inspector  
**Predecessor:** Reviewer (`04-reviewer-conformance.md`)  
**Verdict:** **PASS_WITH_GAPS**

---

## 1. Verdict

**PASS_WITH_GAPS**

Mapping + Genblaze HTTP path have test and CONTRACT evidence. Engine3D world
geometry remains an empty generator stub; `expand_world_request` is identity
(**skeleton**).

## 2. Claim â†” evidence table

| Claim | Evidence | Result |
|-------|----------|--------|
| Theme/keyword â†’ SceneSpecification surface | `test_mrs_map.py`::`test_surface_mapping_theme_and_keywords` | Pass (test present; AC explicit) |
| Surfaces âŠ† RT4D allowlist | `test_rt4d_surface_allowlist` + CONTRACT allowlist | Pass |
| SceneSpecification required fields | `test_scene_specification_schema_fields` | Pass |
| World stub empty arrays | `test_world_stub_empty_object_arrays`; `mrs_map.py` returns `objects: []` etc. | Pass as **partial** stub (gap: no geometry) |
| `expand_world_request` identity | `test_expand_world_request_identity`; `mrs_map.py` returns input | Pass as **skeleton** (gap: not a real expander) |
| Deterministic seeds | `test_deterministic_seeds_same_infinity_payload` | Pass |
| Health exposes prompt_scene | `test_health_exposes_prompt_scene_bridge`; `main.py` health keys | Pass |
| POST `/api/prompt-to-scene` structured | `test_post_prompt_to_scene_mocked` (+ render true/false tests) | Pass (mocked bridge) |
| Error mapping 400/502/503 | `test_prompt_to_scene_400_*`, `_502_*`, `_503_*` | Pass |
| Settings env wiring | `test_settings_prompt_scene_bridge_wiring`; `config.py` | Pass |
| Genblaze ban | `test_ban_note_app_must_not_import_narrative_lane` | Pass |
| Schemas CI-validated | Schema files exist; CONTRACT says **partial** | Gap â€” not enforced |
| Full world expansion | No implementation beyond stub | Gap â€” correctly **not** claimed enforced |
| Cross-org CECP adoption | No evidence in this trail | **declared** only (protocol Â§8) |

## 3. Commands / probes

Canonical (re-run to refresh exit codes):

```text
pytest mrs/adapters/prompt-scene-bridge/test_mrs_map.py
pytest mrs/apps/genblaze-media/tests/test_prompt_to_scene.py
```

Static probes:

- Read `CONTRACT.md` status tags vs code (`expand_world_request` body = `return world_request`)
- Confirm `prompt_scene_provider.py` uses subprocess, not narrative imports
- Confirm Reviewer boundary: **Boundary OK**

## 4. Replay / determinism notes

- Same Infinity-shaped payload â†’ same `output.seed` (unit-tested).
- Fallback `seedSignature` uses stable hex digest prefix (`fallback:â€¦`), not
  randomized hash salting.
- HTTP tests mock the bridge for isolation; live CLI path:
  `python run_bridge.py --prompt "â€¦" --json` (operator probe; optional Infinity env).

## 5. Gaps for Implementor (future)

1. Populate or expand Engine3D world geometry (today empty arrays by design).
2. Replace `expand_world_request` identity with real expansion when Engine3D
   consumer contract is ready â€” keep status tags honest until then.
3. Optional: CI JSON-Schema validation for `schemas/*.schema.json`.
4. Optional: non-mocked integration smoke for `run_bridge.py` in CI.

## 6. Claim wording to downgrade

None beyond what CONTRACT already states. Do **not** upgrade:

- world arrays â†’ **enforced**
- `expand_world_request` â†’ **enforced**
- schemas â†’ **enforced**
- cross-project CECP â†’ **enforced**

without new evidence.

## 7. Acceptance

**Decision:** Accepted as **governed integration point with gaps**.

| Dimension | Statement |
|-----------|-----------|
| **Enforced today** | Out-of-process bridge; MRS SceneSpecification mapping + RT4D surface allowlist; Genblaze `POST /api/prompt-to-scene` + health; error mapping; settings env; narrative-string ban on `app/*.py`; deterministic seed behavior under unit tests |
| **Partial / skeleton gaps** | Engine3D `objects`/`materials`/`lights`/`cameras` empty (**partial**); `expand_world_request` identity (**skeleton**); schema files not CI-validated (**partial**) |
| **Declared non-goals** | Full Infinity in-process; charter auto-amend; cross-org CECP enforcement (Research OS, PARAGON One, Sovereign X OS, CIEMS, DAR-Z) |
| **Maturity note (Drive-G-2)** | This acceptance is **reference-implementation / integration** readiness â€” not a claim that all five maturity dimensions are â€œproduction readyâ€ |

**Reviewer boundary:** OK  
**Inspector verdict:** PASS_WITH_GAPS  
**CECP lineage:** Complete for this trail id.

---

## 8. Follow-on (2026-07-27) — expand gap closed

Identity expand / empty world arrays gap was closed in successor trail
`docs/governance/cecp/trails/engine3d-expand-2026-07/` (Inspector **PASS**).

- Expand path: `expand_world_request` → Node `expand-world-document.mjs` (**enforced**, opt-in).
- Unexpanded stub arrays remain **partial** by design (default without `--expand` / `PROMPT_SCENE_EXPAND_WORLD=1`).
- This document's historical **PASS_WITH_GAPS** verdict is retained as the contemporaneous record; do not rewrite stages 01–07 above.
