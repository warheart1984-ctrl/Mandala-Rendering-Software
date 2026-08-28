# Electrom-Matic Recall (EMR) — Release Whitepaper

**Bundle:** `EMR-bundle-2026-08-28`  
**Generation date:** {{GENERATION_DATE}}  
**Git commit (tested):** {{GIT_COMMIT_SHA}}  
**Implementation scope:** `jarvis-memoryboard/` (Memoryboard API, EMR engine, recall tool, MCP adapter, evaluation harness)

This document states only claims backed by automated tests or directly measured evaluation gates in this release bundle. Claims are tagged **enforced** (test-backed), **partial** (implemented but incomplete substrate), or **declared** (design intent, not runtime-proven here).

---

## 1. Architecture

```
AMUL Architect (LTM substrate)     [declared/partial — outside this package]
        ↓
Jarvis Memoryboard (LTM API)       [enforced — store + CRUD]
        ↓
Intent → EMR (governed activation)   [enforced — app/emr.py]
        ↓ promote / evict
STM (token-budgeted working set)   [enforced — ephemeral view, not SoT]
        ↓
LLM / agent host
```

**Binding contract:** STM eviction is dormancy, not deletion; STM never writes LTM; conflicts are never silently merged.  
**Evidence:** `tests/test_emr.py::test_eviction_is_dormancy_not_delete`, `tests/test_emr.py::test_summary_never_silently_replaces_ltm`, `tests/test_emr_dynamics.py::test_contradiction_membrane_excludes_disputing_particle`

---

## 2. Recall Protocol (tool boundary v1)

`emr_recall` is the read-only agent surface. It maps intent → EMR `excite` → governed bundle with provenance and conflict inspection.

| Surface | Policy | Status |
|---------|--------|--------|
| `emr_recall` | READ — bundle only | **enforced** |
| `emr_propose_memory` | PROPOSE | **declared** (not exposed v1) |
| `emr_commit_memory` | GOVERNED write | **declared** (not exposed v1) |

**HTTP:** `POST /api/jarvis/tools/emr_recall`  
**Tool catalog:** `GET /api/jarvis/tools`

**Evidence:** `tests/test_emr_tool.py::test_tool_catalog_exposes_emr_recall`, `tests/test_emr_tool.py::test_emr_recall_api_endpoint`

Full schema and examples: `docs/EMR_RECALL_PROTOCOL.md`

---

## 3. Abstention and evidence gates

EMR declines recall when top evidence score, query alignment, or score margin fall below configured floors. Subject filters narrow candidates but **do not bypass** abstention.

| Claim | Test reference | Tag |
|-------|----------------|-----|
| Unsupported queries abstain on evidence floor | `tests/test_emr_dynamics.py::test_abstention_rejects_unsupported_query_on_evidence_floor` | enforced |
| Ambiguous distinct claims abstain | `tests/test_emr_dynamics.py::test_abstention_rejects_ambiguous_distinct_claims` | enforced |
| Reinforcement cannot bypass abstention | `tests/test_emr_dynamics.py::test_reinforcement_cannot_make_unsupported_query_pass_abstention` | enforced |
| Abstention floor cannot be weakened by request | `tests/test_emr_dynamics.py::test_abstention_floor_cannot_be_disabled_or_weakened_by_request` | enforced |
| Custom weights cannot bypass abstention | `tests/test_emr_dynamics.py::test_custom_retrieval_weights_cannot_bypass_abstention_gate` | enforced |
| Named subject without evidence abstains | `tests/test_emr_tool_adversarial.py::test_unknown_subject_abstains_or_empty` | enforced |
| Unrelated query + named subject does not force recall | `tests/test_emr_tool_adversarial.py::test_known_subject_unrelated_query_does_not_force_recall` | enforced |
| Archived-only subject does not recall | `tests/test_emr_tool_adversarial.py::test_known_subject_archived_only_does_not_recall` | enforced |

**Live ledger eval (weak labels):** negative-query abstention rate {{NEGATIVE_ABSTENTION_RATE}} on {{NEGATIVE_CASE_COUNT}} negative case(s) (`results/emr-eval-summary.json`). Observational only — not human ground truth.

---

## 4. Contradiction membrane (no silent co-admission)

Unresolved same-subject contradictions are detected and, under `exclude` policy, at most one disputing particle may appear in the bundle.

| Claim | Test reference | Tag |
|-------|----------------|-----|
| Same-subject different-content detected | `tests/test_emr_dynamics.py::test_contradiction_same_subject_different_content` | enforced |
| Membrane excludes disputing particle | `tests/test_emr_dynamics.py::test_contradiction_membrane_excludes_disputing_particle` | enforced |
| Tool surfaces conflicts, ≤1 co-admitted | `tests/test_emr_tool_adversarial.py::test_known_subject_unresolved_conflict_surfaces_no_coadmission` | enforced |
| Controlled eval: {{EXCLUDE_LEAKS}} exclude leaks / {{CONTRADICTION_PROBES}} probes | `results/emr-eval-summary.json` → `metrics.contradiction.exclude_leaks` | measured |

---

## 5. Reinforcement safety

Reinforcement affects activation ranking via an isolated dynamics sidecar. LTM ledger bytes are immutable during reinforce/excite routes.

