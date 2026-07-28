# Trail: printer-gpu-quality-speed-2026-07

**Feature:** Digital Printer quality-then-speed + GPU-assisted path (design)  
**Started:** 2026-07-28  
**Parent:** `digital-printer-v2-2026-07` (PROMOTE / PROMOTE_WITHOUT_GAPS)  
**Related:** `digital-printer-v3-2026-07` (BEGIN — surface families; orthogonal)  
**Branch / PR:** `feat/engine3d-genblaze-cinematic-plugin` / PR #83  
**overallStatus:** **partial** (Tasks 1–6 implemented; live WebGPU execute gap)  
**softwareCreationMode:** Pipeline-Conductor + Boundary-Guardian + Optimizer (lens)  
**actorMode:** Anchor (anti-drift vs GenAI free lunch)  
**Spec:** `docs/superpowers/specs/2026-07-28-digital-printer-gpu-quality-speed-design.md`  
**Plan:** `docs/superpowers/plans/2026-07-28-digital-printer-gpu-quality-speed.md`

## Design approval

| Field | Value |
|-------|-------|
| Spec status | **APPROVED** |
| Approved by | user |
| Approved date | 2026-07-28 |
| Spec path | `docs/superpowers/specs/2026-07-28-digital-printer-gpu-quality-speed-design.md` |
| Execution | Tasks 1→7 of plan (SDD + MRS crew Implementor) |

## Stage checklist

- [x] `01-architect-adr.md`
- [x] `02-builder-scaffold-manifest.md`
- [x] `03-implementor-notes.md`
- [x] `04-reviewer-conformance.md`
- [x] `05-inspector-acceptance.md`
- [x] `06-engineer-standards.md`
- [x] `lineage.json`
- [x] `README.md`

## Tool honesty

| Tool | Status |
|------|--------|
| Superpowers + MRS crew | used |
| AMD Cursor MCP | **missing** |
| NVIDIA Cursor MCP | **missing** |
| NVIDIA skill-finder + catalog | used |
| NVIDIA skills installed 2026-07-28 | `rag-blueprint`, `tilegym-cutile-python`, `dynamo-troubleshoot`, `tao-setup-nvidia-gpu-host`, `tao-run-inference-service` → `~/.agents/skills/` |
| AMD Cursor plugin (`amd-skills`) | present (e.g. `rocm-doctor`, `magpie-kernel-evaluator`) |
| AMD skills.sh installs 2026-07-28 | `rocm-setup`, `hip-rocm` → `~/.agents/skills/` |
| In-repo NVIDIA (Genblaze NIM / NVENC) | reviewed + assist labeling |
| AMD/ROCm/HIP in repo | **absent** (skills ≠ implementation) |

See: `docs/superpowers/specs/2026-07-28-vendor-skills-install-note.md`

## Promotion stance (this trail)

**PROMOTE_WITH_GAPS** — CPU quality-then-speed + parity gates tested; live WebGPU print execute remains **partial**. Do not cite this trail as Digital Printer v2.0 (already PROMOTE / PROMOTE_WITHOUT_GAPS).
