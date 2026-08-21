#!/usr/bin/env node
/**
 * End-to-end Mandala Engine demo (organs wired, honest tags).
 *
 *   node mandala/engine/run-e2e.mjs
 *   node mandala/engine/run-e2e.mjs --pro-uncensored-painter
 *     Local: also set AI_PAINTER_UNCENSORED=1 (single opt-in; no pro key).
 *     Billing stub: MANDALA_BILLING_ENFORCE=1 requires dual pro+uncensored.
 *   Prefer open golden: node scripts/golden-painter.mjs
 *
 * Output: output/mandala-engine-e2e/  (does not touch salt-atlas or character exports)
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { proposeIllegalMassInjection } from "../proto/simulation-chamber.mjs";
import { sliceHashFromCache } from "../proto/certified-state.mjs";
import {
  createUniverse,
  stepPhysics,
  project,
  observe,
  paint,
  speak,
  authorObserverPath,
  createImage,
  ORGAN_ABI_V1,
} from "./sdk/index.mjs";
import { rgbToPng } from "./png.mjs";
import { writeMytharFiles } from "./mythar/index.mjs";
import { commitEngineProposal, loadSchemas, validate } from "./aais/index.mjs";
import { createComputeQueue } from "./gpu/async-queue.mjs";
import { defaultFlythroughPath } from "../proto/movie-lane.mjs";
import { runEditor } from "./editor/cli.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");
const FFMPEG = join(REPO_ROOT, "runtime/toolchain/ffmpeg/usr/bin/ffmpeg");
const DEFAULT_OUT = join(REPO_ROOT, "output/mandala-engine-e2e");

export async function runE2E({
  seed = 7,
  tEnd = 8,
  outDir = DEFAULT_OUT,
  trySd = true,
  tryTts = true,
  tryGpu = false,
  width = 64,
  height = 64,
  requestUncensored = false,
  cliProUncensored = false,
  localOpen = false,
  theme = "",
} = {}) {
  mkdirSync(outDir, { recursive: true });
  const universe = createUniverse({ seed });
  const hash0 = universe.state.hash;
  const constitutionId = universe.constitution.id;

  const stepReceipts = [];
  while (universe.state.t < tEnd) {
    const r = stepPhysics(universe);
    stepReceipts.push({ committed: r.committed, t: universe.state.t, hash: r.hash });
    if (!r.committed) break;
  }

  const hashBeforeIllegal = universe.state.hash;
  const illegal = proposeIllegalMassInjection(universe.state, universe.constitution);
  illegal.kind = "physics";
  illegal.abiId = ORGAN_ABI_V1.abiId;
  const illegalResult = commitEngineProposal(universe.state, illegal, universe.constitution);
  const hashAfterIllegal = universe.state.hash;

  authorObserverPath(universe, defaultFlythroughPath(universe.state.temporal.filled, universe.state.shape));
  const tView = Math.max(0, universe.state.temporal.filled - 1);
  const view = observe(universe, tView);

  const hashBeforeProject = universe.state.hash;
  const image = createImage(width, height);
  const proj = project(universe, image, { accumulate: true });
  const hashAfterProject = universe.state.hash;

  const painted = await paint(universe, image, {
    trySd,
    requestUncensored,
    cliProUncensored,
    localOpen,
    theme,
  });
  const spoken = speak(universe, {
    caption: `Mandala Engine e2e. Constitution ${constitutionId}. t=${universe.state.t}.`,
    tryTts,
  });

  const png = rgbToPng(image.width, image.height, image.rgb);
  const pngPath = join(outDir, "frame.png");
  writeFileSync(pngPath, png);
  let sdPngPath = null;
  if (painted.sd?.pngBytes?.length) {
    const sdName = image.painter?.uncensored ? "sd-pro-uncensored.png" : "sd-turbo.png";
    sdPngPath = join(outDir, sdName);
    writeFileSync(sdPngPath, painted.sd.pngBytes);
  }
  const mytharPaths = writeMytharFiles(outDir, spoken);

  const queue = createComputeQueue();
  queue.enqueue("grad-phi", { scalar: universe.state.scalar, shape: universe.state.shape });
  const gpuFlush = queue.flush({ outDir, tryGpu });

  let mp4Path = join(outDir, "e2e.mp4");
  let mp4 = { status: "skipped", reason: "ffmpeg missing" };
  if (existsSync(FFMPEG)) {
    try {
      execFileSync(
        FFMPEG,
        [
          "-y",
          "-loop",
          "1",
          "-i",
          pngPath,
          "-i",
          mytharPaths.wavPath,
          "-c:v",
          "libx264",
          "-t",
          "1",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-shortest",
          mp4Path,
        ],
        { stdio: "pipe", timeout: 20000 },
      );
      mp4 = { status: "working", path: mp4Path };
    } catch (err) {
      mp4 = { status: "blocked-with-evidence", reason: err?.message?.slice(0, 240) };
      mp4Path = null;
    }
  } else {
    mp4Path = null;
  }

  const slices = [];
  for (let t = 0; t < universe.state.temporal.filled; t++) {
    slices.push({ t, hash: sliceHashFromCache(universe.state, t) });
  }

  const organs = {
    StoryForge: "partial",
    SimulationChamber: "partial",
    Mandala: "partial",
    AIPainter: painted.sd?.passed ? "partial" : painted.sd?.status === "blocked-with-evidence" ? "blocked-with-evidence" : "partial",
    Mythar: spoken.mp3 ? "partial" : "partial",
    AAIS: "working",
    MovieLane: "partial",
  };

  const artifacts = [
    { kind: "png", path: pngPath, organ: "Mandala" },
    { kind: "wav", path: mytharPaths.wavPath, organ: "Mythar" },
  ];
  if (mytharPaths.mp3Path) artifacts.push({ kind: "mp3", path: mytharPaths.mp3Path, organ: "Mythar" });
  if (sdPngPath) artifacts.push({ kind: "png", path: sdPngPath, organ: "AIPainter" });
  if (mp4Path && mp4.status === "working") artifacts.push({ kind: "mp4", path: mp4Path, organ: "MovieLane" });

  const receipt = {
    type: "mandala-engine-receipt",
    abiId: ORGAN_ABI_V1.abiId,
    abiVersion: ORGAN_ABI_V1.version,
    status: "partial",
    stateHash: universe.state.hash,
    constitutionId,
    seed,
    t: universe.state.t,
    hash0,
    organs,
    artifacts,
    slices,
    illegalProposalRejected: illegalResult.committed === false,
    illegalReasons: illegalResult.decision?.reasons || [],
    hashUnchangedOnIllegal: hashAfterIllegal === hashBeforeIllegal,
    movieLaneOwnsTime: false,
    rendererMutatedCertified: false,
    project: {
      snapshotHash: proj.snapshotHash,
      liveHash: proj.liveHash,
      renderDidNotMutate: hashBeforeProject === hashAfterProject,
    },
    painter: {
      ...image.painter,
      tier: image.painter?.tier ?? "free",
      uncensored: Boolean(image.painter?.uncensored),
      backend: image.painter?.backend ?? "cpu-field-tint",
    },
    mythar: {
      status: spoken.status,
      tts: spoken.tts,
      latticeFreq: spoken.lattice.freq,
    },
    physics: {
      operator: "lattice-hamiltonian",
      H_gov: universe.governance?.H ?? null,
    },
    gpu: gpuFlush,
    observer: view,
    steps: stepReceipts,
    intent: universe.intent,
  };

  const schemas = loadSchemas();
  const schemaErrors = validate(schemas.receipt, receipt);
  receipt.schemaErrors = schemaErrors;

  const receiptPath = join(outDir, "receipt.json");
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  artifacts.push({ kind: "receipt", path: receiptPath, organ: "AAIS" });

  const htmlSrc = join(__dirname, "editor/index.html");
  const htmlDst = join(outDir, "editor.html");
  copyFileSync(htmlSrc, htmlDst);

  const editorList = runEditor({ command: "list", seed, steps: Math.min(2, tEnd) });

  return {
    outDir,
    pngPath,
    wavPath: mytharPaths.wavPath,
    mp3Path: mytharPaths.mp3Path,
    mp4Path,
    receiptPath,
    htmlPath: htmlDst,
    receipt,
    schemaErrors,
    illegalRejected: illegalResult.committed === false,
    renderDidNotMutate: hashBeforeProject === hashAfterProject,
    editorList,
  };
}

function parseE2EArgs(argv = process.argv.slice(2)) {
  const cliProUncensored = argv.includes("--pro-uncensored-painter");
  const themeIdx = argv.indexOf("--theme");
  const theme = themeIdx >= 0 && argv[themeIdx + 1] ? argv[themeIdx + 1] : "";
  return {
    cliProUncensored,
    requestUncensored: cliProUncensored,
    theme,
  };
}

const isMain = process.argv[1] && String(process.argv[1]).replace(/\\/g, "/").endsWith("run-e2e.mjs");
if (isMain) {
  const args = parseE2EArgs();
  runE2E(args).then((r) => {
    console.log("Mandala Engine e2e");
    console.log(`  out: ${r.outDir}`);
    console.log(`  png: ${r.pngPath}`);
    console.log(`  wav: ${r.wavPath}`);
    console.log(`  mp4: ${r.mp4Path || "(png+wav only)"}`);
    console.log(`  receipt: ${r.receiptPath}`);
    console.log(`  illegal rejected: ${r.illegalRejected}`);
    console.log(`  render did not mutate: ${r.renderDidNotMutate}`);
    console.log(
      `  painter.tier=${r.receipt.painter?.tier} uncensored=${r.receipt.painter?.uncensored} backend=${r.receipt.painter?.backend} model=${r.receipt.painter?.model || r.receipt.painter?.sd?.model || "n/a"}`,
    );
    console.log(`  painter sd: ${r.receipt.painter?.sd?.status} via=${r.receipt.painter?.sd?.via || "n/a"} http=${r.receipt.painter?.sd?.http ?? "n/a"} ms=${r.receipt.painter?.sd?.ms ?? "n/a"}`);
    if (r.receipt.painter?.uncensoredDenied) {
      console.log(`  painter uncensored denied: ${r.receipt.painter.uncensoredDenialReason}`);
    }
    if (r.receipt.painter?.sd?.reason) console.log(`  painter sd reason: ${r.receipt.painter.sd.reason}`);
    if (r.receipt.painter?.sd?.note) console.log(`  painter sd note: ${r.receipt.painter.sd.note}`);
    console.log(`  mythar tts: ${r.receipt.mythar?.tts?.status}`);
    console.log(`  receipt schema errors: ${r.schemaErrors.length}`);
  });
}
