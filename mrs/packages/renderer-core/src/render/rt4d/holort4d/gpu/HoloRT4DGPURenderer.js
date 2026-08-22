/**
 * HoloRT4D GPU orchestrator.
 * PathFinalize (adapter, partial) after RT4D bounce loop, then Polar tiled path:
 *   CPU prefix-sum TileHeaders.offset → BinPaths (u32 atomicAdd count, wg 256) →
 *   TiledAccumulate (16×16, one writer / pixel) → PhaseEncode (f32 reads).
 * Does not import RT4D pipeline layouts. Own createPipelineLayout, physical groups 0+1 (logical Set 4/5).
 * atomic<f32> path is gated behind shouldUseFloatAtomic. Polar primary is tiled.
 * Polar Vulkan may compile atomic<f32>; hardware does not guarantee true atomicity.
 *
 * RX 580: Vulkan ICD, GPUDevice without shader-float32-atomic. See describePolarDispatch().rx580
 * and docs/math4d/HOLORT4D.md. Dispatch stays partial until a live Polar pass is validated.
 */
import {
  HOLO_PATH_FINALIZE_WGSL,
  HOLO_BIN_PATHS_WGSL,
  HOLO_TILED_ACCUMULATE_WGSL,
  HOLO_ACCUMULATE_ATOMIC_WGSL,
  HOLO_PHASE_ENCODE_WGSL,
  HOLO_PHASE_ENCODE_ATOMIC_WGSL,
} from "./shaders.js";
import {
  createHoloPipelineLayout,
  createPathFinalizeAdapterLayout,
  HOLO_BIND_SET_TILES,
  HOLO_BIND_SET_PHASE,
  HOLO_SET4_BINDINGS,
  HOLO_SET5_BINDINGS,
} from "../layouts.js";
import { PATH_SAMPLE_BYTE_SIZE, packPathSamples } from "../path-sample.js";
import { prefixSumOffsets, tileCountsFromAlignedGrid } from "../aligned.js";
import {
  shouldUseFloatAtomic,
  describePolarDispatch,
  POLAR_BINPATHS_WORKGROUP,
  POLAR_TILED_WORKGROUP,
  POLAR_PHASE_ENCODE_WORKGROUP,
} from "../polar.js";
import { getSnapshot, publishSnapshot } from "../snapshot.js";
import { rejectUnreadyPaths } from "../gate.js";
import { rt4dBuffersFromHandoff } from "../path-adapter.js";

const FINALIZE_WS = 64;
const ATOMIC_WS = 64;

export class HoloRT4DGPURenderer {
  constructor(device, opts = {}) {
    this.device = device ?? null;
    this.holoResX = opts.holoResX ?? opts.width ?? 640;
    this.holoResY = opts.holoResY ?? opts.height ?? 480;
    this.tileSizeX = opts.tileSizeX ?? 16;
    this.tileSizeY = opts.tileSizeY ?? 16;
    this.lambda = opts.lambda ?? 550e-9;
    this.numTilesX = Math.ceil(this.holoResX / this.tileSizeX);
    this.numTilesY = Math.ceil(this.holoResY / this.tileSizeY);
    this.numTiles = this.numTilesX * this.numTilesY;
    this.holoPixels = this.holoResX * this.holoResY;
    this._initialized = false;
    this._maxPathCount = 0;
    this._useFloatAtomic = shouldUseFloatAtomic(device, opts);
    this.status = {
      accumulatePath: this._useFloatAtomic ? "atomic-f32-gated" : "tiled",
      floatAtomic: this._useFloatAtomic ? "enabled" : "gated",
      polarNote:
        "Polar Vulkan may compile atomic<f32> but hardware does not guarantee true atomicity. Polar primary is tiled; float atomics are off by default.",
      tiledSharedMemory: "partial",
      polarTiledGpu: "partial",
      pathFinalizeGpu: "partial",
      workgroupSizes: {
        binPaths: POLAR_BINPATHS_WORKGROUP,
        tiledAccumulate: [...POLAR_TILED_WORKGROUP],
        phaseEncode: [...POLAR_PHASE_ENCODE_WORKGROUP],
      },
      bindGroups: {
        set4: HOLO_BIND_SET_TILES,
        set5: HOLO_BIND_SET_PHASE,
        logicalSet4: 4,
        logicalSet5: 5,
        importsRt4d: false,
      },
      phaseEncodeRead: this._useFloatAtomic ? "atomicLoad" : "f32",
      gpuAvailable: Boolean(device),
    };
  }

