#!/usr/bin/env node
/**
 * Golden path: spawn Mythar from Creature Boundary Signature (no GLB).
 *
 *   node character/holography/creature-demo.mjs
 *   node scripts/spawn-mythar.mjs
 *
 * → output/character-holography/creature/
 * Status: **partial** — synthetic informational creature layer.
 * NOT living constitutional ecosystem / holographic biology as enforced.
 */

import { runSpawnGoldenPath } from "./creature-demo-run.mjs";

const result = runSpawnGoldenPath();
console.log(
  JSON.stringify(
    {
      ok: result.ok,
      out: result.out,
      meshLoad: result.receipt.meshLoad,
      deterministic: result.receipt.deterministic,
      taxonomy: {
        genus: result.receipt.taxonomy.genus,
        species: result.receipt.taxonomy.species,
        individual: result.receipt.taxonomy.individual.id,
      },
      primitive: result.receipt.primitive,
      primitivesRun: result.receipt.primitivesRun,
      gov: result.receipt.governanceAggregates,
      muscleClusters: result.receipt.synthesized.muscleClusters,
      bonePaths: result.receipt.synthesized.bonePaths,
      breathe: result.receipt.motion.breathe,
      artifacts: result.receipt.artifacts,
    },
    null,
    2,
  ),
);
if (!result.ok) process.exitCode = 1;
