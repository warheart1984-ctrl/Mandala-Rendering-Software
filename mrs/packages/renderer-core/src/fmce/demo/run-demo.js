/**
 * SME e2e demo CLI — prints the governed GEN -> VIS -> TXT -> AUD pipeline.
 * Run with: node mrs/packages/renderer-core/src/fmce/demo/run-demo.js
 */

import { runPipeline } from "./orchestrator.js";

function main() {
  const result = runPipeline({ seed: 20260816, prompt: "Render a governed mandala with cyan petals and a spoken caption." });

  console.log("=== SME e2e pipeline (GEN -> VIS -> TXT -> AUD) under FMCE governance ===");
  console.log(`intentId:   ${result.trace.intentId}`);
  console.log(`traceId:    ${result.trace.traceId}`);
  console.log(`signature:  ${result.pipelineSignature}`);

  console.log("\n--- governed stages ---");
  for (const s of result.stages) {
    console.log(
      `  [${s.stage.padEnd(14)}] ${s.modality.padEnd(5)} decision=${s.decision} ` +
        `determinism=${s.v12Result.finalDeterminismClass} status=${s.v12Result.finalStatus} ` +
        `evidence=${s.evidence.evidenceId}`
    );
  }

  console.log("\n--- artifacts ---");
  for (const a of result.artifacts) {
    console.log(`  ${a.modality.padEnd(5)} ${a.evidenceId.padEnd(26)} checksum=${a.checksum.slice(0, 22)}...`);
  }

  console.log("\n--- fusion ---");
  console.log(`  method=${result.fusion.method} dims=${JSON.stringify(result.fusion.sourceDims)} -> ${result.fusion.fusedDim}`);

  console.log("\n--- replay verification ---");
  console.log(`  verified=${result.replayResult.verified} evidence=${result.replayResult.replayEvidenceId}`);

  console.log("\n--- constitutional trace (Appendix C shape) ---");
  console.log(JSON.stringify(result.trace, null, 2));
}

main();
