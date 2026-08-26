import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  HOLORT4D_STATUS,
  ACCUMULATOR_PATTERNS,
  createHoloCamera,
  createComplexField,
  createRgbFields,
  LAMBDA_R,
  LAMBDA_G,
  LAMBDA_B,
  TILE_SIZE,
  pixelIdFromRaygen,
  holoXYFromPixel,
  tileIdFromHolo,
  binPaths,
  accumulateAtomic,
  accumulateRGB,
  encodePhaseOnly,
  encodeDebugRealImag,
  DEBUG_REAL_IMAG_MAP,
  DEBUG_REAL_IMAG_STATUS,
  mapBoundedField,
  dumpDebugRealImagPng,
  rasterizeDebugRealImag,
  phaseNorm,
  propagateConstantPhase,
  checkLinearity,
  HOLORT4D_MC_LINEAR_ID,
  PATH_ADAPTER_STATUS,
  pathSampleFromRt4dIndex,
  rt4dBuffersFromHandoff,
  onTileBorder,
  overlayHoloTile,
  phaseWheelColor,
  inspectTile,
  historyIndex,
  playbackIndex,
  wNorm,
  wSlicePixelIndex,
  CORNELL_SCENE,
  PATH_SAMPLE_BYTE_SIZE,
  PATH_SAMPLE_OFFSETS,
  PATH_SAMPLE_FINALIZE_OFFSET,
  PATH_SAMPLE_WGSL,
  createPathSampleView,
  writeBounceSample,
  writePathFinalize,
  readPathSample,
  packPathSample,
  PATH_FINALIZE_STATUS,
  PATH_FINALIZE_WGSL_SKETCH,
  traceBounce,
  runPathLoopThenFinalize,
  PathSampleUnreadyError,
  rejectUnreadyPath,
  describeHoloBindGroups,
  HOLO_BIND_SET_TILES,
  HOLO_BIND_SET_PHASE,
  HOLO_LOGICAL_SET_TILES,
  HOLO_LOGICAL_SET_PHASE,
  HOLO_LAYOUT_STATUS,
  prefixSumOffsets,
  localTileXYFromPixelId,
  tiledAccumulate,
  polarSoaPadColumn,
  POLAR_TILE_FLAT_LEN,
  POLAR_PAD_COLUMN,
  tileHeadersFromCounts,
  tileCountsFromAlignedGrid,
  POLAR_SAFE_WGSL,
  HOLO_BIN_PATHS_WGSL,
  HOLO_PATH_FINALIZE_WGSL,
  HOLO_TILED_ACCUMULATE_WGSL,
  HOLO_PHASE_ENCODE_WGSL,
  HOLO_PHASE_ENCODE_ATOMIC_WGSL,
  HOLO_DEBUG_REAL_IMAG_WGSL,
  HOLO_ACCUMULATE_ATOMIC_WGSL,
  supportsFloatAtomic,
  shouldUseFloatAtomic,
  describePolarDispatch,
  POLAR_BINPATHS_WORKGROUP,
  POLAR_TILED_WORKGROUP,
  isPolarDevice,
  holort4d,
  SNAPSHOT_LEVELS,
  DEPTH_RECONSTRUCT_STATUS,
  scatterOpticalLength,
  scatterOpticalLengthTileModWrong,
  depthToComplexField,
  reconstructPhaseFromPaths,
  validatePixelIdRoundtrip,
  depthCorrelation,
  analyzeTunnelBehindSubject,
  phaseDepthAgreement,
  scorePixelIdMapping,
  verifyDepthScatterRoundtrip,
  pixelXYFromPixelId,
  SNAPSHOT_CPU_STATUS,
  HoloRT4DGPURenderer,
  atomicLoadF32,
  attachCiemsTrail,
  CIEMS_TRAIL_STAGES,
  postCiemsMemory,
  hashTileHeaders,
  hashComplexField,
  POLAR_ATOMIC,
  ARKIT_BLENDSHAPE_NAMES,
  FACE_RIG_FLOAT_COUNT,
  LANDMARK_COUNT,
  buildFaceRigSnapshot,
  renderRigWithNumbers,
  buildFaceRigEnvelopes,
  createDefaultFaceRig,
  formatControlBarText,
  packFaceRigFloats,
  projectLandmarksFromRig,
  FACE_RIG_CONTROL_STATUS,
  buildFaceRigState,
  renderDepthMap,
  renderColoredByBone,
  renderFlow,
  renderAllTurboControls,
  LANDMARK_TO_CONTROL,
  landmarkControlCoverage,
  SIMULATION_CHAMBER_STATUS,
  SimulationChamber,
  integrateBones,
  tracePathsFromRigState,
  zToOpticalLength,
  recordDeterministicTape,
  hashFloat32Array,
  hashJson,
  CHAMBER_STUDIO_BEAT_STATUS,
  recordStudioBeat,
  replayTapeFromDisk,
  loadStoryForgeBeat,
  interpolateTrack,
  RENDER_VIEW_STATUS,
  DEFAULT_ANIME_PROMPT,
  ANIME_VIEW_CONFIG,
  applyToonLUT,
  loadChamberFrame,
  createRenderView,
} from "./index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../../../..");

describe("HoloRT4D contract split", () => {
  it("is wave optics, not projection or EntanglementRenderer", () => {
    assert.equal(HOLORT4D_STATUS.notProjection, true);
    assert.equal(HOLORT4D_STATUS.notEntanglementRenderer, true);
    assert.equal(HOLORT4D_STATUS.physicalValidity, "declared");
    assert.equal(ACCUMULATOR_PATTERNS.directSsboAtomic.status, "partial");
    assert.equal(ACCUMULATOR_PATTERNS.directSsboAtomic.gpu, "declared");
    assert.equal(ACCUMULATOR_PATTERNS.sharedMemoryTile.status, "partial");
    assert.equal(ACCUMULATOR_PATTERNS.sharedMemoryTile.gpu, "partial");
    assert.equal(ACCUMULATOR_PATTERNS.directSsboAtomic.gpu, "declared");
    assert.equal(ACCUMULATOR_PATTERNS.multiPassReduction.status, "declared");
    assert.equal(PATH_ADAPTER_STATUS.pixelId, "adapter");
  });
});

describe("A. Raygen-aligned tiles", () => {
  it("stores pixelId = py * frameWidth + px", () => {
    assert.equal(pixelIdFromRaygen(3, 2, 8), 2 * 8 + 3);
    assert.equal(pixelIdFromRaygen(0, 0, 16), 0);
  });

  it("same-res holoX=px, holoY=py; else integer scale", () => {
    assert.deepEqual(holoXYFromPixel(4, 5, 16, 16, 16, 16), { holoX: 4, holoY: 5 });
    assert.deepEqual(holoXYFromPixel(4, 5, 16, 16, 8, 8), { holoX: 2, holoY: 2 });
  });

  it("tileId from TILE_SIZE 16", () => {
    const t = tileIdFromHolo(17, 16, 32, TILE_SIZE, TILE_SIZE);
    assert.equal(t.tileX, 1);
    assert.equal(t.tileY, 1);
    assert.equal(t.numTilesX, 2);
    assert.equal(t.tileId, 1 * 2 + 1);
  });

  it("BinPaths atomic count + entries[offset+writeIndex]", () => {
    const paths = [
      { pixelId: pixelIdFromRaygen(0, 0, 16) },
      { pixelId: pixelIdFromRaygen(1, 0, 16) },
      { pixelId: pixelIdFromRaygen(16, 0, 32) },
    ];
    const bins = binPaths(paths, {
      frameWidth: 32,
      frameHeight: 32,
      holoResX: 32,
      holoResY: 32,
    });
    assert.equal(bins.mode, "camera-aligned");
    assert.equal(bins.headers[0].count, 2);
    assert.equal(bins.entries[bins.headers[0].offset].pathIndex, 0);
    assert.equal(bins.entries[bins.headers[0].offset + 1].pathIndex, 1);
    const tile1 = tileIdFromHolo(16, 0, 32).tileId;
    assert.equal(bins.headers[tile1].count, 1);
    assert.equal(bins.entries[bins.headers[tile1].offset].pathIndex, 2);
  });
});

describe("Accumulator + invariant", () => {
  it("two paths to one pixel: Re/Im = sum, order-independent", () => {
    const cam = createHoloCamera({ resX: 1, resY: 1, lambda: 550e-9 });
    const a = { radiance: 1, weight: 1, opticalLength: 0, pixelId: 0, pixelIndex: 0 };
    const b = { radiance: 2, weight: 0.5, opticalLength: cam.lambda / 4, pixelId: 0, pixelIndex: 0 };
    const result = checkLinearity([a, b], cam, 0);
    assert.equal(result.id, HOLORT4D_MC_LINEAR_ID);
    assert.equal(result.ok, true);
    assert.equal(result.evidence.linear, true);
    assert.equal(result.evidence.commutative, true);
    assert.equal(result.evidence.physical, "declared");
  });

  it("phase encode atan2(imag, real) → [0,1] with +π map", () => {
    const field = [{ real: 0, imag: 1 }];
    const phase = encodePhaseOnly(field);
    assert.ok(Math.abs(phase[0] - 0.75) < 1e-9);
    assert.ok(phaseNorm(1, 0) >= 0 && phaseNorm(1, 0) <= 1);
    assert.ok(Math.abs(phaseNorm(1, 0) - 0.5) < 1e-9);
  });

  it("RGB wavelengths accumulate independently", () => {
    const cam = createHoloCamera({ resX: 1, resY: 1 });
    const fields = createRgbFields(1, 1);
    accumulateRGB(
      fields,
      [
        { radiance: 1, weight: 1, opticalLength: 0, pixelId: 0, pixelIndex: 0, wl: LAMBDA_R },
        { radiance: 1, weight: 1, opticalLength: 0, pixelId: 0, pixelIndex: 0, wl: LAMBDA_B },
      ],
      cam,
    );
    assert.ok(fields.fieldR[0].real > 0);
    assert.equal(fields.fieldG[0].real, 0);
    assert.ok(fields.fieldB[0].real > 0);
  });

  it("propagate is a declared constant-phase stub", () => {
    const r = propagateConstantPhase(createComplexField(1, 1));
    assert.equal(r.status, "declared");
  });
});

