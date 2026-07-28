# CECP Trail — vendor-gpu-integration-2026-07

| Field | Value |
|-------|-------|
| `trailId` | `vendor-gpu-integration-2026-07` |
| `namespace` | `cecp.trail.vendor-gpu-integration-2026-07` |
| `author` | Jon Halstead |
| `domain` | Sovereign X Router |
| `overallStatus` | **partial** / ESFR **PROMOTE_WITH_GAPS** |
| `pr` | #83 |

## Stage checklist

- [x] `01-architect-adr.md`
- [x] `02-builder-scaffold-manifest.md`
- [x] `03-implementor-notes.md`
- [x] `04-reviewer-conformance.md`
- [x] `05-inspector-acceptance.md`
- [x] `06-engineer-standards.md`
- [x] `08-esfr-verdict.json`
- [x] `09-promotion-packet.md`
- [x] `ciems-v2-gpu-integration-diagram.md`
- [x] `ciems-lineage-tree-vendor-gpu.md`
- [x] Specs mirrored under `docs/sx-router/specs/` and trail copies
- [x] `crew-manifest.md`
- [x] `promotion-tracker.md`
- [x] `readiness-report.md` (operator 42%; metrics implementation **pending**)

## Follow-on trails

- Roadmap Phases 1–4: `../sx-router-vNext-2026-08/`
- Roadmap Phases 5–8 (2027): `../sx-router-vNext-2027/`
- Determinism plan (Draft): `../gpu-determinism-2026-09/`
- GPU Determinism Phase I: `../gpu-determinism-phase1-2026-08/`
- Phase I announcement draft: `../pr84-announcement.md`
- Lineage tree: `./ciems-lineage-tree-vendor-gpu.md`

## Specs (A–E + Phase I)

Also under `docs/sx-router/specs/` (SoT for drop-in paths):

- `gpu-capability-map.md`
- `gpu-assist-module.md`
- `gpu-dispatch-contract.md`
- `gpu-integration-charter.md`
- `gpu-lookdev-engine.md`
- `router-capability-dashboard.md`
- `multi-vendor-rhi-determinism.md`
- `capability-inspector-ui.md`
- `deterministic-rhi-shader-pipeline.md`

Canonical code layout: `sovereign-x/` (see `sovereign-x/README.md`).  
Namespaces: `sovereign-x/docs/governance/cecp/specs/namespaces.md`

## Skills reload note

After creating/updating `~/.agents/skills/nvidia-gpu-assist` or `amd-gpu-assist`, reload agent skills in the host so the registry paths resolve.
