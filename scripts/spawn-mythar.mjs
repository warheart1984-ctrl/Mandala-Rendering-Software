#!/usr/bin/env node
/**
 * Golden path alias:
 *   node scripts/spawn-mythar.mjs
 *
 * Same as: node character/holography/creature-demo.mjs
 */

import { runSpawnGoldenPath } from "../character/holography/creature-demo-run.mjs";

const result = runSpawnGoldenPath({ individualId: "mythar-spawn-cli" });
console.log(
  JSON.stringify(
    {
      ok: result.ok,
      out: result.out,
      genus: result.receipt.taxonomy.genus,
      species: result.receipt.taxonomy.species,
      individual: result.receipt.taxonomy.individual.id,
      primitive: result.receipt.primitive,
      muscleClusters: result.receipt.synthesized.muscleClusters,
      bonePaths: result.receipt.synthesized.bonePaths,
    },
    null,
    2,
  ),
);
if (!result.ok) process.exitCode = 1;
