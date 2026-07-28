# Digital Printer Deployment Charter (v1.0)

> **Status:** **declared** — deployment requirements and invariants for operators.
> Does **not** amend `constitution/CHARTER.md` or `engine/constitution/charter.js`.
> **Authority:** CHARTER v1.0 framing + `CONTRACT_DIGITAL_PRINT` + PrintSurfaceContract.
> **Trail:** `docs/governance/cecp/trails/printer-mode-renderer-2026-07/`

## Purpose

Deploy the Digital Printer Initiative as a governed, deterministic rendering
service: faithful encoding of declared surfaces into pixels with evidence and
lineage — not a commercial RIP, not diffusion.

## Authority

Granted under constitutional CHARTER v1.0 framing and
`mrs/adapters/storyforge-boundary/CONTRACT_DIGITAL_PRINT.md`, enforced at intake
by `governance/surface_contract.json`.

## Invariants

1. No execution without intent  
2. No state change without evidence  
3. No authority without contract  
4. No rendering without declared surfaces  
5. No print without lineage  

## Deployment requirements

| Requirement | Tag | Evidence |
|-------------|-----|----------|
| Deterministic print pipeline | **enforced** (scene-spec path) | printer pipeline + demo |
| Surface sovereignty enforcement | **enforced** | sovereignty.py tests |
| Evidence + lineage generation | **enforced** | evidence.json / lineage.json |
| Governance schemas available | **partial** | `schemas/CSR.schema.json` etc. present; live CSR emission **declared** |
| MCP server integration | **skeleton** | `printer_mcp_capabilities.json` descriptors only |
| Render-compatible Dockerfile | **partial** | Genblaze image may host `/printer`; printer execute needs Node + adapter |
| Health checks | **enforced** | `GET /printer/health` + `/health.printer` |
| Reproducible outputs | **partial** | same seed/spec → identical PNG on same tool chain |

## Outputs

- `beauty.png`  
- `evidence.json`  
- `lineage.json`  
- CSR records (**declared**/skeletal in trail)  
- provenance frames (**partial**)  

## Promotion

Eligible for `PROMOTE` / user-language `PROMOTE_WITHOUT_GAPS` **only after**
section E gaps close and ESFR returns `PASS` or `PASS_WITH_GAPS` with matching
`PromotionEligibility`. Current initiative verdict: **HOLD** — see trail
`08-esfr-verdict.json`.

## Local operator run

```bash
# Adapter demo
python mrs/adapters/storyforge-boundary/demo_digital_print.py \
  --out-dir output/cecp-digital-print --samples 16

# Genblaze printer API (from mrs/apps/genblaze-media)
set PRINTER_API_ENABLED=1
set MRS_PRINT_TIMEOUT_SECONDS=900
uvicorn app.main:app --reload --port 8000
# GET  http://127.0.0.1:8000/printer/health
# POST http://127.0.0.1:8000/printer/validate
# POST http://127.0.0.1:8000/printer/print?dry_run=true
```
