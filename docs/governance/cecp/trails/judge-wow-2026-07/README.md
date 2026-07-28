# CECP trail: `judge-wow-2026-07`

**Feature:** Judge-wow package — dense star→proton beauty/depth/normal triptych,
Genblaze proton HTTP (default-off), prompt→scene→proton CLI, `shadeRasterFragment`
hook, optional bake plate.

**Protocol:** `docs/governance/CECP_OMEGA_PROTOCOL.md`  
**Overall status:** **enforced** (composition package) with honest **partial**/**declared** gaps  
**Started:** 2026-07-27

## Stage checklist

| Stage | File | Verdict |
|-------|------|---------|
| 01 Architect | `01-architect-adr.md` | ADR complete |
| 02 Builder | `02-builder-scaffold-manifest.md` | scaffolds complete |
| 03 Implementor | `03-implementor-notes.md` | production fill complete |
| 04 Reviewer | `04-reviewer-conformance.md` | **PASS_WITH_NOTES** |
| 05 Inspector | `05-inspector-acceptance.md` | **PASS_WITH_GAPS** |
| 06 Engineer Standards | `06-engineer-standards.md` | **PASS_WITH_NOTES** |

## 90s demo

```bash
node mrs/packages/renderer-core/scripts/judge-wow-proton-triptych.mjs \
  --width 256 \
  --out-dir mrs/packages/renderer-core/output/judge-wow-triptych-256
```

Outputs: `beauty.png`, `depth.png`, `normal.png`, `evidence.json` (`protonCount≈50`, `intentId`).

## Honest gaps (do not elevate)

- TextureSampler in HeadlessStillRenderer — **declared**
- Genblaze live Node-in-Docker — **partial**
- Prompt-string → scene → proton HTTP one-shot — **declared** (CLI `--scene-spec` **enforced**)
- Bake fal polish — **partial** (`polish:skipped` without keys)
