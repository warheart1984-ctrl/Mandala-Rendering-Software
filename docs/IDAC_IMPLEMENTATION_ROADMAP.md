# IDAC Implementation Roadmap (post-freeze)

**Strategic shift:** implementation maturity measured by **evidence class**, not new concepts.  
**Core spec:** frozen at v0.1 — see `docs/IDAC_CORE_FREEZE.md`.

| # | Roadmap item | Current status | Evidence required to promote |
|---|--------------|----------------|------------------------------|
| 1 | **Complete IDAC Core Specification (locked)** | **enforced** (freeze doc + inventory) | Conformance Evidence: version pins in CI; no drift vs schemas |
| 2 | **Build full IDAC Conformance Suite** | **partial** (L0 + L1; L2 stub) | Verification + Conformance: L1 live dispatch row; L2 or explicit waivers; bit-identical xfail documented |
| 3 | **Replace declared → verified** | **partial** | Verification per feature: TileScheduler, ShadingEngine, Learning store, CKL charter load |
| 4 | **Real performance measurements** | **partial** (Cycle 5 samples) | Performance Evidence: reproducible wall-clock runs; env + commit recorded; not estimate_not_measured |
| 5 | **Certify first conformant reference runtime** | **declared** | Conformance Evidence (full suite green) + Operational Evidence (canonical E2E) + Performance Evidence (agreed bar) |

## Status tag legend

| Tag | Meaning |
|-----|---------|
| **declared** | Designed or stubbed; no Verification row |
| **partial** | Some tests or live path; gaps documented |
| **enforced** | Tests/ops gate; claim bounded to evidence cited |

## Top implementation targets (next)

1. **Conformance L1 live dispatch** — extend suite with optional live Genblaze row (Operational + Verification); keep mocked default in CI.
2. **Declared runtime components** — TileScheduler / per-tile path: either implement or Conformance waiver with permanent `declared` tag (no fake pass).
3. **Performance harness** — run harness in CI optional job; store artifacts under trail; first **Performance Evidence** for `atcm/plan` + `direct(atcm)` wall-clock only.

## Evidence hierarchy

`mrs/apps/infinity-director/docs/IDAC_EVIDENCE_HIERARCHY.md`

## CECP

`docs/governance/cecp/trails/idac-stack-2026-07/` — ESFR **PROMOTE_WITH_GAPS** until items 2–4 satisfy their evidence classes.
