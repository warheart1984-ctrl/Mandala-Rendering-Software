# Anime Continuity 5-Shot Runner

Script: `run-anime-continuity-5shot.mjs`
Shot plan: `schemas/anime/examples/continuity-5shot.shot-plan.json`
Evidence schema: `schemas/anime/ContinuityShotEvidence.v1.schema.json`
Profile: `anime.mandala-cel.v1`

```bash
cd mrs/packages/engine3d-core && npm run build
node scripts/run-anime-continuity-5shot.mjs --engine3d-continuity \
  --out-dir ../../../tmp/constitutional-anime-continuity-5shot
```

Outputs land under `tmp/` (gitignored). Commit the runner + shot plan + schema.
