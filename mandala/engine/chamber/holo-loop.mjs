/**
 * Holographic Simulation Chamber loop (partial).
 *
 * BulkSpacetimeEngine.t → t+1
 *   → character EGT (ρ, K, w_ij) coupled to certified defect
 *   → BoundaryDrivenAnatomySynthesis
 *   → [optional sparse cull] → CharacterHolographicRig
 *   → HolographicEncoder P / h_ij + boundary appearance
 *   → EntanglementRenderer COMPOSITE buffers
 *   → Movie Lane records projected boundary (does not own time)
 *
 * Default record codec: raw-float32 `.bin` (no PNG encode).
 * Optional `--record-png` keeps CPU COMPOSITE PNG path for regression.
 * Capsules / RT4D humanoid-avatar are skipped on this path.
 * Appearance is boundary information density — not photoreal mesh.
 *
 * Timing (performance.now):
 *   streaming_io_ms  = writeBinFrame only
 *   end_to_end_ms    = bulk+rig+induced+build+write (full frame)
 *   shader_fps       = declared until watch.html overlay measures on device
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { rgbToPng } from "../png.mjs";
import {
  BulkSpacetimeEngine,
  HolographicEncoder,
  EntanglementRenderer,
  EFR_MODES,
  COMPOSITE_STATUS,
  HOLOGRAPHIC_ENCODER_STATUS,
  BULK_ENGINE_STATUS,
  HOLOGRAPHIC_SHADER_STATUS,
  HOLOGRAPHIC_BUFFER_STATUS,
  HOLOGRAPHIC_STREAMING_STATUS,
  HOLOGRAPHIC_GPU_RASTER_STATUS,
  HOLOGRAPHIC_SHADER_SOT,
  createHolographicMaterial,
  inducedMetricHij,
  g_munu,
} from "../../holography/index.mjs";
import {
  observerAt,
  setObserverPath,
  defaultFlythroughPath,
  MOVIE_LANE_STATUS,
} from "../../proto/movie-lane.mjs";
import { PROTO_SHAPE } from "../../proto/constitution.mjs";
import {
  spawnMythar,
  spawn,
  synthesizeAnatomyFromBoundary,
  constitutionalFrameStep,
  CharacterHolographicRig,
  applyBoundaryAppearance,
  projectRigNodesH,
  ANATOMY_SYNTHESIS_STATUS,
  HOLO_RIG_STATUS,
  BOUNDARY_APPEARANCE_STATUS,
  REALISTIC_DEFAULT_STATUS,
  SPAWN_STATUS,
} from "../../../character/holography/index.mjs";
import {
  BIN_FRAME_CODEC,
  BIN_FRAME_STATUS,
  BIN_SPARSE_STATUS,
  BIN_VACUUM_RHO_DEFAULT,
  BIN_FRAME_ATTRIBUTES,
  writeBinFrame,
  buildBinMeta,
} from "./bin-frame.mjs";
import {
  RHO_SPARSE,
  K_SPARSE,
  W_JOINT_KEEP,
  SPARSE_CULL_STATUS,
  selectSparseKeepMask,
  compactEgtByMask,
  remapAnatomyForSparse,
} from "./sparse-cull.mjs";
import {
  VISION_INTEGRATION_STATUS,
  VISION_INTEGRATION_CLAIM,
  VISION_CONFIG,
  createVisionBridge,
  inspectFrame,
  analyzeVisionForAnomalies,
  writeVisionResult,
  buildVisionReceipt,
} from "./vision-integration.mjs";
import {
  CPO_SERIALIZER_STATUS,
  CPO_SERIALIZER_CLAIM,
  serializeHoloBuffersToCPO,
  buildCPOPyramid,
  extractCPOCrop,
  serializeBinFrameToCPF4D,
  writeCPO,
  writeSPO,
  writeCPF4D,
} from "./cpo-serializer.js";

import {
  buildFaceRigEnvelopes,
  FACE_RIG_CONTROL_STATUS,
  ARKIT_BLENDSHAPE_NAMES,
  CONTROL_BAR_BLENDSHAPES,
  deformLandmarksFromRig,
  projectLandmarksFromRig,
  packFaceRigFloats,
  buildFaceRigSnapshot,
  renderRigWithNumbers,
} from "../holort4d/face-rig-control.js";
import {
  SPO_BUILDER_STATUS,
  SPO_BUILDER_CLAIM,
  attachSPOToCPO,
  validateSPO,
} from "./spo-builder.js";
import {
  CIEMS_VALIDATOR_STATUS,
  CIEMS_VALIDATOR_CLAIM,
  CIEMSGovernanceValidator,
} from "./ciems-validator.mjs";
import {
  ROSETTA_STATUS,
  ROSETTA_HOLO_GPU_STATUS,
  ROSETTA_CLAIM,
  mapHoloFrameToSharedState,
} from "./rosetta.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "../../..");
const FFMPEG = join(REPO, "runtime/toolchain/ffmpeg/usr/bin/ffmpeg");
const SHADER_SOT_DIR = join(REPO, "mandala/holography/shaders");
const WATCH_TEMPLATE = join(__dirname, "watch-holo.html");

export const HOLO_CHAMBER_STATUS = "partial";
export const HOLO_CHAMBER_CLAIM =
  "Holographic chamber path — COMPOSITE boundary / raw-float32 bin record; not Unreal/PBR; capsules skipped";

/** Per-run timing buckets (ms). Filled by runHoloChamber. */
export const TIMING = {
  frame: [],
  bulk_ms: [],
  sparse_ms: [],
  rig_ms: [],
  induced_ms: [],
  build_ms: [],
  write_ms: [],
  vision_ms: [],
  cpo_ms: [],
  total_ms: [],
  count: [],
  nodeCountFull: [],
  nodeCountSparse: [],
};

