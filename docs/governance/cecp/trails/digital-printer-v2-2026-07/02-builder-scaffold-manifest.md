# 02 — Builder scaffold manifest

**Trail:** `digital-printer-v2-2026-07`  
**Role:** Builder  
**Status:** stubs → filled by Implementor

## Created / touched shells

| Path | Action | Tag |
|------|--------|-----|
| `docs/governance/cecp/trails/digital-printer-v2-2026-07/` | trail shell | — |
| `fixtures/sample-render-request-print-specular.json` | create | skeleton→enforced |
| `scripts/test/render-scene-print-quality.test.js` | create | skeleton→enforced |
| `scripts/test/soft-penumbra-print.test.js` | create | skeleton→enforced |
| `scripts/test/print-specular-ggx.test.js` | create | skeleton→enforced |
| `printer/print_request.py` softPenumbra fields | extend | enforced |
| surface_contract schemaVersion 1.2 | extend | enforced |

## Handoff

Implementor fills profile locks, denoise evidence honesty, convert+render-scene GGX,
softPenumbra radius floors, tests.
