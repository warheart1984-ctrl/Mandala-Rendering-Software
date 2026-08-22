/**
 * Replay chamber silhouette parity check (fox vs humanoid).
 *
 *   node character/tools/amul/replay-parity-check.mjs
 *   node character/tools/amul/replay-parity-check.mjs --density amul
 *
 * Expects same topology_hash / body_payload_hash; only material_key differs.
 * STATUS: topology_hash + payload_hash enforced; isa_bridge_ops partial.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifySilhouetteReplayParity } from "../../../sovereign-x/runtime/amul/amulReplay.js";
import { addSilhouetteLoops, AMUL_BASE_QUADS } from "../../../sovereign-x/runtime/amul/amulDenserTopology.js";
import { buildCharacterAsset } from "../../models/character.mjs";
import { runCharacterSim } from "../../sim/run-sim.mjs";
import { rasterStage } from "../../renders/presets.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const density = argv.includes("--density")
    ? argv[argv.indexOf("--density") + 1] || "amul"
    : "amul";
  const wire = argv.includes("--wire");
  return { density: density === "base" ? "base" : "amul", wire };
}

function main() {
  const { density, wire } = parseArgs(process.argv.slice(2));
  const densify = addSilhouetteLoops({
    quads: AMUL_BASE_QUADS,
    prev_hash: "biosAiLane:19_voss:6_partial_genesis",
    source: "fox_reference",
  });

  const parity = verifySilhouetteReplayParity({
    density,
    densify,
    intentId: "amul-replay-parity-cli",
    voss: { disposition: "BOUND" },
  });

  const outDir = resolve(__dirname, "../../../tmp/amul-densify");
  mkdirSync(outDir, { recursive: true });
  const reportPath = join(outDir, "replay-parity-report.json");
  writeFileSync(reportPath, JSON.stringify(parity, null, 2));

  console.log(JSON.stringify({
    ok: parity.ok,
    density,
    fox_quads: parity.fox.quads,
    humanoid_quads: parity.humanoid.quads,
    topology_hash_equal: parity.checks.topology_hash_equal,
    body_payload_hash_equal: parity.checks.body_payload_hash_equal,
    material_keys: [parity.fox.material_key, parity.humanoid.material_key],
    topology_hash: parity.fox.topology_hash,
    enforcement: parity.enforcement,
    report: reportPath,
  }, null, 2));

  if (wire) {
    const asset = buildCharacterAsset({ id: "amul-replay", species: "anthro", density });
    const sim = runCharacterSim(asset, { frames: 4 });
    const png = rasterStage(asset, sim, "wire", { width: 384, height: 384 });
    const pngPath = join(outDir, "amul_wire_replay.png");
    writeFileSync(pngPath, png);
    console.log(`[wire] ${pngPath} quads=${asset.mesh.faceCount}`);
  }

  if (!parity.ok) process.exitCode = 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