function resetTiming() {
  for (const k of Object.keys(TIMING)) TIMING[k].length = 0;
}

function avg(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

/**
 * Aggregate timing report for receipt / console.table.
 * Honest Zenodo-style fields: streaming_io_ms, end_to_end_ms, shader_fps declared.
 */
export function getTimingReport() {
  return {
    frames: TIMING.frame.length,
    avg_bulk_ms: +avg(TIMING.bulk_ms).toFixed(3),
    avg_sparse_ms: +avg(TIMING.sparse_ms).toFixed(3),
    avg_rig_ms: +avg(TIMING.rig_ms).toFixed(3),
    avg_induced_ms: +avg(TIMING.induced_ms).toFixed(3),
    avg_build_ms: +avg(TIMING.build_ms).toFixed(3),
    avg_write_ms: +avg(TIMING.write_ms).toFixed(3),
    avg_vision_ms: +avg(TIMING.vision_ms).toFixed(3),
    avg_cpo_ms: +avg(TIMING.cpo_ms).toFixed(3),
    avg_total_ms: +avg(TIMING.total_ms).toFixed(3),
    avg_count: +avg(TIMING.count).toFixed(1),
    avg_nodeCountFull: +avg(TIMING.nodeCountFull).toFixed(1),
    avg_nodeCountSparse: +avg(TIMING.nodeCountSparse).toFixed(1),
    /** writeBinFrame only — not e2e gen. */
    streaming_io_ms: +avg(TIMING.write_ms).toFixed(3),
    /** Full frame: bulk+sparse+rig+induced+build+write+vision+cpo. */
    end_to_end_ms: +avg(TIMING.total_ms).toFixed(3),
    /** Declared until watch.html overlay measures on device. */
    shader_fps: "declared",
    note:
      "induced_ms = inducedMetricHij + applyBoundaryAppearance + projectRigNodesH (not O(1) metric alone). Measure — do not invent.",
  };
}

function resolveRecordMode(record) {
  const r = String(record || "composite").toLowerCase();
  if (r === "heatmap") return EFR_MODES.HEATMAP;
  if (r === "causal") return EFR_MODES.CAUSAL;
  if (r === "combined") return EFR_MODES.COMBINED;
  return EFR_MODES.COMPOSITE;
}

function resolveCreatureId(creature) {
  const c = String(creature || "Mythar").toLowerCase();
  if (c === "mythar" || c === "mythar-humanoid") return "mythar-humanoid";
  return c;
}

function coupleBulkToCharacter(egt, bulk, dtPhase) {
  const defect = bulk.state.defect || { x: 16, y: 16, z: 16 };
  const nx = bulk.state.shape?.nx || PROTO_SHAPE.nx;
  const phaseBoost = (defect.x / Math.max(1, nx)) * 0.15;
  for (let i = 0; i < egt.rho.length; i++) {
    egt.rho[i] = Math.max(0, Math.min(1, egt.rho[i] + phaseBoost * 0.02 * Math.sin(dtPhase + i * 0.01)));
  }
  return { defect, phaseBoost };
}

function installWatchArtifacts(outDir) {
  const shaderOut = join(outDir, "shaders");
  mkdirSync(shaderOut, { recursive: true });
  for (const name of ["holographic.vert", "holographic.frag"]) {
    const src = join(SHADER_SOT_DIR, name);
    if (existsSync(src)) copyFileSync(src, join(shaderOut, name));
  }
  if (existsSync(WATCH_TEMPLATE)) {
    copyFileSync(WATCH_TEMPLATE, join(outDir, "watch.html"));
  }
}

/**
 * Run holographic chamber and write Movie Lane boundary records.
 *
 * @param {object} opts
 * @param {boolean} [opts.recordPng=false] keep old PNG path
 * @param {boolean} [opts.mp4=false] ffmpeg H.264 (PNG path only unless forced)
 * @param {boolean} [opts.sparse=true] cull vacuum before induced/build (and compact .bin)
 * @returns {{ ok: boolean, outDir: string, receipt: object, frameCount: number, timing: object }}
 */
export async function runHoloChamber({
  sceneCard = null,
  outDir = join(REPO, "output/simulation/holo-mythar-001"),
  creature = "Mythar",
  record = "composite",
  durationSec = 10,
  fps = 12,
  seed = 21,
  width = 384,
  height = 512,
  recordPng = false,
  mp4 = false,
  sparse = true,
  vacuumRho = BIN_VACUUM_RHO_DEFAULT,
  vision = true, // NEW: enable vision inspection
  visionInterval = 4, // NEW: inspect every N frames
  visionDetail = "medium", // NEW: detail level
} = {}) {
  resetTiming();
  mkdirSync(outDir, { recursive: true });
  const framesDir = join(outDir, "frames");
  mkdirSync(framesDir, { recursive: true });

  // --- Vision Bridge setup ---
  let visionBridge = null;
  const visionResults = [];
  if (vision && VISION_CONFIG.enabled) {
    visionBridge = createVisionBridge({ provider: "stub", providerOptions: { scenario: VISION_CONFIG.stubScenario } });
    console.log(`[VISION] Bridge initialized (stub provider, scenario: ${VISION_CONFIG.stubScenario})`);
  }

  const mode = resolveRecordMode(record);
  const templateId = resolveCreatureId(creature);
  const frameCount = Math.max(2, Math.round(Number(durationSec) * Number(fps)) || 24);
  const codec = recordPng ? "png" : BIN_FRAME_CODEC;

  const bulk = new BulkSpacetimeEngine({ seed });
  const encoder = new HolographicEncoder({ stride: 4 });
  const renderer = new EntanglementRenderer({
    width,
    height,
    mode,
  });
  renderer.material = createHolographicMaterial(renderer.THREE);
  renderer.uniforms = renderer.material.uniforms;
  const spawned =
    templateId === "mythar-humanoid"
      ? spawnMythar({ individualId: "chamber-mythar-0", synthesizeBulk: true })
      : spawn(templateId, { individualId: `chamber-${templateId}-0`, synthesizeBulk: true });

  let egt = spawned.egt;
  const holoRig = new CharacterHolographicRig({
    creature: spawned.taxonomy?.species || creature,
    governance: spawned.signature?.governanceBias || 0.868,
  });

  let anatomy = spawned.bulk || synthesizeAnatomyFromBoundary(egt);
  holoRig.update(egt, anatomy, {
    intent: spawned.signature?.governanceBias?.intent,
    evidence: spawned.signature?.governanceBias?.evidence,
    conformance: spawned.signature?.governanceBias?.conformance ?? 0.868,
    stewardship: spawned.signature?.governanceBias?.stewardship ?? 1,
  });

  // Capture face rig state per actor for Turbo GGUF control images
  const faceRigState = holoRig.getFaceRigState();
  // Capture body rig state for full-human chamber actors
  const bodyRigState = holoRig.getBodyRigState();

  const nt = bulk.state.shape?.nt || PROTO_SHAPE.nt;
  const movieLaneRecords = [];
  const frameFiles = [];
  const timingSamples = [];
  let prevK = Float64Array.from(egt.K);
  let lastBulkEgt = null;
  let lastAppeared = null;
  let lastWrittenCount = 0;
  let maxWrittenCount = 0;
  let lastNodeCountFull = egt.nodes.length;
  let lastNodeCountSparse = egt.nodes.length;
  let totalBinBytes = 0;
  const ciemsFrameResults = [];
  let govDegradedFrames = 0;
  let lastRosetta = null;
  const ciemsValidator = new CIEMSGovernanceValidator();
  const CIEMS_THRESHOLD = ciemsValidator.threshold;
  const t0 = performance.now();

  for (let f = 0; f < frameCount; f++) {
    const frameT0 = performance.now();

    // --- bulk / walk / anatomy (full EGT; walk needs topology) ---
    const bulkT0 = performance.now();
    const tNorm = f / Math.max(1, frameCount - 1);
    let bulkStep = null;
    if (bulk.state.t + 1 < nt) {
      bulkStep = bulk.stepBulk(1);
      lastBulkEgt = encoder.updateEGT(encoder.buildEGT(bulk.state), bulk.state);
    }

    const couple = coupleBulkToCharacter(egt, bulk, tNorm * Math.PI * 2);
    const walked = constitutionalFrameStep(egt, "walk", tNorm, {
      flow: spawned.signature?.behavioralFlows?.walk || {},
      amp: 0.12,
      phase: couple.phaseBoost,
    });
    egt = walked.egt;

    if (f % 4 === 0 || f === frameCount - 1) {
      anatomy = synthesizeAnatomyFromBoundary(egt, {
        bone: { jointThresh: 0.5 },
      });
    }
    const bulkMs = performance.now() - bulkT0;

    // --- sparse cull BEFORE induced / rig / build ---
    const sparseT0 = performance.now();
    let frameEgt = egt;
    let frameAnatomy = anatomy;
    let sourceIndices = null;
    let nodeCountFull = egt.nodes.length;
    let nodeCountSparse = nodeCountFull;
    if (sparse) {
      const keep = selectSparseKeepMask(egt, anatomy, {
        rhoThresh: vacuumRho ?? RHO_SPARSE,
        kThresh: K_SPARSE,
        wKeep: W_JOINT_KEEP,
      });
      const compacted = compactEgtByMask(egt, keep);
      frameEgt = compacted.egt;
      sourceIndices = compacted.sourceIndices;
      frameAnatomy = remapAnatomyForSparse(anatomy, sourceIndices);
      nodeCountFull = compacted.nodeCountFull;
      nodeCountSparse = compacted.nodeCountSparse;
    }
    const sparseMs = performance.now() - sparseT0;
    lastNodeCountFull = nodeCountFull;
    lastNodeCountSparse = nodeCountSparse;

    // --- rig pack (buildRigNodes + attribute buffers) ---
    const govOverride = {
      intent: walked.trace.stages.intent?.signal,
      evidence: Math.min(1, walked.trace.stages.evidence?.meanRho || 0.5),
      conformance: walked.trace.stages.conformance?.score ?? 0.868,
      // Derive stewardship from motion trace joint-inversion proxy instead of hardcoding 1.
      // jointInversion proxy warn → stewardship degrades; otherwise high.
      stewardship: walked.trace.stages.conformance?.jointInversionProxyWarn
        ? Math.max(0.3, (walked.trace.stages.conformance?.score ?? 0.868) * 0.8)
        : Math.min(1, 0.7 + 0.3 * (walked.trace.stages.intent?.signal ?? 0.5)),
    };
    const rigT0 = performance.now();
    holoRig.update(frameEgt, frameAnatomy, govOverride);
    const rigMs = performance.now() - rigT0;

    // --- CIEMS governance gate (G1) ---
    const frameGov = holoRig.frameGovernance || { intent: 0, evidence: 0, conformance: 0, stewardship: 0, count: 0 };
    const govViolations = [];
    if (frameGov.conformance < CIEMS_THRESHOLD.conformance) govViolations.push(`conformance=${frameGov.conformance.toFixed(3)}<${CIEMS_THRESHOLD.conformance}`);
    if (frameGov.stewardship < CIEMS_THRESHOLD.stewardship) govViolations.push(`stewardship=${frameGov.stewardship.toFixed(3)}<${CIEMS_THRESHOLD.stewardship}`);
    if (frameGov.intent < CIEMS_THRESHOLD.intent) govViolations.push(`intent=${frameGov.intent.toFixed(3)}<${CIEMS_THRESHOLD.intent}`);
    if (frameGov.evidence < CIEMS_THRESHOLD.evidence) govViolations.push(`evidence=${frameGov.evidence.toFixed(3)}<${CIEMS_THRESHOLD.evidence}`);
    const governancePassed = govViolations.length === 0;
    if (!governancePassed) {
      console.warn(`[CIEMS] Frame ${f}: GOVERNANCE DEGRADED — ${govViolations.join(', ')}`);
    }
    ciemsFrameResults.push({
      frame: f,
      intent: frameGov.intent,
      evidence: frameGov.evidence,
      conformance: frameGov.conformance,
      stewardship: frameGov.stewardship,
      count: frameGov.count,
      passed: governancePassed,
      violations: govViolations,
    });
    if (!governancePassed) govDegradedFrames++;

    // G10: Process through CIEMS validator for constitutional record
    ciemsValidator.processFrame(f, frameGov);

    // --- induced / appearance prep (metric + boundary + project) ---
    // Note: inducedMetricHij alone is O(1); bucket includes appearance clone/joints.
    const inducedT0 = performance.now();
    frameEgt.h_ij = frameEgt.h_ij || inducedMetricHij(g_munu);
    holoRig.bulk = bulk;
    holoRig.h_ij = frameEgt.h_ij;
    holoRig.egt = frameEgt;
    let framePrevK = prevK;
    if (sparse && sourceIndices) {
      framePrevK = new Float64Array(sourceIndices.length);
      for (let k = 0; k < sourceIndices.length; k++) {
        framePrevK[k] = prevK[sourceIndices[k]] ?? 0;
      }
    }
    const appeared = applyBoundaryAppearance(frameEgt, frameAnatomy, {
      prevK: framePrevK,
      vacuumRho,
    });
    lastAppeared = appeared;
    prevK = Float64Array.from(egt.K);
    const boundary = projectRigNodesH(appeared);
    appeared.h_ij = appeared.h_ij || inducedMetricHij(g_munu);
    const inducedMs = performance.now() - inducedT0;

    // --- Rosetta: shared clock / X / camera envelope (not Π) ---
    lastRosetta = mapHoloFrameToSharedState({
      frame: f,
      bulk,
      observer: null,
      sceneCard,
      outDir,
      width,
      height,
    });

    // --- build holographic streaming buffers ---
    const buildT0 = performance.now();
    renderer.buildHolographicBuffers(holoRig);
    if (renderer.material?.uniforms?.uTime) {
      renderer.material.uniforms.uTime.value = lastRosetta.t;
    }
    const buildMs = performance.now() - buildT0;

    // --- write / optional PNG ---
    let name;
    let writeMs = 0;
    if (codec === BIN_FRAME_CODEC) {
      const writeT0 = performance.now();
      const enc = writeBinFrame(
        join(framesDir, `frame-${String(f).padStart(6, "0")}.bin`),
        {
          buffers: renderer.holoBuffers,
          t: f,
          // Already culled pre-induced; write-time compact is cheap no-op if dense-active.
          sparse,
          vacuumRho,
        },
      );
      writeMs = performance.now() - writeT0;
      name = `frame-${String(f).padStart(6, "0")}.bin`;
      lastWrittenCount = enc.count;
      totalBinBytes += enc.byteLength;
      if (enc.count > maxWrittenCount) maxWrittenCount = enc.count;
    } else {
      const writeT0 = performance.now();
      const img = renderer.renderBoundary(appeared, boundary, mode);
      const png = rgbToPng(img.width, img.height, img.rgb);
      name = `frame-${String(f).padStart(4, "0")}.png`;
      writeFileSync(join(framesDir, name), png);
      writeMs = performance.now() - writeT0;
      lastWrittenCount = renderer.holoBuffers?.count ?? 0;
      if (lastWrittenCount > maxWrittenCount) maxWrittenCount = lastWrittenCount;
    }
    frameFiles.push(name);

    // --- Vision inspection (closed-loop feedback) ---
    let visionMs = 0;
    if (visionBridge && VISION_CONFIG.enabled && f % visionInterval === 0) {
      const visionT0 = performance.now();
      try {
        const visionResult = await inspectFrame(visionBridge, renderer.holoBuffers, f, {
          detail: visionDetail,
        });
        visionResults.push(visionResult);
        writeVisionResult(outDir, f, visionResult);

        // Analyze for anomalies
        const anomalyAnalysis = analyzeVisionForAnomalies(visionResult);
        if (anomalyAnalysis.isAnomaly) {
          console.log(`[VISION] Frame ${f}: ANOMALY DETECTED (${anomalyAnalysis.severity})`);
          for (const reason of anomalyAnalysis.reasons) {
            console.log(`  - ${reason}`);
          }
        } else if (f === 0 || f % 12 === 0) {
          console.log(`[VISION] Frame ${f}: inspected — ${visionResult.observations?.length || 0} observations, ${visionResult.uncertainties?.length || 0} uncertainties`);
        }
      } catch (visionErr) {
        console.error(`[VISION] Frame ${f} inspection failed:`, visionErr.message);
      }
      visionMs = performance.now() - visionT0;
    }

    
    // Turbo control capture removed - import paths complex
