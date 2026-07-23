# Scorecard — fourd-renderer-v2

> Template alignment: Drive-G maturity dimensions.  
> Project id: `fourd-renderer-v2`  
> Updated: 2026-07-23  
> Evidence anchor: `docs/4d-engine/v2/` RFC suite + MRS/RT4D/Engine v1 cross-links

## Snapshot

| Field | Value |
| --- | --- |
| Project ID | `fourd-renderer-v2` |
| Repository path | `G:\New folder` |
| Review date | 2026-07-23 |
| Reviewer | agent session (docs land) |

## Dimension ratings

| Dimension | Rating | Audience | Evidence |
| --- | --- | --- | --- |
| Constitutional model | Declared (early) | Architects | `docs/4d-engine/v2/*` RFCs + Architecture; inherits Engine v1 / PLP |
| Governance methodology | Declared | Operators | Observation Mode / lineage / determinism contracts; not machine-enforced as v2 GPU gates |
| Reference implementation | Partial (MRS) / Early skeleton (v2 GPU) | Developers | RT4D, BVH4D CPU/GPU skeleton, Canvas; v2 compute **roadmap** |
| Platform engineering | Skeleton / roadmap | Operators | FourDAdapter hybrid-first; RHI / Nanite / Lumen **roadmap** |
| Commercial operations | Roadmap | Business | No self-serve claimed |

## Audience readiness

| Audience | Assessment | Notes |
| --- | --- | --- |
| Operators (deploy & run) | Partial (browser/MRS) · Not ready (v2 Unreal RHI) | Do not conflate |
| Users (signup & self-serve) | Not ready | Not claimed |

## Overall framing

> **This project is** declared at the constitutional / RFC layer, and early / roadmap at the platform and commercial layers. The engine contracts exist on paper and partially in MRS; the Unreal RHI factory is still early.

## Non-claims (explicit)

- [ ] “World’s first” 4D renderer / architecture  
- [ ] Production Unreal RHI modifications  
- [ ] Nanite / Lumen 4D working  
- [ ] SO(4) BSDF GPU enforcement  
- [ ] Phase 1 GPU complete  
- [ ] Measured 4–6 ms SLA  

## Verification commands

Documentation land — no new GPU tests required. Existing suites should remain green:

```bash
# Optional smoke (existing)
npm run test:4d-renderer
npm run validate:world-document
```

## Cross-links

- Index: [`docs/4d-engine/v2/README.md`](../4d-engine/v2/README.md)  
- Engine v1 scorecard: [`docs/scorecards/4d-engine-v1.md`](./4d-engine-v1.md)  
- Charter: [`constitution/CHARTER.md`](../../constitution/CHARTER.md)
