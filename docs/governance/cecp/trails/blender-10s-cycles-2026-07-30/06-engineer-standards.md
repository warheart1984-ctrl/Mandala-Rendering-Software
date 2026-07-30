# 06 — ESFR (Engineer Standards)

| Field | Value |
|-------|-------|
| Role | ESFR / Engineer Standards |
| ESFRVerdict | **PASS_WITH_GAPS** |
| PromotionEligibility | **PROMOTE_WITH_GAPS** |
| Intake | Inspector **PASS_WITH_GAPS** accepted |

## Test matrix (abbrev)

| Category | Outcome | Note |
|----------|---------|------|
| Engineering Standards Compliance | PASS | No code drift; execute-only cycle |
| Architectural Coherence | PASS_WITH_GAPS | Reuses external-pbr + Cycles script; photoreal still partial |
| Execution Legitimacy (CHEA) | declared N/A | Layer declared only |
| Capability Legitimacy (CCR) | declared N/A | |
| Operational Legitimacy (CDGF) | declared N/A | |
| Drive-G-1 / claim honesty | PASS | Held export; partial status; real PNG bytes |
| Determinism / replay | PASS_WITH_GAPS | seed=0; CPU host-specific timing |
| CI/tests | PASS_WITH_GAPS | Manual smoke; prior unit paths unchanged |

## Probes 01–08 (citations)

| Probe | Cite |
|-------|------|
| 01 Invoke | Blender CLI + governed-render commands in `03-implementor-notes.md` |
| 02 Artifacts | PNG + `verification-trail.json` under `tmp/blender-10s-test/` |
| 03 Honesty tags | `exportStatus: held`, `cyclesStatus: complete`, trail `status: partial` |
| 04–05 Declared layers | CHEA/CCR/CDGF N/A for this smoke |
| 06 Lineage | This trail + Quality Progress Log entry |
| 07 Scope | No protected-path edits |
| 08 Gaps listed | CPU-only; smoke res; Lemonade held; OpenCL assist fail |

## Promotion path

- **PROMOTE_WITH_GAPS** for: short Cycles smoke + governed external-pbr beauty pixel path on Blender 5.2 host.
- Not eligible for unqualified photoreal/production promotion until GPU Cycles and higher-quality plates have evidence.

## Gaps for later

1. Enable HIP/OptiX (or document permanent CPU fallback).
2. Optional second GLB consumer in proof pack (prior Quality Log bottleneck).
3. Keep Lemonade **held** until consistent `pixelsProduced: true`.
