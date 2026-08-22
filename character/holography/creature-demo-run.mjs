/**
 * Shared golden-path runner for creature-demo + scripts/spawn-mythar.
 * Writes contract artifacts under output/character-holography/creature/.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rgbToPng } from "../../mandala/engine/png.mjs";
import {
  spawnMythar,
  CREATURE_CONTRACT,
  SPAWN_STATUS,
  GOVERNED_BIO_UNIVERSE_STATUS,
  anatomyLabelProxyEgt,
  renderSkinRhoHeatmap,
  renderFieldHeatmap,
  runConstitutionalLoop,
  assertBreatheUpdatesRho,
  checkEnvelope,
} from "./index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../../output/character-holography/creature");

/**
 * Run spawn golden path and write artifacts.
 * @returns {{ ok: boolean, out: string, receipt: object, spawned: object }}
 */
export function runSpawnGoldenPath(opts = {}) {
  mkdirSync(OUT, { recursive: true });

  const spawned = spawnMythar({
    individualId: opts.individualId || "mythar-demo-0",
    synthesizeBulk: true,
  });
  const spawned2 = spawnMythar({
    individualId: opts.individualId || "mythar-demo-0",
    synthesizeBulk: true,
  });

  const bulk = spawned.bulk;
  const muscleN = bulk?.muscles?.clusters?.length ?? 0;
  const boneN = bulk?.bones?.paths?.length ?? 0;

  writeFileSync(join(OUT, "bulk-inferred.json"), JSON.stringify(bulk, null, 2));

  // 1. Boundary signature viz (‖E‖ / entanglement profile on lattice)
  const sigViz = renderFieldHeatmap(spawned.egt, "E", { width: 320, height: 480 });
  writeFileSync(
    join(OUT, "boundary-signature.png"),
    rgbToPng(sigViz.width, sigViz.height, sigViz.rgb),
  );
  // alias kept for older docs
  writeFileSync(
    join(OUT, "E-norm-heatmap.png"),
    rgbToPng(sigViz.width, sigViz.height, sigViz.rgb),
  );

  // 2. Anatomy-inferred overlay
  const labelProxy = anatomyLabelProxyEgt(spawned.egt, bulk);
  const labelHeat = renderSkinRhoHeatmap(labelProxy, { width: 320, height: 480 });
  writeFileSync(
    join(OUT, "anatomy-inferred.png"),
    rgbToPng(labelHeat.width, labelHeat.height, labelHeat.rgb),
  );
  writeFileSync(
    join(OUT, "anatomy-labels.png"),
    rgbToPng(labelHeat.width, labelHeat.height, labelHeat.rgb),
  );

  // 3. Constitutional motion: breathe + reach
  const breath = runConstitutionalLoop(spawned.egt, "breathe", 6, {
    flow: {
      ...spawned.signature.behavioralFlows.breathe,
      centralOnly: true,
    },
    amp: spawned.taxonomy.individual.params.breathAmp,
  });
  const breathProof = assertBreatheUpdatesRho(breath);
  const reach = runConstitutionalLoop(spawned.egt, "reach", 4, {
    flow: {
      ...spawned.signature.behavioralFlows.reach,
      requireArm: true,
    },
    amp: spawned.taxonomy.individual.params.reachAmp,
  });

  const inhale =
    breath.frames[Math.floor(breath.frames.length / 4)] || breath.frames[1];
  const breathHeat = renderSkinRhoHeatmap(inhale, { width: 320, height: 480 });
  writeFileSync(
    join(OUT, "after-breathe.png"),
    rgbToPng(breathHeat.width, breathHeat.height, breathHeat.rgb),
  );
  writeFileSync(
    join(OUT, "breathe-inhale.png"),
    rgbToPng(breathHeat.width, breathHeat.height, breathHeat.rgb),
  );

  const reachLast = reach.frames[reach.frames.length - 1];
  const reachHeat = renderSkinRhoHeatmap(reachLast, { width: 320, height: 480 });
  writeFileSync(
    join(OUT, "after-reach.png"),
    rgbToPng(reachHeat.width, reachHeat.height, reachHeat.rgb),
  );

  const env = checkEnvelope(spawned.egt);
  const frameGov =
    breath.traces[breath.traces.length - 1]?.stages?.frameGovernance ||
    spawned.governance.frameGovernance.means;

  const receipt = {
    kind: "creature-spawn-receipt",
    status: SPAWN_STATUS,
    claim: CREATURE_CONTRACT.claim,
    contract: CREATURE_CONTRACT,
    meshLoad: false,
    meshNote: spawned.meshNote,
    taxonomy: {
      genus: spawned.taxonomy.genus,
      species: spawned.taxonomy.species,
      individual: spawned.taxonomy.individual,
      status: spawned.taxonomy.status,
      fullSpeciesSystem: spawned.taxonomy.fullSpeciesSystem,
    },
    primitive: "breathe",
    primitivesRun: ["breathe", "reach"],
    signature: {
      templateId: spawned.signature.templateId,
      entanglementProfile: spawned.signature.entanglementProfile,
      curvatureMap: spawned.signature.curvatureMap,
      tensionFields: spawned.signature.tensionFields,
      governanceBias: {
        intent: spawned.signature.governanceBias.intent,
        evidence: spawned.signature.governanceBias.evidence,
        conformance: spawned.signature.governanceBias.conformance,
        stewardship: spawned.signature.governanceBias.stewardship,
      },
    },
    governanceAggregates: {
      I: frameGov.intent ?? spawned.governance.frameGovernance.I,
      E: frameGov.evidence ?? spawned.governance.frameGovernance.E,
      C: frameGov.conformance ?? spawned.governance.frameGovernance.C,
      S: frameGov.stewardship ?? spawned.governance.frameGovernance.S,
      means: frameGov.count != null ? frameGov : spawned.governance.frameGovernance.means,
    },
    ciemsTraceSample: breath.traces[0],
    synthesized: {
      muscleClusters: muscleN,
      bonePaths: boneN,
      joints: bulk?.bones?.joints?.length ?? 0,
      softZones: bulk?.soft?.zoneCount ?? 0,
      muscleSample: bulk?.muscles?.clusters?.[0] || null,
      boneSample: bulk?.bones?.paths?.[0] || null,
    },
    motion: {
      breathe: breathProof,
      reachFrames: reach.frames.length,
    },
    envelope: env,
    fingerprint: spawned.fingerprint,
    deterministic: spawned.fingerprint === spawned2.fingerprint,
    tags: {
      spawn: SPAWN_STATUS,
      livingConstitutionalEcosystem: GOVERNED_BIO_UNIVERSE_STATUS,
      holographicBiology: GOVERNED_BIO_UNIVERSE_STATUS,
      governedBiologicalUniverse: GOVERNED_BIO_UNIVERSE_STATUS,
    },
    artifacts: [
      "boundary-signature.png",
      "anatomy-inferred.png",
      "after-breathe.png",
      "after-reach.png",
      "bulk-inferred.json",
      "receipt.json",
    ],
    docs: [
      "docs/mandala/HOLOGRAPHIC_CREATURES.md",
      "docs/mandala/CHARACTER_HOLOGRAPHY.md",
      "docs/mandala/HOLOGRAPHIC_CIEMS.md",
    ],
  };

  writeFileSync(join(OUT, "receipt.json"), JSON.stringify(receipt, null, 2));
  writeFileSync(
    join(OUT, "contract.json"),
    JSON.stringify(CREATURE_CONTRACT, null, 2),
  );

  const ok =
    muscleN >= 1 &&
    boneN >= 1 &&
    breathProof.ok &&
    receipt.deterministic === true &&
    receipt.meshLoad === false;

  return { ok, out: OUT, receipt, spawned };
}

/** Alias used by scripts/spawn-mythar.mjs */
export function spawn(opts) {
  return runSpawnGoldenPath(opts);
}
