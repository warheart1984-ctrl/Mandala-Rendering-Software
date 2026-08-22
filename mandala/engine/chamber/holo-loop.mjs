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
    avg_total_ms: +avg(TIMING.total_ms).toFixed(3),
    avg_count: +avg(TIMING.count).toFixed(1),
    avg_nodeCountFull: +avg(TIMING.nodeCountFull).toFixed(1),
    avg_nodeCountSparse: +avg(TIMING.nodeCountSparse).toFixed(1),
    /** writeBinFrame only — not e2e gen. */
    streaming_io_ms: +avg(TIMING.write_ms).toFixed(3),
    /** Full frame: bulk+sparse+rig+induced+build+write. */
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
export function runHoloChamber({
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
} = {}) {
  resetTiming();
  mkdirSync(outDir, { recursive: true });
  const framesDir = join(outDir, "frames");
  mkdirSync(framesDir, { recursive: true });

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
      stewardship: 1,
    };
    const rigT0 = performance.now();
    holoRig.update(frameEgt, frameAnatomy, govOverride);
    const rigMs = performance.now() - rigT0;

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

    // --- build holographic streaming buffers ---
    const buildT0 = performance.now();
    renderer.buildHolographicBuffers(holoRig);
    if (renderer.material?.uniforms?.uTime) {
      renderer.material.uniforms.uTime.value = bulk.state?.t ?? bulk.t ?? 0;
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

    const totalMs = performance.now() - frameT0;

    TIMING.frame.push(f);
    TIMING.bulk_ms.push(bulkMs);
    TIMING.sparse_ms.push(sparseMs);
    TIMING.rig_ms.push(rigMs);
    TIMING.induced_ms.push(inducedMs);
    TIMING.build_ms.push(buildMs);
    TIMING.write_ms.push(writeMs);
    TIMING.total_ms.push(totalMs);
    TIMING.count.push(lastWrittenCount);
    TIMING.nodeCountFull.push(nodeCountFull);
    TIMING.nodeCountSparse.push(nodeCountSparse);

    const shouldLog = f === 0 || f % 12 === 0 || totalMs > 100 || f === frameCount - 1;
    if (shouldLog) {
      const line =
        `frame ${String(f).padStart(4, "0")} | total ${totalMs.toFixed(1)}ms | ` +
        `bulk ${bulkMs.toFixed(1)}ms | sparse ${sparseMs.toFixed(1)}ms | ` +
        `rig ${rigMs.toFixed(1)}ms | induced ${inducedMs.toFixed(1)}ms | ` +
        `build ${buildMs.toFixed(1)}ms | write ${writeMs.toFixed(1)}ms | ` +
        `count ${lastWrittenCount} | full ${nodeCountFull} | sparse ${nodeCountSparse}`;
      console.log(line);
      const sample = {
        t: f,
        count: lastWrittenCount,
        nodeCountFull,
        nodeCountSparse,
        totalMs: +totalMs.toFixed(3),
        bulkMs: +bulkMs.toFixed(3),
        sparseMs: +sparseMs.toFixed(3),
        rigMs: +rigMs.toFixed(3),
        inducedMs: +inducedMs.toFixed(3),
        buildMs: +buildMs.toFixed(3),
        writeMs: +writeMs.toFixed(3),
        codec,
      };
      timingSamples.push(sample);
      writeFileSync(
        join(
          framesDir,
          `frame-${String(f).padStart(codec === BIN_FRAME_CODEC ? 6 : 4, "0")}.json`,
        ),
        JSON.stringify(sample),
      );
    }

    const filled = bulk.state.temporal?.filled || 0;
    if (filled > 0) {
      const tRec = Math.min(filled - 1, bulk.state.t);
      try {
        if (f === 0 || bulkStep) {
          const path = defaultFlythroughPath(filled, bulk.state.shape);
          setObserverPath(bulk.state, path);
        }
        const obs = observerAt(bulk.state, tRec);
        movieLaneRecords.push({
          organ: "MovieLane",
          ownsTime: false,
          t: obs.t,
          frame: name,
          observer: obs.observer,
          defect: obs.defect,
          recorded: "projected-boundary",
          notBulkVolume: true,
        });
      } catch {
        movieLaneRecords.push({
          organ: "MovieLane",
          ownsTime: false,
          t: tRec,
          frame: name,
          recorded: "projected-boundary",
          note: "observer path not yet authored for this slice",
        });
      }
    }
  }

  const wallMsTotal = performance.now() - t0;
  const genFpsEstimate =
    wallMsTotal > 0 ? (frameFiles.length * 1000) / wallMsTotal : null;
  const timingReport = getTimingReport();
  console.log("\n=== Timing report (avg ms) ===");
  console.table(timingReport);

  let mp4Name = null;
  const wantMp4 = mp4 && codec === "png";
  if (wantMp4 && frameFiles.length >= 2 && existsSync(FFMPEG)) {
    const mp4Path = join(outDir, "composite.mp4");
    const r = spawnSync(
      FFMPEG,
      [
        "-y",
        "-framerate",
        String(fps),
        "-i",
        join(framesDir, "frame-%04d.png"),
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        mp4Path,
      ],
      { encoding: "utf8" },
    );
    if (r.status === 0) mp4Name = "composite.mp4";
  }

  const avgBinBytes =
    frameFiles.length > 0 && codec === BIN_FRAME_CODEC
      ? totalBinBytes / frameFiles.length
      : 0;

  if (codec === BIN_FRAME_CODEC) {
    installWatchArtifacts(outDir);
    const meta = buildBinMeta({
      frameCount: frameFiles.length,
      maxNodes: renderer.maxNodes,
      fps,
      attributes: BIN_FRAME_ATTRIBUTES.map((a) => a.name),
      vacuumRho,
      lastCount: lastWrittenCount,
      maxWrittenCount,
      genWallMs: wallMsTotal,
      genFpsEstimate,
      nodeCountFull: lastNodeCountFull,
      nodeCountSparse: lastNodeCountSparse,
      avgBinBytes,
      sparseEnabled: sparse,
    });
    writeFileSync(join(outDir, "meta.json"), JSON.stringify(meta, null, 2));
  }

  const receipt = {
    type: "mandala-holo-chamber-receipt",
    status: HOLO_CHAMBER_STATUS,
    claim: HOLO_CHAMBER_CLAIM,
    scene: sceneCard?.id || sceneCard?.name || null,
    creature: spawned.taxonomy,
    capsulesSkipped: true,
    meshLoad: false,
    recordMode: mode,
    codec,
    pngEncode: codec === "png",
    sparseRho: {
      sparseRhoThreshold: vacuumRho ?? RHO_SPARSE,
      kThresh: K_SPARSE,
      wKeep: W_JOINT_KEEP,
      status: SPARSE_CULL_STATUS,
      enabled: sparse,
      nodeCountFull: lastNodeCountFull,
      nodeCountSparse: lastNodeCountSparse,
      avgBinBytes,
    },
    holographicShaders: HOLOGRAPHIC_SHADER_SOT,
    holographicBuffers: {
      count: renderer.holoBuffers?.count ?? 0,
      writtenCount: lastWrittenCount,
      maxWrittenCount,
      nodeCountFull: lastNodeCountFull,
      nodeCountSparse: lastNodeCountSparse,
      attributes: renderer.geometry ? Object.keys(renderer.geometry.attributes || {}) : [],
      streaming: HOLOGRAPHIC_STREAMING_STATUS,
      binStreaming: codec === BIN_FRAME_CODEC ? BIN_FRAME_STATUS : "n/a",
      maxNodes: renderer.maxNodes,
      drawRange: renderer.geometry?.drawRange || null,
    },
    durationSec,
    fps,
    frameCount: frameFiles.length,
    ms: wallMsTotal,
    wallMs: wallMsTotal,
    genFpsEstimate,
    timing: timingReport,
    timingSamples,
    note:
      "genFpsEstimate = frames / wall seconds for this run. streaming_io_ms = write only; end_to_end_ms = full frame. shader_fps declared until watch.html measures on device.",
    organs: {
      simulationChamber: HOLO_CHAMBER_STATUS,
      bulkSpacetimeEngine: BULK_ENGINE_STATUS,
      holographicEncoder: HOLOGRAPHIC_ENCODER_STATUS,
      anatomySynthesis: ANATOMY_SYNTHESIS_STATUS,
      characterHolographicRig: HOLO_RIG_STATUS,
      boundaryAppearance: BOUNDARY_APPEARANCE_STATUS,
      entanglementRenderer: COMPOSITE_STATUS,
      holographicShaders: HOLOGRAPHIC_SHADER_STATUS,
      holographicBuffers: HOLOGRAPHIC_BUFFER_STATUS,
      movieLane: MOVIE_LANE_STATUS,
      spawn: SPAWN_STATUS,
    },
    tags: {
      realisticDefault: REALISTIC_DEFAULT_STATUS,
      photorealMesh: "declared",
      holographicShaders: HOLOGRAPHIC_SHADER_STATUS,
      holographicBuffers: HOLOGRAPHIC_BUFFER_STATUS,
      holographicStreaming: HOLOGRAPHIC_STREAMING_STATUS,
      binStreaming: codec === BIN_FRAME_CODEC ? BIN_FRAME_STATUS : "n/a",
      sparseRho: BIN_SPARSE_STATUS,
      gpuThreeRaster: HOLOGRAPHIC_GPU_RASTER_STATUS,
      walkPrimitive: "partial",
      movieLaneOwnsTime: false,
    },
    anatomy: {
      muscleClusters: anatomy?.muscles?.clusters?.length ?? 0,
      bonePaths: anatomy?.bones?.paths?.length ?? 0,
      joints: anatomy?.bones?.joints?.length ?? 0,
    },
    lastAppearance: {
      lockedCount: lastAppeared?.boundaryAppearance?.lockedCount ?? 0,
      jointCount: lastAppeared?.boundaryAppearance?.joints?.length ?? 0,
    },
    bulk: {
      t: bulk.state.t,
      hash: bulk.state.hash,
      filled: bulk.state.temporal?.filled ?? 0,
      latticeEgtHash: lastBulkEgt?.hash || null,
    },
    movieLane: {
      ownsTime: false,
      records: movieLaneRecords.length,
      recorded: "projected-boundary",
    },
    artifacts: {
      framesDir,
      frames: frameFiles,
      codec,
      meta: codec === BIN_FRAME_CODEC ? "meta.json" : null,
      watch: codec === BIN_FRAME_CODEC ? "watch.html" : null,
      mp4: mp4Name,
      receipt: "receipt.json",
      movieLane: "movie-lane.json",
    },
    fingerprint: createHash("sha256")
      .update("holo-chamber.v3-timing-sparse")
      .update(templateId)
      .update(codec)
      .update(String(sparse))
      .update(String(frameCount))
      .update(bulk.state.hash || "")
      .digest("hex"),
  };

  writeFileSync(join(outDir, "receipt.json"), JSON.stringify(receipt, null, 2));
  writeFileSync(
    join(outDir, "movie-lane.json"),
    JSON.stringify(
      {
        organ: "MovieLane",
        ownsTime: false,
        status: MOVIE_LANE_STATUS,
        recorded: "projected-boundary",
        records: movieLaneRecords,
      },
      null,
      2,
    ),
  );

  return {
    ok: frameFiles.length >= 2 && receipt.anatomy.muscleClusters + receipt.anatomy.bonePaths >= 1,
    outDir,
    receipt,
    frameCount: frameFiles.length,
    mp4: mp4Name,
    codec,
    timing: timingReport,
  };
}
