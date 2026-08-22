// HoloRT4D_DebugRealImag — debug encode of hologram Re/Im. NOT SLM phase-only.
// Reads plain f32 complexField (Polar tiled path). Does not use atan2.
//
// Map (CPU-matched, documented):
//   R = 0.5 + 0.5 * tanh(real)
//   G = 0.5 + 0.5 * tanh(imag)
//   B = 0.5 + 0.5 * tanh(|E|)
// Zero → mid-gray 0.5. Negative → darker. Positive → brighter.
//
// Status: declared GPU sketch. CPU encode is enforced.
// Production PhaseEncode (atan2) is unchanged and is the Polar default.
// Do not dispatch this in place of PhaseEncode. No atomic<f32>.

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
@group(1) @binding(0) var debugTexture: texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(1) var<uniform> params: HoloParams;

fn mapBounded(x: f32) -> f32 {
    return 0.5 + 0.5 * tanh(x);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let pixel = vec2<i32>(gid.xy);
    if (pixel.x >= i32(params.holoResX) || pixel.y >= i32(params.holoResY)) { return; }
    let idx = u32(pixel.y) * params.holoResX + u32(pixel.x);
    if (idx >= arrayLength(&complexField)) { return; }
    let E = complexField[idx];
    let mag = length(E);
    textureStore(debugTexture, pixel, vec4<f32>(
        mapBounded(E.x),
        mapBounded(E.y),
        mapBounded(mag),
        1.0,
    ));
}
