# CECP Trail: Prompt → Scene Adapter (2026-07)

| Field | Value |
|-------|-------|
| `trailId` | `prompt-scene-adapter-2026-07` |
| Feature | Prompt → Scene bridge (MRS adapter) + Genblaze HTTP provider |
| Protocol | [`docs/governance/CECP_OMEGA_PROTOCOL.md`](../../../CECP_OMEGA_PROTOCOL.md) |
| Lineage | Architecture → Build → Implementation → Review → Inspection → Acceptance |
| Overall status | **partial** (mapping + Genblaze HTTP **enforced**; Engine3D world expand **skeleton**) |
| Inspector verdict | **PASS_WITH_GAPS** |
| Acceptance | Accepted as governed integration point with listed gaps |

## Stage index

| Stage | Artifact | Summary |
|-------|----------|---------|
| Architect | [01-architect-adr.md](./01-architect-adr.md) | ADR + interface + boundary (out-of-process; Genblaze ban) |
| Builder | [02-builder-scaffold-manifest.md](./02-builder-scaffold-manifest.md) | Adapter + Genblaze scaffold inventory |
| Implementor | [03-implementor-notes.md](./03-implementor-notes.md) | Shipped paths + test inventory |
| Reviewer | [04-reviewer-conformance.md](./04-reviewer-conformance.md) | Boundary OK; Drive-G-1 tags honest |
| Inspector | [05-inspector-acceptance.md](./05-inspector-acceptance.md) | PASS_WITH_GAPS; acceptance with gaps |
| Machine | [lineage.json](./lineage.json) | Lean lineage record |

## Primary evidence roots

- `mrs/adapters/prompt-scene-bridge/` — `CONTRACT.md`, `README.md`, `mrs_map.py`, `run_bridge.py`, `schemas/`, `test_mrs_map.py`
- `mrs/apps/genblaze-media/app/prompt_scene_provider.py`, `config.py`, `main.py`
- `mrs/apps/genblaze-media/tests/test_prompt_to_scene.py`
