# IDAC Core Freeze — v0.1.0

**Effective:** 2026-07-28  
**Scope:** IDAC **Core** only (Intent → Optimizer → Router → Runtime → Evidence → Validation → Learning skeleton)  
**Status:** **frozen** — change-control in effect; no new core concepts without amendment.

## Frozen version

| Artifact | Path | Version |
|----------|------|---------|
| Stack index | `mrs/apps/infinity-director/docs/IDAC_STACK.md` | v0.1 |
| Constitution | `mrs/apps/infinity-director/docs/IDAC_CONSTITUTION.md` | v0.1 |
| Formal spec | `mrs/apps/infinity-director/docs/IDAC_FORMAL_SPEC.md` | v0.1 |
| Router spec | `mrs/apps/infinity-director/docs/IDAC_ROUTER_SPEC.md` | v0.1 |
| Optimizer interface | `mrs/apps/infinity-director/docs/IDAC_OPTIMIZER_INTERFACE.md` | v0.1 |
| Render runtime | `mrs/apps/infinity-director/docs/IDAC_RENDER_RUNTIME_v0.1.md` | v0.1 |
| Rendering adapter | `mrs/apps/infinity-director/docs/IDAC_RENDERING_ADAPTER_v1.md` | v1.0 (domain adapter; core boundary frozen) |
| Conformance suite spec | `mrs/apps/infinity-director/docs/IDAC_CONFORMANCE_SUITE.md` | v0.1 |
| Evidence hierarchy | `mrs/apps/infinity-director/docs/IDAC_EVIDENCE_HIERARCHY.md` | v0.1 |
| Schemas | `mrs/apps/infinity-director/schemas/idac-*.schema.json` | CIEMS 0.1.0 |
| Reference code | `mrs/apps/infinity-director/app/idac/` | partial reference runtime |

## Not frozen (may evolve without core amendment)

- RenderAccelContract / ATCM / AcceleratedRenderer math program (separate contract trail)
- Genblaze execution backends (full-frame vs per-tile)
- UI copy in `app/static/index.html`
- Performance harness (`tests/test_idac_performance_harness.py`) — tooling only

## Amendment process

1. **Intent:** state gap in **evidence class** terms (not new philosophy).
2. **ADR:** `docs/governance/cecp/trails/idac-stack-2026-07/` or successor trail — Architect stage.
3. **Version bump:** patch (clarification), minor (backward-compatible wire), major (breaking Intent/Plan/Evidence shape).
4. **Schemas:** bump `contract_version` + conformance rows before merge.
5. **No amendment** for: renamed buzzwords, duplicate articles, or features without Verification target.

## What “freeze” means for agents

- **Do not** add new core layers, domains in core spec, or constitutional articles without amendment.
- **Do** implement declared→verified, expand conformance suite, add Performance Evidence via harness.
- Maturity = evidence accumulation under `IDAC_EVIDENCE_HIERARCHY.md`.

## Certification

**First fully conformant reference runtime** is **not** claimed while ESFR remains `PROMOTE_WITH_GAPS` (missing full Conformance suite + Performance Evidence bar).