describe("Debug suite math", () => {
  it("onBorder when localX/Y == 0", () => {
    assert.equal(onTileBorder(0, 5, 16, 16), true);
    assert.equal(onTileBorder(3, 0, 16, 16), true);
    assert.equal(onTileBorder(3, 5, 16, 16), false);
  });

  it("|E| heat and phaseNorm; neon border wins", () => {
    const o = overlayHoloTile([0.2, 0.2, 0.2], { real: 3, imag: 4 }, 1, 1, 1, 16, 16);
    assert.equal(o.intensity, 5);
    assert.equal(o.onBorder, false);
    const border = overlayHoloTile([0.2, 0.2, 0.2], { real: 1, imag: 0 }, 0, 0, 2, 16, 16);
    assert.deepEqual(border.rgb, [0, 1, 0]);
    const p = phaseNorm(0, 1);
    assert.ok(p > 0 && p < 1);
  });

  it("phase wheel phaseNorm = u", () => {
    const w = phaseWheelColor(0.25);
    assert.ok(Math.abs(w.phaseNorm - 0.25) < 1e-12);
    assert.ok(Math.abs(w.rgb[0] - 0.25) < 1e-12);
    assert.ok(Math.abs(w.rgb[1] - 0.75) < 1e-12);
  });

  it("tile inspector coherence; sumMag==0 → 0", () => {
    const field = createComplexField(16, 16);
    const empty = inspectTile(field, 16, 0, 0, 16, 16);
    assert.equal(empty.energy, 0);
    assert.equal(empty.coherence, 0);
    field[0] = { real: 1, imag: 0 };
    field[1] = { real: 1, imag: 0 };
    const s = inspectTile(field, 16, 0, 0, 2, 1);
    assert.equal(s.energy, 2);
    assert.equal(s.coherence, 1);
    assert.ok(Math.abs(s.avgPhase) < 1e-12);
  });

  it("historyIndex = bounceId * (W*H) + pixelIndex", () => {
    assert.equal(historyIndex(2, 7, 4, 3), 2 * 12 + 7);
    assert.equal(playbackIndex(1, 2, 1, 4, 3), 1 * 12 + 1 * 4 + 2);
  });

  it("wNorm clamp; scaled W-slice uses BinPaths holo map", () => {
    assert.equal(wNorm(5, 0, 10), 0.5);
    assert.equal(wNorm(-1, 0, 10), 0);
    assert.equal(wNorm(11, 0, 10), 1);
    assert.equal(wNorm(3, 3, 3), 0);
    const same = wSlicePixelIndex(10, { holoResX: 8 });
    assert.equal(same, Math.trunc(10 / 8) * 8 + (10 % 8));
    const scaled = wSlicePixelIndex(pixelIdFromRaygen(4, 0, 16), {
      holoResX: 8,
      holoResY: 8,
      frameWidth: 16,
      frameHeight: 16,
    });
    assert.equal(scaled, 2);
  });

  it("Cornell scene exists in-repo; no screenshot claimed", () => {
    assert.equal(existsSync(join(repoRoot, CORNELL_SCENE)), true);
  });
});

describe("RT4D path adapter", () => {
  it("derives pixelId from raygen idx", () => {
    const s = pathSampleFromRt4dIndex(5, {
      rayOrigins: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 2, 3, 4],
      hits: { 5: { t: 2.5 } },
    }, 8);
    assert.equal(s.pixelId, 5);
    assert.equal(s.opticalLength, 2.5);
    assert.equal(s.w, 4);
    assert.equal(s.packed.byteLength, PATH_SAMPLE_BYTE_SIZE);
  });
});