  init() {
    if (this._initialized) return;
    if (!this.device) {
      this._initialized = true;
      return;
    }
    this._createBuffers();
    this._createPipelines();
    this._initialized = true;
  }

  _u() {
    return GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
  }

  _createBuffers() {
    const d = this.device;
    const n = this.holoPixels;
    const s = this._u();
    this._maxPathCount = n;
    this._pathBuffer = d.createBuffer({ size: n * PATH_SAMPLE_BYTE_SIZE, usage: s });
    this._complexField = d.createBuffer({ size: n * 8, usage: s });
    this._tileHeaders = d.createBuffer({ size: this.numTiles * 8, usage: s });
    this._tileEntries = d.createBuffer({ size: n * 4, usage: s });
    this._paramsBuffer = d.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._phaseImage = d.createTexture({
      size: [this.holoResX, this.holoResY],
      format: "rgba8unorm",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    });
  }

  _createPipelines() {
    const d = this.device;
    this._holoLayout = createHoloPipelineLayout(d);
    this._finalizeLayout = createPathFinalizeAdapterLayout(d);
    const mk = (code, layout, entry = "main") => {
      const m = d.createShaderModule({ code });
      return d.createComputePipeline({
        layout,
        compute: { module: m, entryPoint: entry },
      });
    };
    this._pipelines = {
      pathFinalize: mk(HOLO_PATH_FINALIZE_WGSL, this._finalizeLayout.pipelineLayout),
      binPaths: mk(HOLO_BIN_PATHS_WGSL, this._holoLayout.pipelineLayout),
      tiledAccumulate: mk(HOLO_TILED_ACCUMULATE_WGSL, this._holoLayout.pipelineLayout),
      phaseEncode: mk(HOLO_PHASE_ENCODE_WGSL, this._holoLayout.pipelineLayout),
    };
    if (this._useFloatAtomic) {
      this._pipelines.accumulateAtomic = mk(HOLO_ACCUMULATE_ATOMIC_WGSL, this._holoLayout.pipelineLayout);
      this._pipelines.phaseEncodeAtomic = mk(HOLO_PHASE_ENCODE_ATOMIC_WGSL, this._holoLayout.pipelineLayout);
    }
  }

  _writeParams(fw, fh, pathCount) {
    const b = new ArrayBuffer(48);
    const u = new Uint32Array(b);
    const f = new Float32Array(b);
    u[0] = fw;
    u[1] = fh;
    u[2] = this.holoResX;
    u[3] = this.holoResY;
    u[4] = this.tileSizeX;
    u[5] = this.tileSizeY;
    u[6] = this.numTilesX;
    u[7] = this.numTilesY;
    f[8] = this.lambda;
    u[9] = pathCount >>> 0;
    this.device.queue.writeBuffer(this._paramsBuffer, 0, b);
  }

  /**
   * CPU prefix-sum of tile counts → TileHeaders.offset. Counts start at 0 for GPU atomicAdd.
   * Must run before BinPaths.
   */
  writeTileHeaderOffsets(counts) {
    const offsets = prefixSumOffsets(counts);
    const hdr = new Uint32Array(this.numTiles * 2);
    for (let i = 0; i < this.numTiles; i++) {
      hdr[i * 2] = offsets[i] ?? 0;
      hdr[i * 2 + 1] = 0;
    }
    if (this.device) this.device.queue.writeBuffer(this._tileHeaders, 0, hdr);
    return offsets;
  }

  _ensurePathCapacity(n) {
    if (!this.device || n <= this._maxPathCount) return;
    this._pathBuffer?.destroy?.();
    this._tileEntries?.destroy?.();
    const s = this._u();
    this._maxPathCount = n;
    this._pathBuffer = this.device.createBuffer({ size: n * PATH_SAMPLE_BYTE_SIZE, usage: s });
    this._tileEntries = this.device.createBuffer({ size: n * 4, usage: s });
  }

