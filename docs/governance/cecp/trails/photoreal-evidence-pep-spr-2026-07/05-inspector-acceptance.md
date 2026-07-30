# 05 — Inspector acceptance

| Criterion | Evidence | Verdict |
|-----------|----------|---------|
| Schemas on disk | `schemas/ciems/*.json` | accept |
| Docs purpose/invariants | `docs/4d-engine/evidence/` | accept |
| Emit from real run | `tmp/blender-10s-test/.../spr.json` etc. when present | accept / partial |
| T-01..T-08 honest | checklist suite | accept (Partial-heavy) |
| Full Photoreal not claimed | CEC flag false | accept |

## Reproduce

```bash
node --test mrs/packages/renderer-core/src/evidence/photoreal/photorealEvidence.test.js
```

Do **not** treat Partial completeness as Full Photoreal or PROMOTE without gaps.
