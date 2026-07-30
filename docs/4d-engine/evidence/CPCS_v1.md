# Constitutional Photoreal Certification Standard (CPCS) v1.0

| Field | Value |
|-------|-------|
| **Artifact class** | CPE-CPCS-PHR |
| **Status** | Spec **declared** · Evaluator **partial** |
| **Schema** | `schemas/ciems/cpcs-v1.json` |
| **Module** | `evaluateCertification.js` |
| **Drive-G-1** | `certified: true` / `PHASE_4_FULL_PHOTOREAL` only when **all** gates pass |

## Purpose

Define when CIEMS may declare a renderer **Phase 4 Certified Photoreal**. CPCS consumes Phase 3 artifacts (FPEC, CEL, checklist, RDC/DRE, CAT-PHR) and never invents eligibility.

## Core criteria

| Gate | Requirement |
|------|-------------|
| FPEC | `fullPhotorealEligible === true` |
| PEP | completeness ≥ **0.95** |
| SPR | completeness === **1.0** |
| Checklist | T-01..T-13 all **pass** (count === 13) |
| DRE | `dualRunMatch` (GLB/hash match) **and** `replayVerified` (pixel dual-run identical) |
| CAT-PHR | `verdict === "PASS"` |

`held-not-rerun` pixel status does **not** satisfy `replayVerified`.

## Output (`cpcs.json`)

```json
{
  "rendererId": "Cycles",
  "runId": "587f836fc789a003",
  "certified": false,
  "certificationLevel": "NONE",
  "eligibilityScore": 0.8889,
  "pepCompleteness": 0.8788,
  "sprCompleteness": 1.0,
  "checklistPassCount": 8,
  "dreVerified": false,
  "auditVerdict": "PASS_WITH_GAPS"
}
```

`certificationLevel` is `PHASE_4_FULL_PHOTOREAL` only when `certified === true`; otherwise `NONE`.

## CLI

```bash
npm run mrs:photoreal-certify -- --out-dir tmp/blender-10s-test/governed-render/587f836fc789a003
```

Also runs automatically after CAT-PHR inside `mrs:photoreal-promote`.
