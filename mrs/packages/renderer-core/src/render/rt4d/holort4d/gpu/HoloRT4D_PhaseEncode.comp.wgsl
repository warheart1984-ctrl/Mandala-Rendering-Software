// HoloRT4D_PhaseEncode — atan2(imag, real) → (phase+π)/(2π) ∈ [0, 1].
// Unified PhaseEncode, Polar / tiled branch: plain f32 reads from complexField.
// Gated RX 7000+ encode is a separate shader (atomic field loads). Polar file stays f32.

const PI: f32 = 3.14159265;

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

@group(0) @binding(2) var<storage, read> complexField: array<vec2<f32>>;
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
    if (idx >= arrayLength(&complexField)) { return; }
    let E = complexField[idx];
    let phaseNorm = encodePhase(E.x, E.y);
    textureStore(phaseTexture, pixel, vec4<f32>(phaseNorm, 0.0, 0.0, 1.0));
}