  _set4Group() {
    return this.device.createBindGroup({
      layout: this._holoLayout.set4,
      entries: [
        { binding: HOLO_SET4_BINDINGS.tileHeaders, resource: { buffer: this._tileHeaders } },
        { binding: HOLO_SET4_BINDINGS.tileEntries, resource: { buffer: this._tileEntries } },
        { binding: HOLO_SET4_BINDINGS.complexField, resource: { buffer: this._complexField } },
        { binding: HOLO_SET4_BINDINGS.pathSamples, resource: { buffer: this._pathBuffer } },
      ],
    });
  }

  _set5Group() {
    return this.device.createBindGroup({
      layout: this._holoLayout.set5,
      entries: [
        { binding: HOLO_SET5_BINDINGS.phaseTexture, resource: this._phaseImage.createView() },
        { binding: HOLO_SET5_BINDINGS.params, resource: { buffer: this._paramsBuffer } },
      ],
    });
  }

  planPolarDispatch(opts = {}) {
    const pathCount = opts.paths?.length ?? opts.pathCount ?? this.holoPixels;
    return describePolarDispatch({
      device: this.device,
      holoResX: this.holoResX,
      holoResY: this.holoResY,
      tileSizeX: this.tileSizeX,
      tileSizeY: this.tileSizeY,
      pathCount,
    });
  }

