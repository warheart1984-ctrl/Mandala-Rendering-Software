# ESFR Promotion Checklist — Digital Printer Initiative

> **Status:** living checklist with honest Drive-G-1 tags.  
> **Active trail verdict:** `docs/governance/cecp/trails/digital-printer-v2-2026-07/08-esfr-verdict.json`  
> **Version:** **2.0** — `PROMOTE` / `PROMOTE_WITHOUT_GAPS`

Legend: `[x]` verified · tags: **enforced** / **partial** / **declared** / **skeleton**

## A. Governance Completeness

| Item | Box | Tag |
|------|-----|-----|
| 102/102 governance tests passing | [x] | enforced (`npm run test:governance`) |
| CHARTER frozen | [x] | enforced |
| CONTRACTS frozen | [x] | enforced |
| CKL decision logic validated | [x] | enforced (`test:ckl`) |
| Governance Kernel intent evaluation validated | [x] | enforced |
| CSE execution + CSR provenance validated | [x] | enforced (printer CSR emission) |
| Schemas created (GovernanceDecision, CSR, ProvenanceFrame) | [x] | enforced |

## B. Rendering Determinism

| Item | Box | Tag |
|------|-----|-----|
| Deterministic sampling (stratified AA) | [x] | enforced |
| Deterministic reconstruction | [x] | enforced |
| Deterministic tonemap (ACES opt-in) | [x] | enforced |
| Deterministic color pipeline | [x] | enforced |
| Deterministic encode → PNG | [x] | enforced |
| Deterministic hash generation | [x] | enforced |
| Print plate reproducible across runs | [x] | enforced |

## C. Surface Sovereignty

| Item | Box | Tag |
|------|-----|-----|
| Surface contract enforced | [x] | enforced (v2.0) |
| Error states enforced | [x] | enforced |
| Evidence hashes generated | [x] | enforced |
| Lineage generated | [x] | enforced |
| Unity + Unreal + Engine surfaces synced | [x] | enforced (mesh SHA verify) |
| Mesh SHA-256 verification | [x] | enforced |

## D. Evidence Completeness

| Item | Box | Tag |
|------|-----|-----|
| beauty.png | [x] | enforced |
| evidence.json | [x] | enforced (schemaVersion 2.0) |
| lineage.json | [x] | enforced |
| provenance frames | [x] | enforced |
| CSR records | [x] | enforced |
| governance decision logs | [x] | enforced |

## E. Gaps to Close Before Promotion

| Item | Box | Tag |
|------|-----|-----|
| Denoise → enforced | [x] | enforced (all print backends) |
| Soft penumbra → enforced | [x] | enforced |
| RT4D specular materials → enforced | [x] | enforced |
| Print timeout governance → added | [x] | enforced |
| Print quality profiles → added | [x] | enforced |

## Verdict

**ESFRVerdict:** `PASS`  
**PromotionEligibility:** `PROMOTE`  
(User-language: **PROMOTE_WITHOUT_GAPS**)
