# CECP trail: `proton-hq-2026-07`

**Feature:** Proton HQ judge quality — `qualityPreset` (default|high), CPU
tonemap / supersample, enrich antifog knobs, optional bloom **declared** stub,
`judge-wow-hq` CLI.

**Protocol:** `docs/governance/CECP_OMEGA_PROTOCOL.md`  
**Overall status:** **partial** (ESFR `PASS_WITH_GAPS` / `PROMOTE_WITH_GAPS`; visual density + bloom gaps remain)  
**Started:** 2026-07-27

## Stage checklist

| Stage | File | Verdict |
|-------|------|---------|
| 01 Architect | `01-architect-adr.md` | complete |
| 02 Builder | `02-builder-scaffold-manifest.md` | scaffolds complete |
| 03 Implementor | `03-implementor-notes.md` | complete — HQ beauty shipped |
| 04 Reviewer | `04-reviewer-conformance.md` | PASS_WITH_NOTES |
| 05 Inspector | `05-inspector-acceptance.md` | PASS_WITH_GAPS |
| 06 Engineer Standards | `06-engineer-standards.md` | PASS_WITH_GAPS · PROMOTE_WITH_GAPS |

## Demo

```bash
node mrs/packages/renderer-core/scripts/judge-wow-hq.mjs \
  --quality high \
  --out-dir mrs/packages/renderer-core/output/judge-wow-hq
```

Beauty (local artifact): `mrs/packages/renderer-core/output/judge-wow-hq/beauty.png`
(+ `depth.png`, `normal.png`, `evidence.json`).

Absolute: `G:\Mandala Rendering Software\mrs\packages\renderer-core\output\judge-wow-hq\beauty.png`

## Honest gaps

- Visual density vs Architect “dramatically better” — soft/sparse (~50 protons; armCount 16)
- Bloom / depth-cue — **declared** (CLI refuses)
- CI does not yet list proton HQ suite in `mrs-rt4d-ci.yml`
- `create4dStarWorld` armCount hard-cap 16 — denser look via enrich, not more arms
- GPU / path-trace — **out of scope** (CPU only)