  /**
   * @param {GPUCommandEncoder} encoder
   * @param {object} rt4d RT4D buffers (adapter). PathFinalize GPU hook is partial.
   * @param {object} [opts]
   */
  dispatch(encoder, rt4d, opts = {}) {
    if (!this._initialized) this.init();
    const fw = opts.frameWidth ?? this.holoResX;
    const fh = opts.frameHeight ?? this.holoResY;
    if (opts.paths) rejectUnreadyPaths(opts.paths);

    const pathCount = opts.paths?.length ?? opts.pathCount ?? (fw * fh);
    let counts;
    if (opts.paths) {
      counts = new Array(this.numTiles).fill(0);
      for (const p of opts.paths) {
        if (!(fw > 0) || !(fh > 0)) break;
        const px = p.pixelId % fw;
        const py = Math.trunc(p.pixelId / fw);
        const hx = Math.trunc((px * this.holoResX) / fw);
        const hy = Math.trunc((py * this.holoResY) / fh);
        const tid = Math.trunc(hy / this.tileSizeY) * this.numTilesX + Math.trunc(hx / this.tileSizeX);
        if (tid >= 0 && tid < this.numTiles) counts[tid] += 1;
      }
    } else if (Array.isArray(opts.tileCounts) && opts.tileCounts.length === this.numTiles) {
      counts = opts.tileCounts;
    } else {
      counts = tileCountsFromAlignedGrid({
        frameWidth: fw,
        frameHeight: fh,
        holoResX: this.holoResX,
        holoResY: this.holoResY,
        tileSizeX: this.tileSizeX,
        tileSizeY: this.tileSizeY,
      });
    }

    if (!this.device || !encoder) {
      const plan = this.planPolarDispatch(opts);
      const offsets = prefixSumOffsets(counts);
      return {
        ...plan,
        dispatchLog: plan.kernels,
        prefixSumOffsets: offsets,
        prefixSumBeforeBinPaths: true,
        pathCount,
        importsRt4dLayouts: false,
        status: this.status,
      };
    }

    this._writeParams(fw, fh, pathCount);
    this.device.queue.writeBuffer(this._complexField, 0, new Uint8Array(this.holoPixels * 8));
    this.writeTileHeaderOffsets(counts);
    this._ensurePathCapacity(pathCount);

    const log = [];
    const d = this.device;

    // PathFinalize fills the adapter buffer. CPU `paths` are already finalized — do not clobber.
    const rt = rt4dBuffersFromHandoff(rt4d);
    if (rt?.frameParamsBuffer && rt.rayOrigins && rt.rayDirs && rt.hits && rt.pathThroughput && !opts.paths) {
      const g = d.createBindGroup({
        layout: this._finalizeLayout.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: rt.frameParamsBuffer } },
          { binding: 1, resource: { buffer: rt.rayOrigins } },
          { binding: 2, resource: { buffer: rt.rayDirs } },
          { binding: 3, resource: { buffer: rt.hits } },
          { binding: 4, resource: { buffer: rt.pathThroughput } },
          { binding: 5, resource: { buffer: this._pathBuffer } },
        ],
      });
      const wg = Math.ceil(pathCount / FINALIZE_WS);
      const p = encoder.beginComputePass();
      p.setPipeline(this._pipelines.pathFinalize);
      p.setBindGroup(0, g);
      p.dispatchWorkgroups(wg);
      p.end();
      log.push({ kernelName: "holo_pathFinalize", workgroups: wg, workgroupSize: FINALIZE_WS, afterBounceLoop: true });
    }

    if (opts.paths) {
      this.device.queue.writeBuffer(this._pathBuffer, 0, packPathSamples(opts.paths));
    }

    const set4 = this._set4Group();
    const set5 = this._set5Group();

    {
      const wg = Math.ceil(pathCount / POLAR_BINPATHS_WORKGROUP);
      const p = encoder.beginComputePass();
      p.setPipeline(this._pipelines.binPaths);
      p.setBindGroup(HOLO_BIND_SET_TILES, set4);
      p.setBindGroup(HOLO_BIND_SET_PHASE, set5);
      p.dispatchWorkgroups(wg);
      p.end();
      log.push({
        kernelName: "holo_binPaths",
        workgroups: wg,
        workgroupSize: POLAR_BINPATHS_WORKGROUP,
        atomics: "u32-count-only",
        prefixSumFirst: true,
        bindGroups: [HOLO_BIND_SET_TILES, HOLO_BIND_SET_PHASE],
      });
    }

    if (this._useFloatAtomic && this._pipelines.accumulateAtomic) {
      const p = encoder.beginComputePass();
      p.setPipeline(this._pipelines.accumulateAtomic);
      p.setBindGroup(HOLO_BIND_SET_TILES, set4);
      p.setBindGroup(HOLO_BIND_SET_PHASE, set5);
      p.dispatchWorkgroups(Math.ceil(pathCount / ATOMIC_WS));
      p.end();
      log.push({ kernelName: "holo_accumulateAtomic", gated: true, polarDefault: false });
    } else {
      const p = encoder.beginComputePass();
      p.setPipeline(this._pipelines.tiledAccumulate);
      p.setBindGroup(HOLO_BIND_SET_TILES, set4);
      p.setBindGroup(HOLO_BIND_SET_PHASE, set5);
      p.dispatchWorkgroups(this.numTilesX, this.numTilesY);
      p.end();
      log.push({
        kernelName: "holo_tiledAccumulate",
        workgroups: this.numTiles,
        workgroupSize: [...POLAR_TILED_WORKGROUP],
        writers: "one-per-pixel",
        atomics: "none",
        bindGroups: [HOLO_BIND_SET_TILES, HOLO_BIND_SET_PHASE],
      });
    }

    {
      const wgX = Math.ceil(this.holoResX / POLAR_PHASE_ENCODE_WORKGROUP[0]);
      const wgY = Math.ceil(this.holoResY / POLAR_PHASE_ENCODE_WORKGROUP[1]);
      const atomicEncode = this._useFloatAtomic && this._pipelines.phaseEncodeAtomic;
      const p = encoder.beginComputePass();
      p.setPipeline(atomicEncode ? this._pipelines.phaseEncodeAtomic : this._pipelines.phaseEncode);
      p.setBindGroup(HOLO_BIND_SET_TILES, set4);
      p.setBindGroup(HOLO_BIND_SET_PHASE, set5);
      p.dispatchWorkgroups(wgX, wgY);
      p.end();
      log.push({
        kernelName: "holo_phaseEncode",
        workgroups: wgX * wgY,
        workgroupSize: [...POLAR_PHASE_ENCODE_WORKGROUP],
        fieldRead: atomicEncode ? "atomicLoad" : "f32",
        bindGroups: [HOLO_BIND_SET_TILES, HOLO_BIND_SET_PHASE],
      });
    }

    return {
      dispatchLog: log,
      status: this.status,
      importsRt4dLayouts: false,
      prefixSumBeforeBinPaths: true,
      polarFloatAtomics: false,
      pathCount,
    };
  }

  getSnapshot(level, ctx = {}) {
    return getSnapshot(level, { ...ctx, width: this.holoResX, height: this.holoResY });
  }

  publish(visionBridge, snapshot, extra) {
    return publishSnapshot(visionBridge, snapshot ?? this.getSnapshot("CPO"), extra);
  }

  destroy() {
    for (const b of [this._pathBuffer, this._complexField, this._tileHeaders, this._tileEntries, this._paramsBuffer]) {
      b?.destroy?.();
    }
    this._phaseImage?.destroy?.();
  }
}
