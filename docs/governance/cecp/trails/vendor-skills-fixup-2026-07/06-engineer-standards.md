# 06 — Engineer Standards (ESFR)

**Trail:** `vendor-skills-fixup-2026-07`  
**Stage:** ESFR  
**Inspector input:** PASS_WITH_GAPS (2026-07-28)

## ESFRVerdict

| Field | Value |
|-------|-------|
| Verdict | **PASS_WITH_GAPS** |
| PromotionEligibility | **PROMOTE_WITH_GAPS** |
| residualGaps | Live WebGPU Node print; host nvidia-smi elevation; no HIP print (absent by design); live Render NIM E2E not re-run |

## Why PROMOTE_WITH_GAPS (not HOLD)

- Scoped vendor-skill fixes landed with unit + script evidence  
- Drive-G-1 honesty preserved (no fake CUDA/HIP/NIM-as-print-SoT)  
- Remaining gaps are declared absences / partial host tooling, not sovereignty breaks  

## Test matrix (probes 01–08)

| Probe | Result | Cite |
|-------|--------|------|
| 01 Intent | PASS | `01-architect-adr.md` |
| 02 Boundary / bans | PASS | no protected paths; NIM≠beauty |
| 03 Determinism | PASS | no new non-determinism in print SoT |
| 04 Evidence chain | PASS | health checklist from warmup state only |
| 05 No fake free lunch | PASS | skills inventory N/A rows |
| 06 NVIDIA assist≠SoT | PASS | honesty map + inventory |
| 07 AMD honesty | PASS | HIP print absent; detect scaffold only |
| 08 Runtime GPU live | GAP | WebGPU skip≠pass; nvidia-smi permissions |

## Fresh verification (required)

```text
5 passed — Genblaze NIM health/help/checklist tests
23 pass / 0 fail — cpu-gpu-comparison (+ vendor honesty)
check-nvidia-gpu-host / detect-gpu-backend — honest reports
```

## Relation to other trails

Does not reopen Digital Printer v2 PROMOTE. Complements `printer-gpu-quality-speed-2026-07` with ops scaffolding from vendor skills.
