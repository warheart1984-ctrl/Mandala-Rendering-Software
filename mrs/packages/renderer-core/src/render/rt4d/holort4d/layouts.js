/**
 * HoloRT4D bind-group split. RT4D owns sets 0–3. HoloRT4D does not import those layouts.
 *
 * Logical names (RT4D-downstream contract):
 *   Set 4: TileHeaders, TileEntries, complexField, pathSamples
 *   Set 5: phaseTexture, params
 *
 * Physical WebGPU indices on Holo's OWN pipeline: 0 (tiles) and 1 (phase).
 * Holo dispatches separate compute passes and does not share RT4D layouts, so
 * empty 0–3 placeholders are unused and would require maxBindGroups=6.
 * WebGPU default and RT4DGPURenderer both request maxBindGroups=4.
 */

export const RT4D_BIND_SETS = Object.freeze([0, 1, 2, 3]);
export const HOLO_LOGICAL_SET_TILES = 4;
export const HOLO_LOGICAL_SET_PHASE = 5;
/** Physical bind-group index on Holo's own pipeline (fits maxBindGroups=4). */
export const HOLO_BIND_SET_TILES = 0;
export const HOLO_BIND_SET_PHASE = 1;

export const HOLO_SET4_BINDINGS = Object.freeze({
  tileHeaders: 0,
  tileEntries: 1,
  complexField: 2,
  pathSamples: 3,
});

export const HOLO_SET5_BINDINGS = Object.freeze({
  phaseTexture: 0,
  params: 1,
});

export const HOLO_LAYOUT_STATUS = Object.freeze({
  importsRt4dLayouts: false,
  logicalSet4: HOLO_LOGICAL_SET_TILES,
  logicalSet5: HOLO_LOGICAL_SET_PHASE,
  set4: HOLO_BIND_SET_TILES,
  set5: HOLO_BIND_SET_PHASE,
  physicalFitsMaxBindGroups4: true,
  note: "HoloRT4D owns createPipelineLayout. Logical Set 4/5; physical groups 0/1 so WebGPU maxBindGroups=4 works. Do not reuse RT4D bind-group layouts.",
});

const STORAGE = "storage";
const READ_ONLY = "read-only-storage";
const UNIFORM = "uniform";

function computeVisibility(GPUShaderStage) {
  return GPUShaderStage?.COMPUTE ?? 4;
}

/**
 * Bind-group layout descriptors (no GPU device required). Used by tests + GPU renderer.
 */
export function describeHoloBindGroups() {
  return {
    rt4dSets: RT4D_BIND_SETS,
    holoSets: [HOLO_BIND_SET_TILES, HOLO_BIND_SET_PHASE],
    holoLogicalSets: [HOLO_LOGICAL_SET_TILES, HOLO_LOGICAL_SET_PHASE],
    importsRt4dLayouts: false,
    requiresMaxBindGroups: 4,
    set4: {
      index: HOLO_BIND_SET_TILES,
      logical: HOLO_LOGICAL_SET_TILES,
      bindings: [
        { binding: HOLO_SET4_BINDINGS.tileHeaders, name: "TileHeaders", type: STORAGE },
        { binding: HOLO_SET4_BINDINGS.tileEntries, name: "TileEntries", type: STORAGE },
        { binding: HOLO_SET4_BINDINGS.complexField, name: "complexField", type: STORAGE },
        { binding: HOLO_SET4_BINDINGS.pathSamples, name: "pathSamples", type: READ_ONLY },
      ],
    },
    set5: {
      index: HOLO_BIND_SET_PHASE,
      logical: HOLO_LOGICAL_SET_PHASE,
      bindings: [
        { binding: HOLO_SET5_BINDINGS.phaseTexture, name: "phaseTexture", type: "write-only-storage-texture" },
        { binding: HOLO_SET5_BINDINGS.params, name: "params", type: UNIFORM },
      ],
    },
  };
}

function set4Layout(device, visibility) {
  return device.createBindGroupLayout({
    label: "holort4d-set4-tiles",
    entries: [
      { binding: HOLO_SET4_BINDINGS.tileHeaders, visibility, buffer: { type: STORAGE } },
      { binding: HOLO_SET4_BINDINGS.tileEntries, visibility, buffer: { type: STORAGE } },
      { binding: HOLO_SET4_BINDINGS.complexField, visibility, buffer: { type: STORAGE } },
      { binding: HOLO_SET4_BINDINGS.pathSamples, visibility, buffer: { type: READ_ONLY } },
    ],
  });
}

function set5Layout(device, visibility) {
  return device.createBindGroupLayout({
    label: "holort4d-set5-phase",
    entries: [
      {
        binding: HOLO_SET5_BINDINGS.phaseTexture,
        visibility,
        storageTexture: { access: "write-only", format: "rgba8unorm" },
      },
      { binding: HOLO_SET5_BINDINGS.params, visibility, buffer: { type: UNIFORM } },
    ],
  });
}

/**
 * HoloRT4D-owned pipeline layout. Does not accept or import RT4D layouts.
 * @param {GPUDevice} device
 */
export function createHoloPipelineLayout(device) {
  if (!device?.createBindGroupLayout || !device?.createPipelineLayout) {
    throw new Error("createHoloPipelineLayout requires a GPU device");
  }
  const visibility = computeVisibility(globalThis.GPUShaderStage);
  const layouts = [set4Layout(device, visibility), set5Layout(device, visibility)];
  return {
    pipelineLayout: device.createPipelineLayout({
      label: "holort4d-own-layout",
      bindGroupLayouts: layouts,
    }),
    bindGroupLayouts: layouts,
    set4: layouts[HOLO_BIND_SET_TILES],
    set5: layouts[HOLO_BIND_SET_PHASE],
    descriptor: describeHoloBindGroups(),
    importsRt4dLayouts: false,
  };
}

/**
 * PathFinalize adapter layout — Holo-owned, not RT4D's shade/raygen layout.
 * GPU hook is partial.
 */
export function createPathFinalizeAdapterLayout(device) {
  if (!device?.createBindGroupLayout) {
    throw new Error("createPathFinalizeAdapterLayout requires a GPU device");
  }
  const visibility = computeVisibility(globalThis.GPUShaderStage);
  const layout = device.createBindGroupLayout({
    label: "holort4d-path-finalize-adapter",
    entries: [
      { binding: 0, visibility, buffer: { type: UNIFORM } },
      { binding: 1, visibility, buffer: { type: READ_ONLY } },
      { binding: 2, visibility, buffer: { type: READ_ONLY } },
      { binding: 3, visibility, buffer: { type: READ_ONLY } },
      { binding: 4, visibility, buffer: { type: READ_ONLY } },
      { binding: 5, visibility, buffer: { type: STORAGE } },
    ],
  });
  return {
    bindGroupLayout: layout,
    pipelineLayout: device.createPipelineLayout({
      label: "holort4d-path-finalize-adapter-layout",
      bindGroupLayouts: [layout],
    }),
    status: "partial",
    importsRt4dLayouts: false,
  };
}
