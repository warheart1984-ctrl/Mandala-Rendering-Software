// HoloRT4D_PhaseEncodeAtomic — RX 7000+ gated path.
// Reads complexField via atomicLoad after AccumulateAtomic.
// Polar Vulkan may compile atomic<f32> but hardware does not guarantee true atomicity.
// Do not enable on Polar by default. Polar primary encode is HoloRT4D_PhaseEncode (plain f32).

const PI: f32 = 3.14159265;

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

@group(0) @binding(2) var<storage, read_write> field: array<ComplexFieldPixel>;
@group(1) @binding(0) var phaseTexture: texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(1) var<uniform> params: HoloParams;

fn encodePhase(real: f32, imag: f32) -> f32 {
    let phase = atan2(imag, real);
    return (phase + PI) / (2.0 * PI);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let pixel = vec2<i32>(gid.xy);
    if (pixel.x >= i32(params.holoResX) || pixel.y >= i32(params.holoResY)) { return; }
    let idx = u32(pixel.y) * params.holoResX + u32(pixel.x);
    if (idx >= arrayLength(&field)) { return; }
    let real = atomicLoad(&field[idx].real);
    let imag = atomicLoad(&field[idx].imag);
    let phaseNorm = encodePhase(real, imag);
    textureStore(phaseTexture, pixel, vec4<f32>(phaseNorm, 0.0, 0.0, 1.0));
}
