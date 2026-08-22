// HoloRT4D_AccumulateAtomic — OPTIONAL RX 7000+.
// Gated behind shader-float32-atomic / supportsFloatAtomic.
// Polar Vulkan may compile this but hardware does not guarantee true atomicity.
// Polar primary path is HoloRT4D_TiledAccumulate (plain stores).
//
// Status: declared (hardware gap on GCN4 Polar).

const PI: f32 = 3.14159265;

struct PathSample {
    pos: vec3f,
    _pad0: f32,
    dir: vec3f,
    wl: f32,
    radiance: vec3f,
    weight: f32,
    opticalLength: f32,
    pixelId: u32,
    bounceId: u32,
    _pad1: u32,
}

struct ComplexFieldPixel {
    real: atomic<f32>,
    imag: atomic<f32>,
}

struct HoloParams {
    frameWidth: u32,
    frameHeight: u32,
    holoResX: u32,
    holoResY: u32,
    tileSizeX: u32,
    tileSizeY: u32,
    numTilesX: u32,
    numTilesY: u32,
    lambda: f32,
    pathCount: u32,
    _p1: f32,
    _p2: f32,
}

@group(1) @binding(1) var<uniform> params: HoloParams;
@group(0) @binding(3) var<storage, read> pathSamples: array<PathSample>;
@group(0) @binding(2) var<storage, read_write> field: array<ComplexFieldPixel>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (params.frameWidth == 0u || params.frameHeight == 0u) { return; }
    if (idx >= params.pathCount || idx >= arrayLength(&pathSamples)) { return; }

    let p = pathSamples[idx];
    let px = p.pixelId % params.frameWidth;
    let py = p.pixelId / params.frameWidth;
    let holoX = px * params.holoResX / params.frameWidth;
    let holoY = py * params.holoResY / params.frameHeight;
    let pixelIndex = holoY * params.holoResX + holoX;
    if (pixelIndex >= arrayLength(&field)) { return; }

    var lam = p.wl;
    if (lam <= 0.0) { lam = params.lambda; }
    let phase = (2.0 * PI / lam) * p.opticalLength;
    let amp = length(p.radiance) * p.weight;
    atomicAdd(&field[pixelIndex].real, amp * cos(phase));
    atomicAdd(&field[pixelIndex].imag, amp * sin(phase));
}
