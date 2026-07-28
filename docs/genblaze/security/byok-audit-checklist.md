# Constitutional Audit Checklist — BYOK Compliance

**Artifact:** `docs/genblaze/security/byok-audit-checklist.md`  
**Status:** Operator checklist · evidence-bound where tested

## Section I — Storage Compliance

- [x] Key stored only in `sessionStorage` (UI) — **enforced** by design in `index.html`
- [x] Key never written to disk by Genblaze BYOK module — **enforced** (`app/byok.py`)
- [x] Key never logged — **enforced** (meta booleans only; tests assert no `nvapi` in `/health`)
- [x] Key never stored in B2 — **declared**/policy
- [x] Key never stored in Git — **operator** (`.env` gitignored; do not commit keys)
- [x] Key never stored as durable BYOK server vault — **enforced** (request-scoped only)
- [x] Key never enters Digital Printer evidence SoT — **policy** + print safeguards

## Section II — Transmission Compliance

- [x] Key only used toward NIM via Genblaze NVIDIA client after policy check — **enforced**
- [x] Key never required by CPU RT4D path — **enforced** (RT4D does not use BYOK)
- [x] Key never required by GPU integrator parity harness as print SoT — **policy**
- [x] SceneSpec extractor does not need the key (operates on FLUX JSON) — **enforced**
- [x] Key never sent to Digital Printer API as SoT — **policy**
- [x] HTTPS to NIM (loopback Genblaze may be HTTP locally) — **operator**

## Section III — Hosted Deployment Compliance

- [x] Hosted BYOK disabled by default — **enforced** (`RENDER` + no flag → 403)
- [x] `GENBLAZE_ALLOW_BYOK=1` required for hosted BYOK — **enforced**
- [ ] Hosted UI warns about XSS risk — **partial** (settings copy present; dedicated banner **declared**)
- [x] No multi-tenant key vault — **enforced**

## Section IV — Model Override Compliance

- [x] Model override stored only in session / request header — **enforced**
- [x] Model override never persisted server-side as BYOK state — **enforced**
- [x] Paid models only if user’s key grants access — **vendor** (honest)
- [x] No model override leakage into print evidence — **policy**

## Section V — Constitutional Compute Compliance

- [x] GPU / NIM assist-only classification — **policy** + Sovereign X contracts
- [x] DeterminismRequired routes to CPU RT4D — **enforced** in SX router
- [x] GPU never used as Digital Printer SoT — **enforced** (`gpuPrintSafeguard`)
- [x] No GPU beauty SoT in evidence chain — **policy**
- [x] No key in evidence chain — **policy** + tests on `/health`