describe("Step 1 — frozen PathSample + PathFinalize + bind groups", () => {
  it("PathSample byteSize === 64 and finalize fields at 48–59", () => {
    assert.equal(PATH_SAMPLE_BYTE_SIZE, 64);
    assert.equal(PATH_SAMPLE_OFFSETS.opticalLength, 48);
    assert.equal(PATH_SAMPLE_OFFSETS.pixelId, 52);
    assert.equal(PATH_SAMPLE_OFFSETS.bounceId, 56);
    assert.equal(PATH_SAMPLE_FINALIZE_OFFSET, 48);
    const slot = createPathSampleView();
    assert.equal(slot.f32.byteLength, 64);
    writePathFinalize(slot, { opticalLength: 1.25, pixelId: 7, bounceId: 2 });
    assert.equal(slot.view.getFloat32(48, true), 1.25);
    assert.equal(slot.view.getUint32(52, true), 7);
    assert.equal(slot.view.getUint32(56, true), 2);
    assert.match(PATH_SAMPLE_WGSL, /pixelId: u32/);
  });

  it("bounce helper does not write finalize-only fields", () => {
    const slot = createPathSampleView();
    slot.view.setFloat32(48, 99, true);
    slot.view.setUint32(52, 99, true);
    slot.view.setUint32(56, 99, true);
    writeBounceSample(slot, {
      pos: { x: 1, y: 2, z: 3 },
      dir: { x: 0, y: 0, z: 1 },
      wl: 550e-9,
      radiance: { x: 1, y: 0, z: 0 },
      weight: 0.5,
    });
    assert.equal(slot.view.getFloat32(48, true), 99);
    assert.equal(slot.view.getUint32(52, true), 99);
    assert.equal(slot.view.getUint32(56, true), 99);
    const bounce = readPathSample(slot);
    assert.equal(bounce.pos.x, 1);
    assert.equal(bounce.weight, 0.5);
  });

  it("PathFinalize is a post-loop write, not inside the bounce helper", () => {
    const { sample, log } = runPathLoopThenFinalize({
      maxBounces: 3,
      opticalLength: 2,
      pixelId: 11,
      bounceId: 2,
      bounce: { radiance: { x: 1, y: 0, z: 0 }, weight: 1 },
    });
    assert.deepEqual(log, ["traceBounce", "traceBounce", "traceBounce", "pathFinalize"]);
    assert.equal(sample.pixelId, 11);
    assert.equal(sample.opticalLength, 2);
    assert.equal(sample.bounceId, 2);
    assert.equal(PATH_FINALIZE_STATUS.gpuHook, "partial");
    assert.match(PATH_FINALIZE_WGSL_SKETCH, /for \(var b = 0u; b < maxBounces/);
    assert.match(PATH_FINALIZE_WGSL_SKETCH, /pathFinalize\(p, opticalLength, pixelId, maxBounces - 1u\)/);
    const slot = createPathSampleView();
    traceBounce(slot, { radiance: { x: 1, y: 0, z: 0 } });
    assert.equal(slot.view.getUint32(52, true), 0);
  });

  it("separate Holo pipeline uses physical groups 0/1 (logical Set 4/5)", () => {
    const d = describeHoloBindGroups();
    assert.deepEqual(d.rt4dSets, [0, 1, 2, 3]);
    assert.deepEqual(d.holoLogicalSets, [4, 5]);
    assert.deepEqual(d.holoSets, [0, 1]);
    assert.equal(d.requiresMaxBindGroups, 4);
    assert.equal(HOLO_LOGICAL_SET_TILES, 4);
    assert.equal(HOLO_LOGICAL_SET_PHASE, 5);
    assert.equal(HOLO_BIND_SET_TILES, 0);
    assert.equal(HOLO_BIND_SET_PHASE, 1);
    assert.equal(HOLO_LAYOUT_STATUS.importsRt4dLayouts, false);
    assert.equal(HOLO_LAYOUT_STATUS.physicalFitsMaxBindGroups4, true);
    assert.deepEqual(d.set4.bindings.map((b) => b.name), [
      "TileHeaders",
      "TileEntries",
      "complexField",
      "pathSamples",
    ]);
    assert.deepEqual(d.set5.bindings.map((b) => b.name), ["phaseTexture", "params"]);
    assert.match(HOLO_BIN_PATHS_WGSL, /@group\(0\) @binding\(0\)/);
    assert.match(HOLO_BIN_PATHS_WGSL, /@group\(1\) @binding\(1\)/);
    assert.doesNotMatch(HOLO_BIN_PATHS_WGSL, /@group\(4\)/);
    assert.doesNotMatch(HOLO_BIN_PATHS_WGSL, /@group\(5\)/);
  });

  it("rejects missing pixelId or opticalLength before accumulation", () => {
    assert.throws(() => rejectUnreadyPath({ opticalLength: 1 }), PathSampleUnreadyError);
    assert.throws(() => rejectUnreadyPath({ pixelId: 0 }), PathSampleUnreadyError);
    assert.throws(
      () => accumulateAtomic(createComplexField(1, 1), [{ radiance: 1, weight: 1, opticalLength: 0 }], createHoloCamera()),
      PathSampleUnreadyError,
    );
    assert.doesNotThrow(() => rejectUnreadyPath({ pixelId: 0, opticalLength: 0 }));
  });
});

describe("Step 2 — Polar tiled path", () => {
  it("prefix-sum offsets from tile counts", () => {
    assert.deepEqual(prefixSumOffsets([2, 0, 3, 1]), [0, 2, 2, 5]);
    const headers = tileHeadersFromCounts([2, 3]);
    assert.equal(headers[0].offset, 0);
    assert.equal(headers[1].offset, 2);
    assert.equal(headers[0].count, 0);
  });

  it("lx/ly uses BinPaths map, not pixelId % 16", () => {
    const wide = localTileXYFromPixelId(17, {
      frameWidth: 32,
      frameHeight: 16,
      holoResX: 32,
      holoResY: 16,
    });
    assert.equal(17 % 16, 1);
    assert.equal(wide.px, 17);
    assert.equal(wide.holoX, 17);
    assert.equal(wide.lx, 1);
    const scaled = localTileXYFromPixelId(pixelIdFromRaygen(4, 0, 16), {
      frameWidth: 16,
      frameHeight: 16,
      holoResX: 8,
      holoResY: 8,
    });
    assert.equal(scaled.holoX, 2);
    assert.equal(scaled.lx, 2);
    assert.notEqual(4 % 16, scaled.holoX);
  });

  it("BinPaths WGSL uses u32-only atomics; tiled path has no atomic<f32>", () => {
    assert.match(HOLO_BIN_PATHS_WGSL, /@workgroup_size\(256\)/);
    const countAdds = HOLO_BIN_PATHS_WGSL.match(/atomicAdd\(/g) ?? [];
    assert.equal(countAdds.length, 1);
    assert.match(HOLO_BIN_PATHS_WGSL, /atomicAdd\(&headers\[tileId\]\.count/);
    assert.doesNotMatch(HOLO_BIN_PATHS_WGSL, /atomic<f32>/);
    assert.match(HOLO_TILED_ACCUMULATE_WGSL, /@workgroup_size\(16, 16\)/);
    assert.doesNotMatch(HOLO_TILED_ACCUMULATE_WGSL, /atomicAdd|atomic</);
    for (const src of POLAR_SAFE_WGSL) {
      assert.doesNotMatch(src, /atomic<f32>/);
      assert.doesNotMatch(src, /atomicAdd\([^)]*real/);
      assert.doesNotMatch(src, /atomicLoad\(/);
      assert.doesNotMatch(src, /@group\(4\)|@group\(5\)/);
    }
  });

  it("TiledAccumulate: one writer per pixel and linear complex sum", () => {
    const cam = createHoloCamera({ resX: 16, resY: 16, lambda: 550e-9 });
    const field = createComplexField(16, 16);
    const paths = [
      { pixelId: 0, opticalLength: 0, radiance: 1, weight: 1 },
      { pixelId: 0, opticalLength: 0, radiance: 2, weight: 1 },
      { pixelId: 1, opticalLength: 0, radiance: 3, weight: 1 },
    ];
    const opts = { frameWidth: 16, frameHeight: 16, holoResX: 16, holoResY: 16 };
    const { writers } = tiledAccumulate(field, paths, cam, opts);
    for (let i = 0; i < writers.length; i++) assert.equal(writers[i], 1);
    const linear = checkLinearity(paths.slice(0, 2), cam, 0);
    assert.equal(linear.ok, true);
    assert.ok(field[0].real > 0);
    assert.ok(field[1].real > 0);
  });

  it("Polar GPU dispatch plan: Set 4/5, wg 256 and 16×16, prefix-sum before BinPaths", () => {
    const plan = describePolarDispatch({ holoResX: 32, holoResY: 32, pathCount: 32 });
    assert.equal(plan.status, "partial");
    assert.equal(plan.gpuAvailable, false);
    assert.equal(plan.polarFloatAtomics, false);
    assert.equal(plan.prefixSumBeforeBinPaths, true);
    assert.equal(plan.requiresMaxBindGroups, 4);
    assert.equal(plan.bindGroups.set4, 0);
    assert.equal(plan.bindGroups.set5, 1);
    assert.equal(plan.bindGroups.logicalSet4, 4);
    assert.equal(plan.bindGroups.logicalSet5, 5);
    assert.equal(plan.bindGroups.importsRt4d, false);
    assert.deepEqual(plan.bindGroups.set4Bindings, ["TileHeaders", "TileEntries", "complexField", "pathSamples"]);
    assert.equal(plan.kernels[0].kernelName, "holo_binPaths");
    assert.equal(plan.kernels[0].workgroupSize, POLAR_BINPATHS_WORKGROUP);
    assert.equal(POLAR_BINPATHS_WORKGROUP, 256);
    assert.deepEqual(plan.kernels[1].workgroupSize, [...POLAR_TILED_WORKGROUP]);
    assert.equal(plan.kernels[1].atomics, "none");
    assert.equal(plan.kernels[2].fieldRead, "f32");
    assert.ok(plan.rx580.howToRun.length >= 4);

    const gpu = new HoloRT4DGPURenderer(null, { holoResX: 32, holoResY: 32 });
    const dispatched = gpu.dispatch(null, null, {
      paths: [{ pixelId: 0, opticalLength: 1, radiance: 1, weight: 1 }],
    });
    assert.equal(dispatched.prefixSumBeforeBinPaths, true);
    assert.equal(dispatched.kernels[0].workgroupSize, 256);
    assert.deepEqual(dispatched.kernels[1].workgroupSize, [16, 16]);
    assert.equal(gpu.status.workgroupSizes.binPaths, 256);
    assert.equal(POLAR_ATOMIC.enabledOnPolarByDefault, false);
  });
});

describe("Step 3 — PhaseEncode + float-atomic gate", () => {
  it("PhaseEncode range is [0, 1]", () => {
    const phases = encodePhaseOnly([
      { real: 1, imag: 0 },
      { real: 0, imag: 1 },
      { real: -1, imag: 0 },
      { real: 0, imag: -1 },
    ]);
    for (const p of phases) {
      assert.ok(p >= 0 && p <= 1);
    }
    assert.ok(Math.abs(phases[0] - 0.5) < 1e-9);
    assert.ok(Math.abs(phases[1] - 0.75) < 1e-9);
    assert.ok(Math.abs(phases[2] - 1.0) < 1e-9);
    assert.ok(Math.abs(phases[3] - 0.25) < 1e-9);
    assert.ok(!supportsFloatAtomic(null));
    assert.ok(!supportsFloatAtomic({ features: { has: () => false } }));
    assert.ok(supportsFloatAtomic({ features: { has: (f) => f === "shader-float32-atomic" } }));
  });

  it("unified PhaseEncode: tiled reads f32; atomic path atomicLoad", () => {
    const tiled = encodePhaseOnly([{ real: 0, imag: 1 }], { mode: "tiled" });
    const atomic = encodePhaseOnly(
      [{ real: { value: 0 }, imag: { load: () => 1 } }],
      { mode: "atomic" },
    );
    assert.equal(tiled.length, 1);
    assert.equal(atomic.length, 1);
    assert.ok(Math.abs(tiled[0] - atomic[0]) < 1e-12);
    assert.equal(atomicLoadF32({ value: 3.5 }), 3.5);
    assert.match(HOLO_PHASE_ENCODE_WGSL, /complexField: array<vec2<f32>>/);
    assert.doesNotMatch(HOLO_PHASE_ENCODE_WGSL, /atomicLoad\(/);
    assert.match(HOLO_PHASE_ENCODE_ATOMIC_WGSL, /atomicLoad\(&field\[idx\]\.real\)/);
    assert.match(HOLO_PHASE_ENCODE_ATOMIC_WGSL, /atomic<f32>/);

    const polarDev = {
      features: { has: () => true },
      adapterInfo: { device: "Radeon RX 580" },
    };
    assert.equal(shouldUseFloatAtomic(polarDev, { forceFloatAtomic: true }), false);
    assert.equal(
      shouldUseFloatAtomic(
        { features: { has: (f) => f === "shader-float32-atomic" } },
        { forceFloatAtomic: true },
      ),
      true,
    );
  });
});

describe("PhaseEncode debug — real/imag (not atan2)", () => {
  const fixtureOpts = { frameWidth: 16, frameHeight: 16, holoResX: 16, holoResY: 16 };

  function padTrapPaths(cam) {
    return [
      // pixelId 16 → (0,1). 16 % 17 === 16 would write pad column if indexing were wrong.
      { pixelId: 16, opticalLength: 0, radiance: 1, weight: 1 },
      // last valid column lx=15
      { pixelId: 15, opticalLength: cam.lambda / 4, radiance: 2, weight: 1 },
      // two writers to one pixel — still one global store after the tile barrier
      { pixelId: 1, opticalLength: 0, radiance: 1, weight: 1 },
      { pixelId: 1, opticalLength: 0, radiance: 3, weight: 1 },
    ];
  }

  it("pad column 16 stays 0; flattened SoA is 272; debug pixels match field", () => {
    const cam = createHoloCamera({ resX: 16, resY: 16, lambda: 550e-9 });
    const field = createComplexField(16, 16);
    const paths = padTrapPaths(cam);
    assert.equal(16 % 17, POLAR_PAD_COLUMN);
    assert.equal(POLAR_TILE_FLAT_LEN, 272);
    assert.equal(16 * 17, 272);

    const { writers, tiles } = tiledAccumulate(field, paths, cam, fixtureOpts);
    for (let i = 0; i < writers.length; i++) assert.equal(writers[i], 1);

    assert.equal(tiles.length, 1);
    const tile = tiles[0];
    assert.equal(tile.flatLen, 272);
    assert.equal(tile.tileRealFlat.length, 272);
    assert.equal(tile.tileImagFlat.length, 272);
    const padRe = polarSoaPadColumn(tile.tileRealFlat);
    const padIm = polarSoaPadColumn(tile.tileImagFlat);
    for (let ly = 0; ly < 16; ly++) {
      assert.equal(padRe[ly], 0);
      assert.equal(padIm[ly], 0);
      assert.equal(tile.tileReal[ly][16], 0);
      assert.equal(tile.tileImag[ly][16], 0);
    }

    // trap pixel landed at (0,1), not pad
    assert.ok(field[16].real > 0);
    assert.equal(field[16].imag, 0);
    assert.ok(field[15].imag > 0);

    const debug = encodeDebugRealImag(field);
    assert.equal(DEBUG_REAL_IMAG_MAP.formula, "0.5 + 0.5 * tanh(x)");
    assert.ok(Math.abs(debug[16].r - mapBoundedField(field[16].real)) < 1e-12);
    assert.ok(Math.abs(debug[16].g - mapBoundedField(field[16].imag)) < 1e-12);
    assert.ok(Math.abs(debug[15].g - mapBoundedField(field[15].imag)) < 1e-12);
    assert.ok(Math.abs(debug[1].r - mapBoundedField(field[1].real)) < 1e-12);
    assert.ok(Math.abs(mapBoundedField(0) - 0.5) < 1e-12);
    assert.ok(mapBoundedField(-2) < 0.5);
    assert.ok(mapBoundedField(2) > 0.5);
    assert.notEqual(debug[15].r, encodePhaseOnly([field[15]])[0]);
  });

  it("gated atomic CPU model matches tiled on the same paths (linearity)", () => {
    const cam = createHoloCamera({ resX: 16, resY: 16, lambda: 550e-9 });
    const paths = padTrapPaths(cam);
    const tiledField = createComplexField(16, 16);
    const atomicField = createComplexField(16, 16);
    tiledAccumulate(tiledField, paths, cam, fixtureOpts);
    accumulateAtomic(atomicField, paths, cam, fixtureOpts);
    for (let i = 0; i < tiledField.length; i++) {
      assert.ok(Math.abs(tiledField[i].real - atomicField[i].real) < 1e-12);
      assert.ok(Math.abs(tiledField[i].imag - atomicField[i].imag) < 1e-12);
    }
    const linear = checkLinearity(paths.slice(2), cam, 0);
    assert.equal(linear.ok, true);
    const debugTiled = encodeDebugRealImag(tiledField);
    const debugAtomic = encodeDebugRealImag(atomicField, { mode: "atomic" });
    for (let i = 0; i < debugTiled.length; i++) {
      assert.ok(Math.abs(debugTiled[i].r - debugAtomic[i].r) < 1e-12);
      assert.ok(Math.abs(debugTiled[i].g - debugAtomic[i].g) < 1e-12);
    }
    assert.equal(POLAR_ATOMIC.enabledOnPolarByDefault, false);
    assert.equal(
      shouldUseFloatAtomic(
        { features: { has: () => true }, adapterInfo: { device: "Radeon RX 580" } },
        { forceFloatAtomic: true },
      ),
      false,
    );
  });

  it("declared DebugRealImag WGSL reads f32 and is not atan2 PhaseEncode", () => {
    assert.equal(DEBUG_REAL_IMAG_STATUS.cpu, "enforced");
    assert.equal(DEBUG_REAL_IMAG_STATUS.gpu, "declared");
    assert.equal(HOLORT4D_STATUS.debugRealImagCpu, "enforced");
    assert.equal(HOLORT4D_STATUS.debugRealImagGpu, "declared");
    assert.match(HOLO_DEBUG_REAL_IMAG_WGSL, /0\.5 \+ 0\.5 \* tanh/);
    assert.match(HOLO_DEBUG_REAL_IMAG_WGSL, /complexField: array<vec2<f32>>/);
    assert.match(HOLO_DEBUG_REAL_IMAG_WGSL, /@workgroup_size\(16, 16\)/);
    const debugBody = HOLO_DEBUG_REAL_IMAG_WGSL.replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(debugBody, /atan2/);
    assert.doesNotMatch(debugBody, /atomic<f32>|atomicLoad/);
    assert.match(HOLO_PHASE_ENCODE_WGSL, /atan2\(imag, real\)/);
    const rast = rasterizeDebugRealImag(
      [{ real: 2, imag: -2 }, { real: 0, imag: 0 }],
      2,
      1,
      { layout: "sideBySide", scale: 1 },
    );
    assert.equal(rast.width, 4);
    assert.equal(rast.height, 1);
    assert.ok(rast.rgba[0] > 128);
    assert.ok(rast.rgba[8] < 128);
  });

  it("dumps CPU side-by-side PNG (debug field viz, not photoreal)", () => {
    const width = 32;
    const height = 16;
    const field = createComplexField(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        field[y * width + x] = {
          real: 2 * (x / (width - 1) - 0.5),
          imag: 2 * (y / (height - 1) - 0.5),
        };
      }
    }
    const dumped = dumpDebugRealImagPng(
      field,
      width,
      height,
      join(repoRoot, "output/holort4d-debug/debug-real-imag.png"),
      { scale: 4 },
    );
    assert.equal(dumped.layout, "sideBySide");
    assert.equal(dumped.width, 256);
    assert.equal(dumped.height, 64);
    assert.ok(dumped.bytes > 0);
    assert.equal(existsSync(dumped.path), true);
    const rgb = dumpDebugRealImagPng(
      field,
      width,
      height,
      join(repoRoot, "output/holort4d-debug/debug-real-imag-rgb.png"),
      { layout: "rgb", scale: 4 },
    );
    assert.equal(rgb.layout, "rgb");
    assert.equal(rgb.width, 128);
    assert.equal(rgb.height, 64);
  });
});

describe("Step 4 — snapshot / CPF piggyback", () => {
  it("getSnapshot returns Float32Array at CPO/SPO/CPF-4D sizes", () => {
    const field = createComplexField(8, 8);
    field[0] = { real: 1, imag: 0 };
    const cpo = holort4d.getSnapshot("cpo", { field, width: 8, height: 8 });
    const spo = holort4d.getSnapshot("spo", { field, width: 8, height: 8 });
    const cpf = holort4d.getSnapshot("cpf4d", { field, width: 8, height: 8, bounceId: 1 });
    assert.equal(cpo instanceof Float32Array, true);
    assert.equal(cpo.length, SNAPSHOT_LEVELS.cpo.width * SNAPSHOT_LEVELS.cpo.height);
    assert.equal(spo.length, 256 * 256 * 2);
    assert.equal(cpf.length, 512 * 512);
    assert.equal(cpo.status, "partial");
  });

  it("CPO/SPO/CPF-4D tensors come from the hologram field", () => {
    const field = createComplexField(8, 8);
    field[0] = { real: 4, imag: 3 };
    const cpo = holort4d.getSnapshot("CPO", { field, width: 8, height: 8 });
    const spo = holort4d.getSnapshot("SPO", { field, width: 8, height: 8 });
    const cpf = holort4d.getSnapshot("CPF-4D", { field, width: 8, height: 8 });
    assert.equal(cpo.level, "CPO");
    assert.equal(spo.level, "SPO");
    assert.equal(cpf.level, "CPF-4D");
    assert.equal(cpo.length, 64 * 64);
    assert.equal(spo.length, 256 * 256 * 2);
    assert.equal(cpf.length, 512 * 512);
    assert.equal(cpo.cpuStatus, SNAPSHOT_CPU_STATUS);
    assert.ok(cpo[0] > 0);
    assert.ok(spo[0] > 0);
    assert.ok(cpf[0] > 0);
    assert.equal(cpf.meaning, "downsampled-field");

    const bounce0 = createComplexField(8, 8);
    bounce0[0] = { real: 1, imag: 0 };
    const bounce1 = createComplexField(8, 8);
    bounce1[1] = { real: 0, imag: 2 };
    const hist = holort4d.getSnapshot("CPF-4D", {
      field,
      width: 8,
      height: 8,
      history: [bounce0, bounce1],
    });
    assert.equal(hist.meaning, "bounce-evolution");
    assert.equal(hist.bounceCount, 2);
    assert.ok(hist[0] > 0);

    let published = null;
    return holort4d.publish({ publish: async (p) => (published = p) }, cpo).then((r) => {
      assert.equal(r.published, true);
      assert.equal(r.via, "publish");
      assert.equal(published.level, "CPO");
      assert.equal(r.status, "partial");
    });
  });
});

describe("Step 4 — canonical envelope (Vision Bridge)", () => {
  it("buildCanonicalEnvelope produces valid envelope with sha256 hashes", async () => {
    const { buildCanonicalEnvelope, STATUS_TAGS, CANONICAL_VERSION } = await await_import_canonical();
    const raw = {
      kind: "CPO",
      fieldId: "holort4d-test-frame-1",
      pixelGrid: { width: 8, height: 8 },
      data: new Float32Array([1, 0.5, 0, 0.25, 0.75, 0.3, 0.6, 0.1, 0.9, 0.4, 0.8, 0.2, 0.7, 0.35, 0.55, 0.15, 0.85, 0.45, 0.65, 0.05, 0.95, 0.28, 0.72, 0.38, 0.58, 0.18, 0.88, 0.48, 0.68, 0.08, 0.92, 0.22, 0.78, 0.32, 0.52, 0.12, 0.82, 0.42, 0.62, 0.02, 0.98, 0.25, 0.75, 0.35, 0.55, 0.15, 0.85, 0.45, 0.65, 0.05, 0.95, 0.28, 0.72, 0.38, 0.58, 0.18, 0.88, 0.48, 0.68, 0.08, 0.92, 0.22, 0.78, 0.32]),
      palette: null,
    };
    const env = buildCanonicalEnvelope(raw, {
      briefId: "art-direction-2026",
      waveFieldId: "holort4d-human-frame-1",
      pipelineStage: "vision-bridge",
    });
    assert.equal(env.protocol, "CPO");
    assert.equal(env.version, CANONICAL_VERSION);
    assert.equal(env.version, "1.0.0");
    assert.equal(env.fieldId, "holort4d-test-frame-1");
    assert.equal(env.grid.width, 8);
    assert.equal(env.grid.height, 8);
    assert.equal(env.payload.layout, "row-major");
    assert.equal(env.payload.channels, 1);
    assert.equal(env.status.tag, STATUS_TAGS.PUBLISHED);
    assert.equal(typeof env.hashes.dataHash, "string");
    assert.equal(env.hashes.dataHash.length, 64);
    assert.equal(typeof env.hashes.envelopeHash, "string");
    assert.equal(env.hashes.envelopeHash.length, 64);
    assert.equal(env.provenance.briefId, "art-direction-2026");
    assert.equal(env.provenance.waveFieldId, "holort4d-human-frame-1");
    assert.equal(env.provenance.pipelineStage, "vision-bridge");
    assert.equal(env.provenance.source, "vision-bridge");
  });

  it("buildCanonicalEnvelope rejects missing kind or non-Float32Array data", async () => {
    const { buildCanonicalEnvelope } = await await_import_canonical();
    assert.throws(() => buildCanonicalEnvelope(null, {}), /snapshot required/);
    assert.throws(
      () => buildCanonicalEnvelope({ kind: "CPO", fieldId: "x", pixelGrid: { width: 1, height: 1 }, data: [] }, {}),
      /Float32Array/,
    );
    assert.throws(
      () => buildCanonicalEnvelope({ fieldId: "x", pixelGrid: { width: 1, height: 1 }, data: new Float32Array(1) }, {}),
      /snapshot\.kind required/,
    );
  });

  it("buildCPOEnvelope wraps snapshot.js Float32Array in canonical envelope", async () => {
    const { buildCPOEnvelope, CANONICAL_VERSION } = await await_import_canonical();
    const cpo = holort4d.getSnapshot("CPO", {
      field: [{ real: 4, imag: 3 }],
      width: 1,
      height: 1,
    });
    const env = buildCPOEnvelope(cpo, { briefId: "test-brief", waveFieldId: "test-field" });
    assert.equal(env.protocol, "CPO");
    assert.equal(env.version, CANONICAL_VERSION);
    assert.equal(env.grid.width, 64);
    assert.equal(env.grid.height, 64);
    assert.ok(env.hashes.dataHash.length === 64);
    assert.ok(env.hashes.envelopeHash.length === 64);
    assert.equal(env.provenance.briefId, "test-brief");
    assert.equal(env.provenance.waveFieldId, "test-field");
  });

  it("buildCPF4DEnvelope wraps bounce-history snapshot with nx/ny/nz/nt", async () => {
    const { buildCPF4DEnvelope, CANONICAL_VERSION } = await await_import_canonical();
    const cpf = holort4d.getSnapshot("CPF-4D", {
      field: [{ real: 1, imag: 0 }],
      width: 1,
      height: 1,
      history: [
        [{ real: 1, imag: 0 }],
        [{ real: 0, imag: 1 }],
      ],
    });
    const env = buildCPF4DEnvelope(cpf, { briefId: "test", waveFieldId: "test" });
    assert.equal(env.protocol, "CPF-4D");
    assert.equal(env.version, CANONICAL_VERSION);
    assert.equal(env.type, "field-4d");
    assert.equal(env.payload.nx, 512);
    assert.equal(env.payload.ny, 512);
    assert.equal(env.payload.nz, 1);
    assert.equal(env.payload.nt, 2);
    assert.equal(typeof env.payload.fields.amplitude.hash, "string");
    assert.equal(env.payload_hash.length, 64);
  });

  it("dataHash changes when Float32Array content changes", async () => {
    const { buildCanonicalEnvelope } = await await_import_canonical();
    const base = { kind: "CPO", fieldId: "f", pixelGrid: { width: 2, height: 1 }, palette: null };
    const a = buildCanonicalEnvelope({ ...base, data: new Float32Array([1, 2]) }, { briefId: "b", waveFieldId: "w", pipelineStage: "vision-bridge" });
    const b = buildCanonicalEnvelope({ ...base, data: new Float32Array([1, 3]) }, { briefId: "b", waveFieldId: "w", pipelineStage: "vision-bridge" });
    assert.notEqual(a.hashes.dataHash, b.hashes.dataHash);
    assert.notEqual(a.hashes.envelopeHash, b.hashes.envelopeHash);
  });

  it("dataHash is deterministic for same inputs", async () => {
    const { buildCanonicalEnvelope } = await await_import_canonical();
    const snap = { kind: "CPO", fieldId: "f", pixelGrid: { width: 2, height: 1 }, data: new Float32Array([1, 2]), palette: null };
    const a = buildCanonicalEnvelope(snap, { briefId: "b", waveFieldId: "w", pipelineStage: "vision-bridge" });
    const b = buildCanonicalEnvelope(snap, { briefId: "b", waveFieldId: "w", pipelineStage: "vision-bridge" });
    assert.equal(a.hashes.dataHash, b.hashes.dataHash);
    // envelopeHash may differ when provenance.createdAt differs between calls
  });

  it("buildArtDirectionProvenance returns brief-section-10 shape", async () => {
    const { buildArtDirectionProvenance } = await await_import_canonical();
    const prov = buildArtDirectionProvenance({ intent: "human-frame", engine: "holort4d-cpu", samples: 8 });
    assert.equal(prov.intent, "human-frame");
    assert.equal(prov.honest.holort4d, "wave-optics");
    assert.equal(prov.honest.sdTurbo, "did-not-run");
    assert.equal(prov.honest.photoreal, "not-claimed");
    assert.ok(prov.lighting.key.length > 0);
    assert.ok(prov.lighting.fill.length > 0);
    assert.equal(prov.visuals.engine, "holort4d-cpu");
    assert.equal(prov.visuals.samples, 8);
  });

  it("publishSnapshot carries canonical envelope in payload", async () => {
    const cpo = holort4d.getSnapshot("CPO", {
      field: [{ real: 1, imag: 0 }],
      width: 1,
      height: 1,
    });
    let published = null;
    const r = await holort4d.publish({ publish: async (p) => (published = p) }, cpo);
    assert.equal(r.published, true);
    assert.ok(published.canonical !== null);
    assert.equal(published.canonical.protocol, "CPO");
    assert.equal(published.canonical.version, "1.0.0");
    assert.ok(published.canonical.hashes.dataHash.length === 64);
    assert.ok(published.canonical.hashes.envelopeHash.length === 64);
  });
});

describe("Face rig → Turbo control", () => {
  it("ARKIT_BLENDSHAPE_NAMES has 52 channels", () => {
    assert.equal(ARKIT_BLENDSHAPE_NAMES.length, 52);
    assert.ok(ARKIT_BLENDSHAPE_NAMES.includes("jawOpen"));
    assert.ok(ARKIT_BLENDSHAPE_NAMES.includes("eyeBlinkLeft"));
  });

  it("buildFaceRigSnapshot produces CPF-4D RawSnapshot with 58 floats", () => {
    const rig = createDefaultFaceRig("test-field");
    const snap = buildFaceRigSnapshot(rig, 512, 512);
    assert.equal(snap.kind, "CPF-4D");
    assert.equal(snap.fieldId, "test-field");
    assert.equal(snap.data.length, FACE_RIG_FLOAT_COUNT);
    assert.equal(snap.width, 512);
    assert.equal(snap.height, 512);
    assert.equal(snap.meaning, "face-rig-blendshapes");
    assert.ok(snap.data instanceof Float32Array);
  });

  it("packFaceRigFloats embeds headPos and headRot after 52 blendshapes", () => {
    const rig = createDefaultFaceRig();
    rig.headPos = { x: 1, y: 2, z: 3 };
    rig.headRot = { x: 0.1, y: 0.2, z: 0.3 };
    const packed = packFaceRigFloats(rig);
    assert.equal(packed.length, 58);
    assert.equal(packed[52], 1);
    assert.equal(packed[53], 2);
    assert.equal(packed[54], 3);
    assert.ok(Math.abs(packed[55] - 0.1) < 1e-6);
    assert.ok(Math.abs(packed[56] - 0.2) < 1e-6);
    assert.ok(Math.abs(packed[57] - 0.3) < 1e-6);
  });

  it("projectLandmarksFromRig returns 68 pixel landmarks inside frame", () => {
    const rig = createDefaultFaceRig();
    const lms = projectLandmarksFromRig(rig, 512, 512);
    assert.equal(lms.length, LANDMARK_COUNT);
    for (const lm of lms) {
      assert.ok(lm.x >= 0 && lm.x < 512, `landmark ${lm.index} x=${lm.x}`);
      assert.ok(lm.y >= 0 && lm.y < 512, `landmark ${lm.index} y=${lm.y}`);
    }
  });

  it("renderRigWithNumbers returns RGBA + PNG with topology colors and control hash", () => {
    const rig = createDefaultFaceRig();
    const out = renderRigWithNumbers(rig, 512, 512);
    assert.equal(out.width, 512);
    assert.equal(out.height, 512);
    assert.equal(out.rgba.length, 512 * 512 * 4);
    assert.ok(out.png.length > 100);
    assert.equal(out.controlHash.length, 64);
    assert.equal(out.rgba[0], 255);
    let nonWhite = 0;
    for (let i = 0; i < out.rgba.length; i += 4) {
      if (out.rgba[i] !== 255 || out.rgba[i + 1] !== 255 || out.rgba[i + 2] !== 255) nonWhite += 1;
    }
    assert.ok(nonWhite > 50, "expected bone edges, landmark dots, and labels");
  });

  it("formatControlBarText emits pipe-separated ARKit blendshape values", () => {
    const rig = createDefaultFaceRig();
    const text = formatControlBarText(rig);
    assert.match(text, /^jawOpen:0\.18 \| mouthClose:0\.00 \| eyeBlinkLeft:0\.12$/);
  });

  it("buildFaceRigEnvelopes wires canonical + CPF-4D with control hash", () => {
    const rig = createDefaultFaceRig("env-test");
    const maps = renderAllTurboControls(rig, 64, 64);
    const env = buildFaceRigEnvelopes(rig, {
      width: 64,
      height: 64,
      rigState: maps.state,
      topologyHash: maps.topology.controlHash,
      depthHash: maps.depth.controlHash,
      flowHash: maps.flow.controlHash,
    });
    assert.equal(env.canonical.protocol, "CPF-4D");
    assert.equal(env.cpf4d.protocol, "CPF-4D");
    assert.equal(env.provenance.controlMaps.topology, maps.topology.controlHash);
    assert.equal(env.provenance.rigHash.length, 64);
    assert.equal(FACE_RIG_CONTROL_STATUS.snapshot, "enforced");
    assert.equal(FACE_RIG_CONTROL_STATUS.depthMap, "enforced");
    assert.equal(FACE_RIG_CONTROL_STATUS.secondPass, "declared");
  });

  it("buildFaceRigState produces Landmark3D with non-zero z", () => {
    const rig = createDefaultFaceRig();
    const state = buildFaceRigState(rig, { width: 128, height: 128 });
    assert.equal(state.landmarks.length, LANDMARK_COUNT);
    const nonZeroZ = state.landmarks.filter((lm) => Math.abs(lm.z) > 1e-6);
    assert.ok(nonZeroZ.length >= 20, "nose/mouth/eyes should carry template z depth");
    for (const lm of state.landmarks) {
      assert.ok(lm.bone.length > 0);
      assert.ok(Array.isArray(lm.controls) && lm.controls.length > 0);
    }
  });

  it("LANDMARK_TO_CONTROL covers all 68 landmarks", () => {
    const { covered, total } = landmarkControlCoverage();
    assert.equal(covered, 68);
    assert.equal(total, LANDMARK_COUNT);
    assert.ok(LANDMARK_TO_CONTROL[0].includes("jawOpen"));
    assert.ok(LANDMARK_TO_CONTROL[48].includes("mouthClose"));
  });

  it("renderDepthMap grayscale varies with landmark z", () => {
    const rigNear = createDefaultFaceRig("near");
    rigNear.headPos = { x: 0, y: 0, z: 0 };
    const rigFar = createDefaultFaceRig("far");
    rigFar.headPos = { x: 0, y: 0, z: 0.4 };
    const stateNear = buildFaceRigState(rigNear, { width: 64, height: 64 });
    const stateFar = buildFaceRigState(rigFar, { width: 64, height: 64 });
    const near = renderDepthMap(stateNear, 64, 64);
    const far = renderDepthMap(stateFar, 64, 64);
    assert.notEqual(near.controlHash, far.controlHash);
    assert.ok(far.maxZ > near.maxZ || far.minZ !== near.minZ);
  });

  it("renderAllTurboControls emits depth, topology, flow PNGs", () => {
    const rig = createDefaultFaceRig();
    const all = renderAllTurboControls(rig, 64, 64);
    assert.ok(all.depth.png.length > 50);
    assert.ok(all.topology.png.length > 50);
    assert.ok(all.flow.png.length > 50);
    assert.notEqual(all.depth.controlHash, all.topology.controlHash);
    assert.equal(all.state.landmarks.length, 68);
  });

  it("renderFlow produces neutral gray when no prev landmarks", () => {
    const rig = createDefaultFaceRig();
    const state = buildFaceRigState(rig, { width: 32, height: 32 });
    const flow = renderFlow(state, 32, 32);
    assert.equal(flow.rgba[0], 128);
    assert.equal(flow.rgba[1], 128);
    assert.equal(flow.rgba[2], 0);
  });

  it("eye landmarks are right-side up and symmetric (projected screen space)", () => {
    const rig = createDefaultFaceRig();
    const px = projectLandmarksFromRig(rig, 512, 512);
    const byId = Object.fromEntries(px.map((p) => [p.index, p]));

    const upperR = Math.min(byId[37].y, byId[38].y);
    const lowerR = Math.max(byId[40].y, byId[41].y);
    const upperL = Math.min(byId[43].y, byId[44].y);
    const lowerL = Math.max(byId[46].y, byId[47].y);
    assert.ok(upperR < lowerR, "right eye upper lid should be above lower lid on screen");
    assert.ok(upperL < lowerL, "left eye upper lid should be above lower lid on screen");

    const state = buildFaceRigState(rig);
    const innerR = state.landmarks[39];
    const innerL = state.landmarks[45];
    const outerR = state.landmarks[36];
    const outerL = state.landmarks[42];
    const nose = state.landmarks[30];
    assert.ok(Math.abs(innerR.x) < Math.abs(outerR.x), "right inner corner closer to nose than outer");
    assert.ok(Math.abs(innerL.x) < Math.abs(outerL.x), "left inner corner closer to nose than outer");
    assert.ok(Math.abs(nose.x) < 0.02, "nose tip centered on x");
    assert.ok(Math.abs(innerR.x + innerL.x) < 0.02, "inner eye corners symmetric about midline");
    assert.ok(Math.abs(outerR.x + outerL.x) < 0.02, "outer eye corners symmetric about midline");
  });
});

async function await_import_canonical() {
  const mod = await import("./canonical.js");
  return mod;
}

describe("Step 5 — CIEMS trail + Jarvis", () => {
  it("attaches Authority→…→Audit with TileHeaders + complexField hashes", () => {
    const field = [{ real: 1, imag: 0 }, { real: 0, imag: 1 }];
    const headers = tileHeadersFromCounts([2, 1]);
    const attached = attachCiemsTrail(
      { name: "holo-pass", paths: [{ pixelId: 0, opticalLength: 1 }] },
      { headers, field },
    );
    for (const stage of CIEMS_TRAIL_STAGES) {
      assert.ok(attached.ciems[stage], `missing trail stage ${stage}`);
    }
    assert.equal(typeof attached.ciems.evidence.tileHeadersHash, "string");
    assert.equal(typeof attached.ciems.evidence.complexFieldHash, "string");
    assert.equal(attached.ciems.evidence.tileHeadersHash, hashTileHeaders(headers));
    assert.equal(attached.ciems.evidence.complexFieldHash, hashComplexField(field));
    assert.equal(attached.ciems.evidence.tileHeadersHash.length, 64);
    assert.throws(
      () => attachCiemsTrail({ name: "empty" }, {}),
      /reject-without-evidence/,
    );
    assert.throws(
      () => attachCiemsTrail({ paths: [{ radiance: 1 }] }, { headers, field }),
      PathSampleUnreadyError,
    );
  });

  it("Jarvis POST is skipped once if memoryboard is down", async () => {
    const field = [{ real: 1, imag: 0 }];
    const headers = tileHeadersFromCounts([1]);
    const snap = holort4d.getSnapshot("CPO", { field, width: 1, height: 1 });
    const trail = attachCiemsTrail({ name: "sample", paths: [{ pixelId: 0, opticalLength: 0 }] }, { headers, field });
    const posted = await postCiemsMemory(trail, {
      snapshot: snap,
      url: "http://127.0.0.1:8001",
      session_id: "holort4d-ciems-2026-08-22",
    });
    assert.ok("level" in posted.body && "hash" in posted.body && "perceptualFeatures" in posted.body);
    assert.ok(posted.posted === true || posted.skipped === true);
  });
});

describe("HoloRT4D regression — packing, Polar tile, snapshots, handoff", () => {
  it("PathSample u32 fields at 52–63 are little-endian, not f32 aliases", () => {
    const slot = createPathSampleView();
    writePathFinalize(slot, { opticalLength: 1.25, pixelId: 7, bounceId: 2 });
    assert.notEqual(slot.f32[13], 7);
    assert.equal(slot.view.getUint32(52, true), 7);
    assert.equal(slot.view.getUint32(56, true), 2);
    const packed = packPathSample({ opticalLength: 1.25, pixelId: 0x3f800000, bounceId: 9 });
    const view = new DataView(packed.buffer, packed.byteOffset, PATH_SAMPLE_BYTE_SIZE);
    assert.equal(view.getUint32(52, true), 0x3f800000);
    assert.equal(view.getFloat32(52, true), 1);
    assert.equal(view.getUint32(56, true), 9);
    assert.equal(view.getFloat32(48, true), 1.25);
  });

  it("exclusive prefix-sum + grid counts match 1-path-per-pixel BinPaths; count starts at 0", () => {
    assert.deepEqual(prefixSumOffsets([2, 0, 3, 1]), [0, 2, 2, 5]);
    const opts = { frameWidth: 32, frameHeight: 32, holoResX: 32, holoResY: 32 };
    const counts = tileCountsFromAlignedGrid(opts);
    assert.equal(counts.length, 4);
    assert.equal(counts[0], 256);
    assert.equal(counts.reduce((a, c) => a + c, 0), 32 * 32);
    const headers = tileHeadersFromCounts(counts);
    assert.equal(headers[0].count, 0);
    assert.equal(headers[1].offset, 256);
    const paths = [];
    for (let i = 0; i < 32 * 32; i++) paths.push({ pixelId: i, opticalLength: 0 });
    const bins = binPaths(paths, opts);
    assert.deepEqual(bins.headers.map((h) => h.count), counts);
  });

  it("BinPaths WGSL bounds to pathCount, not oversized buffer length", () => {
    assert.match(HOLO_BIN_PATHS_WGSL, /pathCount: u32/);
    assert.match(HOLO_BIN_PATHS_WGSL, /idx >= params\.pathCount/);
    assert.match(HOLO_ACCUMULATE_ATOMIC_WGSL, /idx >= params\.pathCount/);
    const gpu = new HoloRT4DGPURenderer(null, { holoResX: 32, holoResY: 32 });
    const dispatched = gpu.dispatch(null, null, {
      paths: [{ pixelId: 0, opticalLength: 1, radiance: 1, weight: 1 }],
    });
    assert.equal(dispatched.pathCount, 1);
    const grid = gpu.dispatch(null, { frameParamsBuffer: {} }, { frameWidth: 32, frameHeight: 32 });
    assert.equal(grid.pathCount, 32 * 32);
    assert.equal(grid.prefixSumOffsets.length, 4);
    assert.ok(grid.prefixSumOffsets.some((o, i, arr) => i === 0 || o >= arr[i - 1]));
  });

  it("TiledAccumulate WGSL uses flattened stride-17 shared mem; pad column 16 is not a pixel", () => {
    assert.match(HOLO_TILED_ACCUMULATE_WGSL, /array<f32, 272>/);
    assert.match(HOLO_TILED_ACCUMULATE_WGSL, /ly \* 17u \+ lx/);
    assert.doesNotMatch(HOLO_TILED_ACCUMULATE_WGSL, /array<array<f32,\s*17>,\s*16>/);
    assert.match(HOLO_TILED_ACCUMULATE_WGSL, /Never write lx==16/);
    assert.equal(16 * 17, 272);
  });

  it("RT4D onPathFinalize is after the bounce loop, not inside it", () => {
    const src = readFileSync(join(repoRoot, "mrs/packages/renderer-core/src/render/rt4d/gpu/RT4DGPURenderer.js"), "utf8");
    const bounce = src.indexOf("for (let depth = 1; depth < maxDepth; depth++)");
    const after = src.indexOf("// PathFinalize (HoloRT4D): once AFTER the bounce loop");
    assert.ok(bounce >= 0 && after > bounce);
    assert.equal((src.slice(bounce, after).match(/onPathFinalize/g) || []).length, 0);
    assert.match(src, /frameParamsBuffer: this\._frameParamsBuffer/);
    assert.match(src, /rayOrigins: this\._rayBuffers\.rayOrigins/);
    assert.match(HOLO_PATH_FINALIZE_WGSL, /u32\(frame\.maxDepth\) - 1u/);
    assert.doesNotMatch(HOLO_PATH_FINALIZE_WGSL, /pathFinalize\([^)]+0u\)/);
    const nested = rt4dBuffersFromHandoff({
      rayBuffers: { rayOrigins: "o", rayDirs: "d", hits: "h", pathThroughput: "t" },
    });
    assert.equal(nested.rayOrigins, "o");
    assert.equal(nested.hits, "h");
    assert.equal(nested.frameParamsBuffer, null);
  });

  it("zero-size snapshot grids do not divide-by-zero; Polar names stay off float atomics", () => {
    const empty = holort4d.getSnapshot("CPO", { field: [], width: 0, height: 0 });
    assert.equal(empty.length, 64 * 64);
    assert.ok(Number.isFinite(empty[0]));
    const spo = holort4d.getSnapshot("SPO", { field: [], width: 0, height: 0 });
    assert.equal(spo.length, 256 * 256 * 2);
    assert.equal(spo[1], 0);
    const polar = { features: { has: () => true }, adapterInfo: { device: "gfx803" } };
    assert.equal(isPolarDevice(polar), true);
    assert.equal(shouldUseFloatAtomic(polar, { forceFloatAtomic: true }), false);
    assert.equal(isPolarDevice({ adapterInfo: { architecture: "gcn-4" } }), true);
  });
});

describe("Depth reconstruct — pixelId / opticalLength lock", () => {
  const frameOpts = { frameWidth: 32, frameHeight: 32, holoResX: 32, holoResY: 32 };

  function syntheticTunnelPaths(w, h) {
    const paths = [];
    const cx = Math.trunc(w / 2);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const pixelId = y * w + x;
        const inSubject = Math.abs(x - cx) <= 2 && y > h * 0.25 && y < h * 0.85;
        paths.push({
          pixelId,
          opticalLength: inSubject ? 1.2 : 3.5,
          radiance: 1,
          weight: 1,
          wl: 550e-9,
        });
      }
    }
    return paths;
  }

  it("validatePixelIdRoundtrip: pixelId = py*width+px at same res", () => {
    const paths = syntheticTunnelPaths(16, 16);
    const rt = validatePixelIdRoundtrip(paths, {
      frameWidth: 16,
      frameHeight: 16,
      holoResX: 16,
      holoResY: 16,
    });
    assert.equal(rt.ok, true);
    assert.equal(rt.checked, 256);
  });

  it("scatterOpticalLength preserves tunnel: near subject, far background", () => {
    const paths = syntheticTunnelPaths(32, 32);
    const { depth } = scatterOpticalLength(paths, frameOpts);
    const tunnel = analyzeTunnelBehindSubject(depth, {
      holoResX: 32,
      holoResY: 32,
      subjectThreshold: 2.0,
      backgroundMin: 3.0,
    });
    assert.ok(tunnel.hasTunnel);
    assert.ok(tunnel.subjectColumns >= 3);
    assert.ok(tunnel.tunnelPixels > 0);
  });

  it("depth + opticalLength → PhaseEncode roundtrip agrees with traced depth", () => {
    const cam = createHoloCamera({ resX: 32, resY: 32, width: 32, height: 32, lambda: 550e-9 });
    const paths = syntheticTunnelPaths(32, 32);
    const { depth } = scatterOpticalLength(paths, frameOpts);
    const field = depthToComplexField(depth, cam.lambda);
    const phases = encodePhaseOnly(field, { mode: "tiled" });
    const agreement = phaseDepthAgreement(phases, depth, cam.lambda);
    assert.ok(agreement.ratio > 0.99, `phase-depth ratio=${agreement.ratio}`);
  });

  it("tile-mod wrong scatter correlates worse than correct map", () => {
    const paths = syntheticTunnelPaths(32, 32);
    const { depth: correct } = scatterOpticalLength(paths, frameOpts);
    const wrong = scatterOpticalLengthTileModWrong(paths, 32, 32);
    const corrCorrect = depthCorrelation(correct, correct);
    const corrWrong = depthCorrelation(correct, wrong);
    assert.equal(corrCorrect.r, 1);
    assert.ok(corrWrong.r < 0.85, `wrong map r=${corrWrong.r} should be < 0.85`);
  });

  it("verifyDepthScatterRoundtrip: opticalLength lands at pixelId holo index", () => {
    const paths = syntheticTunnelPaths(16, 16);
    const rt = verifyDepthScatterRoundtrip(paths, {
      frameWidth: 16,
      frameHeight: 16,
      holoResX: 16,
      holoResY: 16,
    });
    assert.equal(rt.ok, true);
    assert.equal(rt.matched, 256);
  });

  it("scorePixelIdMapping PASS on synthetic tunnel scene", () => {
    const cam = createHoloCamera({ resX: 32, resY: 32, width: 32, height: 32, lambda: 550e-9 });
    const paths = syntheticTunnelPaths(32, 32);
    const score = scorePixelIdMapping(paths, cam, {
      ...frameOpts,
      subjectThreshold: 2.0,
      backgroundMin: 3.0,
    });
    assert.equal(score.pass, true);
    assert.equal(score.roundtrip.ok, true);
    assert.ok(score.depthPhaseAgreement.ratio > 0.99);
  });

  it("PathSample finalize roundtrip: pack opticalLength + pixelId at offsets 48–55", () => {
    const slot = createPathSampleView();
    writePathFinalize(slot, { opticalLength: 2.75, pixelId: pixelIdFromRaygen(4, 3, 16), bounceId: 1 });
    const sample = readPathSample(slot);
    assert.equal(sample.opticalLength, 2.75);
    assert.equal(sample.pixelId, 3 * 16 + 4);
    const { px, py } = pixelXYFromPixelId(sample.pixelId, 16);
    assert.equal(px, 4);
    assert.equal(py, 3);
  });

  it("DEPTH_RECONSTRUCT_STATUS is CPU enforced", () => {
    assert.equal(DEPTH_RECONSTRUCT_STATUS.cpu, "enforced");
    assert.equal(DEPTH_RECONSTRUCT_STATUS.gpu, "declared");
  });
});

describe("SimulationChamber — record / replay / canonical tape", () => {
  it("SIMULATION_CHAMBER_STATUS tags are honest", () => {
    assert.equal(SIMULATION_CHAMBER_STATUS.record, "enforced");
    assert.equal(SIMULATION_CHAMBER_STATUS.replay, "enforced");
    assert.equal(SIMULATION_CHAMBER_STATUS.integrateBones, "partial");
    assert.equal(SIMULATION_CHAMBER_STATUS.sdTurboLoop, "declared");
  });

  it("integrateBones adjusts jaw bone from jawOpen blendshape", () => {
    const rig = createDefaultFaceRig("integrate-test");
    const state = buildFaceRigState(rig, { width: 64, height: 64, dt: 1 / 24 });
    const jawBefore = state.bones.find((b) => b.name === "jaw");
    const rotBefore = jawBefore?.rot?.x ?? 0;
    rig.blendshapes[ARKIT_BLENDSHAPE_NAMES.indexOf("jawOpen")] = 0.5;
    state.blendshapes = rig.blendshapes;
    integrateBones(state, 1 / 24);
    const jawAfter = state.bones.find((b) => b.name === "jaw");
    assert.ok((jawAfter?.rot?.x ?? 0) !== rotBefore || jawAfter?.pos?.y !== jawBefore?.pos?.y);
  });

  it("tracePathsFromRigState produces PathSamples with opticalLength and pixelId", () => {
    const rig = createDefaultFaceRig("trace-test");
    const state = buildFaceRigState(rig, { width: 64, height: 64, dt: 1 / 24 });
    const paths = tracePathsFromRigState(state, { width: 64, height: 64 });
    assert.ok(paths.length >= LANDMARK_COUNT);
    for (const p of paths) {
      assert.ok(Number.isFinite(p.opticalLength));
      assert.ok(p.opticalLength > 0);
      assert.ok(Number.isInteger(p.pixelId));
      assert.ok(p.pixelId >= 0 && p.pixelId < 64 * 64);
    }
  });

  it("zToOpticalLength preserves depth ordering", () => {
    const near = zToOpticalLength(0.14);
    const far = zToOpticalLength(-0.1);
    assert.ok(near > far, "near z should yield larger opticalLength");
  });

  it("record→replay produces deterministic tape hash with envelopeHash on every frame", () => {
    const tmpDir = join(repoRoot, "output/chamber-tape-test");
    const { tape, replay, tapeHash } = recordDeterministicTape({
      width: 64,
      height: 64,
      frames: 8,
      dt: 1 / 24,
      outDir: tmpDir,
    });
    assert.equal(tape.length, 8);
    for (const frame of tape) {
      assert.ok(frame.envelope?.hashes?.envelopeHash?.length === 64);
      assert.ok(frame.envelope?.hashes?.dataHash?.length === 64);
      assert.ok(frame.bufferRefs?.landmarkZHash?.length === 64);
    }
    assert.equal(replay.ok, true);
    assert.ok(tapeHash.length === 64);

    // Content hashes (dataHash + landmarkZ) are deterministic; envelopeHash includes createdAt ISO stamp
    const stableHash = hashJson(
      tape.map((f) => ({
        dataHash: f.envelope?.hashes?.dataHash,
        landmarkZHash: f.bufferRefs?.landmarkZHash,
      })),
    );
    const second = recordDeterministicTape({
      width: 64,
      height: 64,
      frames: 8,
      dt: 1 / 24,
      outDir: null,
    });
    const secondStable = hashJson(
      second.tape.map((f) => ({
        dataHash: f.envelope?.hashes?.dataHash,
        landmarkZHash: f.bufferRefs?.landmarkZHash,
      })),
    );
    assert.equal(secondStable, stableHash, "same inputs → same content hashes");
    assert.equal(second.replay.ok, true);
  });

  it("landmark z preserved in tape buffer refs", () => {
    const rig = createDefaultFaceRig("z-preserve");
    const chamber = new SimulationChamber({ rig, width: 64, height: 64, dt: 1 / 24 });
    chamber.record(true);
    chamber.update(1 / 24);
    chamber.stop();
    const frame = chamber.tape[0];
    const zs = chamber.state.landmarks.map((lm) => lm.z);
    assert.ok(zs.some((z) => z !== 0), "expected non-zero landmark z depth");
    assert.equal(frame.bufferRefs.landmarkZHash, hashFloat32Array(new Float32Array(zs)));
  });

  it("SimulationChamber.update returns CPF-4D envelope with protocol field", () => {
    const chamber = new SimulationChamber({ width: 64, height: 64, dt: 1 / 24 });
    const step = chamber.update(1 / 24);
    assert.equal(step.envelope.protocol, "CPF-4D");
    assert.ok(step.paths.length > 0);
    assert.ok(step.cpfField instanceof Float32Array);
  });
});

describe("ChamberStudioBeat — Story Forge 2-actor studio tape", () => {
  it("CHAMBER_STUDIO_BEAT_STATUS tags are honest", () => {
    assert.equal(CHAMBER_STUDIO_BEAT_STATUS.record, "enforced");
    assert.equal(CHAMBER_STUDIO_BEAT_STATUS.replay, "enforced");
    assert.equal(CHAMBER_STUDIO_BEAT_STATUS.beatJson, "partial");
  });

  it("records 72 envelopes with 2 actors and replays from hash/bufferRef only", () => {
    const beatPath = join(
      repoRoot,
      "mrs/adapters/storyforge-boundary/contract/beats/studio-two-face-beat.json",
    );
    const tmpDir = join(repoRoot, "output/chamber-studio-beat-test");
    const { tape, replay, saved } = recordStudioBeat({
      beatPath,
      width: 64,
      height: 64,
      frames: 72,
      dt: 1 / 24,
      outDir: tmpDir,
    });

    assert.equal(tape.length, 72);
    for (const frame of tape) {
      assert.equal(frame.beat.actorCount, 2);
      assert.equal(frame.beat.actorFieldIds.length, 2);
      assert.ok(frame.envelope?.hashes?.envelopeHash?.length === 64);
      assert.ok(frame.actors.length === 2);
      for (const actor of frame.actors) {
        assert.ok(actor.bufferRefs?.landmarkZHash?.length === 64);
      }
    }

    assert.equal(replay.ok, true);
    assert.equal(replay.frameCount, 72);

    const disk = replayTapeFromDisk(saved.tapePath);
    assert.equal(disk.replay.ok, true);
    assert.equal(disk.manifest.storyForge.actorCount, 2);
  });

  it("deterministic simulation hashes for same beat inputs", () => {
    const beatPath = join(
      repoRoot,
      "mrs/adapters/storyforge-boundary/contract/beats/studio-two-face-beat.json",
    );
    const a = recordStudioBeat({ beatPath, width: 64, height: 64, frames: 8, outDir: null });
    const b = recordStudioBeat({ beatPath, width: 64, height: 64, frames: 8, outDir: null });
    const simHash = (tape) =>
      hashJson(
        tape.map((f) => ({
          frameIndex: f.frameIndex,
          cpf4dHash: f.bufferRefs?.cpf4dHash,
          actors: (f.actors ?? []).map((act) => act.bufferRefs?.landmarkZHash),
        })),
      );
    assert.equal(simHash(a.tape), simHash(b.tape), "same beat physics → same buffer hashes");
  });

  it("interpolateTrack blinks actor-b at midpoint", () => {
    const beatPath = join(
      repoRoot,
      "mrs/adapters/storyforge-boundary/contract/beats/studio-two-face-beat.json",
    );
    const beat = loadStoryForgeBeat(beatPath);
    const warden = beat.actors.find((a) => a.fieldId === "actor-b-warden");
    const blinkTrack = warden.tracks.find((t) => t.blendshape === "eyeBlinkLeft");
    assert.equal(interpolateTrack(blinkTrack.keyframes, 34), 0);
    assert.equal(interpolateTrack(blinkTrack.keyframes, 36), 1);
    assert.equal(interpolateTrack(blinkTrack.keyframes, 38), 0);
  });
});

describe("RenderView — chamber truth vs projection skin", () => {
  it("RENDER_VIEW_STATUS tags are honest", () => {
    assert.equal(RENDER_VIEW_STATUS.physical, "enforced");
    assert.equal(RENDER_VIEW_STATUS.animeLut, "partial");
    assert.equal(RENDER_VIEW_STATUS.chamberImmutable, "enforced");
  });

  it("applyToonLUT produces banded output distinct from linear phase", () => {
    const linear = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85];
    const toon = applyToonLUT(linear, { bands: 4, ramp: "cel" });
    assert.notDeepEqual(toon, linear);
    assert.equal(toon.filter((v, i, a) => a.indexOf(v) === i).length <= 4, true);
    assert.ok(toon.every((v) => v >= 0 && v <= 1));
  });

  it("anime view config has expected prompt defaults", () => {
    assert.equal(ANIME_VIEW_CONFIG.prompt, DEFAULT_ANIME_PROMPT);
    assert.ok(DEFAULT_ANIME_PROMPT.includes("anime"));
    assert.ok(DEFAULT_ANIME_PROMPT.includes("cel shading"));
    assert.equal(ANIME_VIEW_CONFIG.initMap, "depth");
  });

  it("RenderView does not mutate chamber state on project", () => {
    const chamber = new SimulationChamber({ width: 32, height: 32, dt: 1 / 24 });
    chamber.record(true);
    const step = chamber.update(1 / 24);
    chamber.stop();

    const zBefore = chamber.state.landmarks.map((lm) => lm.z);
    const blendBefore = Float32Array.from(chamber.state.blendshapes);
    const tapeLenBefore = chamber.tape.length;

    const input = {
      width: 32,
      height: 32,
      field: step.field,
      envelopeHash: step.envelope?.hashes?.envelopeHash,
    };

    const view = createRenderView({ mode: "physical" });
    view.project(input, { mode: "physical" });
    view.project(input, { mode: "anime" });

    assert.deepEqual(chamber.state.landmarks.map((lm) => lm.z), zBefore);
    assert.deepEqual(Array.from(chamber.state.blendshapes), Array.from(blendBefore));
    assert.equal(chamber.tape.length, tapeLenBefore);
  });

  it("physical and anime modes share envelopeHash but differ in PNG bytes", () => {
    const amplitude = new Float32Array(10);
    for (let i = 0; i < 10; i++) amplitude[i] = i / 10;
    const input = {
      width: 2,
      height: 5,
      amplitude,
      envelopeHash: "abc123def4567890abc123def4567890abc123def4567890abc123def4567890",
    };
    const view = createRenderView();
    const physical = view.project(input, { mode: "physical" });
    const anime = view.project(input, { mode: "anime" });
    assert.equal(physical.envelopeHash, anime.envelopeHash);
    assert.ok(!physical.png.equals(anime.png), "different skin for same envelope");
  });

  it("loadChamberFrame reads tape frame without mutation", () => {
    const tapePath = join(repoRoot, "output/simulation/chamber-studio-beat/tape.json");
    if (!existsSync(tapePath)) {
      assert.ok(true, "skip — studio tape not on disk");
      return;
    }
    const { manifest } = replayTapeFromDisk(tapePath);
    const loaded = loadChamberFrame(manifest.frames[0]);
    assert.ok(loaded.envelopeHash?.length === 64);
    assert.ok(loaded.amplitude instanceof Float32Array);
    assert.equal(loaded.readOnly, true);
  });
});

