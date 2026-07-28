# 03 — Implementor notes

**Trail:** `digital-printer-v2-2026-07`  
**Role:** Implementor  
**Status:** §E + residual A/C/D gaps closed for v2.0 PROMOTE

## v2.0 gap-closure addendum

1. **Mesh SHA sync** — `printer/mesh_sync.py`; fail-loud on print if Unity/Unreal hosts diverge; `sync-surface-meshes.mjs --verify`
2. **CSR / GovernanceDecision / ProvenanceFrame** — emitted by `evidence.py` on every print (`csr.json`, `governance-decision.json`, `provenance-frames.json`)
3. **Denoise all backends** — `apply-bilateral-png.mjs` post-plate when denoise=true and scene-spec CLI did not already denoise
4. **Surface contract** bumped to **version 2.0**

## Tests (gap-closure pass)

See `05-inspector-acceptance.md` full table (printer 24, governance 102, conformance 16/16, etc.).