| Claim | Test reference | Tag |
|-------|----------------|-----|
| Positive outcome required | `tests/test_emr_reinforce.py::test_route_rejects_reinforcement_without_positive_outcome` | enforced |
| Auto-reinforce requires outcome signal | `tests/test_emr_dynamics.py::test_auto_reinforcement_requires_positive_outcome_signal` | enforced |
| Caps prevent runaway dominance | `tests/test_emr_reinforce.py::test_reinforcement_is_bounded_no_runaway_dominance` | enforced |
| Ledger bytes preserved on reinforce route | `tests/test_emr_reinforce.py::test_route_reinforce_preserves_ledger_bytes` | enforced |
| Sidecar stays outside ledger store | `tests/test_emr_dynamics.py::test_sidecar_stays_outside_ledger_store` | enforced |
| Eval: {{CAP_VIOLATIONS}} cap violations, {{TRUTH_MUTATIONS}} truth mutations | `results/emr-eval-summary.json` → `metrics.reinforcement_bias` | measured |

---

## 6. Graph expansion

Bounded multi-hop expansion over bond edges (supersedes, evidence links, shared subject/tags).

| Claim | Test reference | Tag |
|-------|----------------|-----|
| Two-hop lineage recall | `tests/test_emr_dynamics.py::test_bounded_graph_expansion_recalls_two_hop_lineage` | enforced |
| Path integrity for boosted entries | `results/emr-eval-summary.json` → `metrics.graph.path_integrity_rate: {{PATH_INTEGRITY_RATE}}` | measured |
| Graph noise on weak labels | proxy noise {{GRAPH_NOISE_RATE}} on {{GRAPH_NOISE_ADDITIONS}} addition(s) — **finding only**, not a product claim | observational |

Graph retrieval precision/recall in eval uses metadata-lineage proxies (45 cases) and historic RAG replay (3 cases). Treat as **observational**, not semantic ground truth.

---

## 7. MCP stack

```
Agent host → MCP stdio (mcp_server/emr_stdio.py) → HTTP POST /api/jarvis/tools/emr_recall → EMR
```

| Component | Status | Evidence |
|-----------|--------|----------|
| Stdio MCP server (`python -m mcp_server`) | **enforced** | `tests/test_emr_mcp.py` (4 tests) |
| HTTP proxy to memoryboard | **enforced** | `tests/test_emr_mcp.py::test_tools_call_proxies_to_http` |
| ChatGPT Secure MCP Tunnel | **declared** — documented, not CI-tested | `docs/MCP_EMR_SETUP.md` |
| Remote memoryboard without tunnel | **declared** — requires operator TLS bridge | `docs/MCP_EMR_SETUP.md` |

Setup guide (live vs declared tagged): `docs/MCP_EMR_SETUP.md`

---

## 8. Evaluation harness

`app/emr_eval.py` runs read-only against a ledger file. This bundle evaluated **{{EVALUATION_MODE}}** ledger `{{LEDGER_PATH}}` ({{MEMORY_COUNT}} memories, {{CASE_COUNT}} cases).

| Safety gate | Result |
|-------------|--------|
| `graph_paths_structurally_valid` | {{SAFETY_GRAPH_PATHS}} |
| `contradiction_membrane_no_leak` | {{SAFETY_CONTRADICTION}} |
| `reinforcement_caps_respected` | {{SAFETY_CAPS}} |
| `reinforcement_requires_positive_outcome` | {{SAFETY_OUTCOME}} |
| `reinforcement_did_not_mutate_truth` | {{SAFETY_TRUTH}} |
| `live_files_unchanged` | {{SAFETY_LIVE_FILES}} |

Overall: `safety_status: {{SAFETY_STATUS}}`, `status: {{EVAL_STATUS}}` (graph noise proxy finding on weak labels).

Protocol: `docs/EMR_EVALUATION_PROTOCOL.md`

---

## 9. Test corpus summary (this release)

**Command:** `pytest tests/test_emr*.py -v`  
**Result:** {{PASSED}} passed, {{FAILED}} failed, {{SKIPPED}} skipped (see `results/emr-test-results.txt`)

| Module | Tests | Focus |
|--------|------:|-------|
| `test_emr.py` | 7 | STM/LTM boundary, budget, provenance |
| `test_emr_dynamics.py` | 22 | Abstention, contradiction, graph, weights |
| `test_emr_reinforce.py` | 9 | Reinforcement routes, caps, idempotency |
| `test_emr_tool.py` | 4 | Recall tool + API |
| `test_emr_tool_adversarial.py` | 5 | Subject-targeted abstention |
| `test_emr_mcp.py` | 4 | MCP stdio adapter |
| `test_emr_eval.py` | 3 | Eval harness |
| `test_emr_correct.py` | 4 | Correction / receipt |
| `test_emr_baselines.py` | 2 | Baseline comparators |

---

## 10. Known boundaries (not claimed)

- **AMUL LTM substrate** — declared/partial; EMR does not invent persistent memory architecture.
- **Semantic retrieval quality** on production queries — observational weak labels only until human-label JSONL is supplied.
- **ChatGPT remote MCP** — operator-dependent tunnel; not automated in this test suite.
- **Write-path tools** (`emr_propose_memory`, `emr_commit_memory`) — reserved, not shipped in v1.

---

## Related documents in this bundle

- `docs/EMR_RECALL_PROTOCOL.md` — protocol schema
- `docs/CONSTITUTIONAL_MEMORY_CONTRACT.md` — layer contract
- `docs/EMR_EVALUATION_PROTOCOL.md` — eval methodology
- `docs/MCP_EMR_SETUP.md` — MCP host configuration (live vs declared)
- `results/emr-test-results.txt` — full pytest log
- `results/emr-eval-summary.md` / `.json` — live-ledger evaluation
- `MANIFEST.json` — file hashes and provenance index
- `SOURCE_MANIFEST.txt` — key source files
