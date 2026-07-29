# 01 — Architect ADR (Evidence demo + interop)

**Date:** 2026-07-29  
**Mode:** Boundary-Guardian (architecture freeze)

## Intent

Deliver a **scriptable, documented** operator path for prompt → scene → CPU render → governed evidence → replay, plus a shared **evidence package shape** and **interop matrix** across Mandala-family systems — without new constitutional organs or IDAC certification claims.

## Architecture freeze (IDAC Core + charter)

| Rule | Decision |
|------|----------|
| No new organs | Reuse CKL, GK, CSE, ProvenanceRecorder, ReplayService, prompt-scene-bridge |
| Print SoT | `cpu.rt4d` only in demo; GPU assist excluded |
| GK↔CSE | Orchestrator composes; GK holds optional `cse` ref (**partial** — no evaluateIntent delegation) |
| C# ExecutionOrchestrator | Contract skeleton only; JS orchestrator is reference for tests |
| IDAC certification | Remains **false** until checklist evidence exists |

## Scope

**In:**

- `scripts/demo-evidence-pipeline.mjs` + `npm run demo:evidence-pipeline`
- Trail artifacts, interop matrix, gap scoreboard
- `engine/governance/test/orchestrator.test.js` (CKL→GK→CSE path)
- Include related uncommitted governance/CSSV/ISL work in same commit when green

**Out:**

- New HTTP services, Genblaze mandatory path, Unity Play Mode CI
- Genblaze AO/GI invented flags
- Protected path edits without authorization

## Contracts

| Stage | Input | Output |
|-------|-------|--------|
| Prompt | `--prompt` string | `run_bridge.py` JSON (`sceneSpecification`, `engine3dWorldDocument`) |
| Render | Scene surface (tesseract for charter invariants) | PNG buffer + `frameDigest` |
| Governance | Intent + evidence | GK decision + CSE CSR via ExecutionOrchestrator |
| Replay | Provenance frame | `ReplayService.createLineageReceipt` |

Evidence package: `kind: mrs-evidence-package`, `version: 1` (see `artifacts/sample-evidence-package.json`).

## Acceptance tests

- [ ] `npm run demo:evidence-pipeline` writes artifact and exits 0
- [ ] `npm run test:governance` includes orchestrator tests pass
- [ ] `npm run test:conformance` → 16/16 when governance touched
- [ ] IDAC checklist not marked certified

## Handoff

Builder → manifest; Implementor → script + tests; Reviewer/Inspector → conformance rows; ESFR → promotion tier.
