// HoloRT4D_AccumulateRGB.comp.wgsl
// Three-channel atomic accumulation - one SSBO per RGB wavelength.
// Cannot fake RGB with a single lambda (per types.js contract).
//
// Three fixed wavelengths: R=650nm, G=530nm, B=450nm.
// Broadband paths (wl=0) hit all three; monochromatic hit nearest channel.
//
// Requires shader-float32-atomic extension. Same Polaris caveat as mono.
// Status: partial - use tiled path for safe fallback.
//
// FROZEN PathSample layout (64 bytes):
//   pos: vec4<f32>, dir: vec4<f32>, radiance: vec4<f32>,
//   opticalLength: f32, pixelId: u32, bounceId: u32, _pad1: u32

const PI: f32 = 3.14159265;

const LAMBDA_R: f32 = 650e-9;
const LAMBDA_G: f32 = 530e-9;
const LAMBDA_B: f32 = 450e-9;

struct HoloCamera {
    resX: u32,
    resY: u32,
    lambda: f32,
    _pad: f32,
    origin: vec4<f32>,
    u: vec4<f32>,
    v: vec4<f32>,
    n: vec4<f32>,
}

struct PathSample {
    pos: vec4<f32>,
    dir: vec4<f32>,
    radiance: vec4<f32>,
    opticalLength: f32,
    pixelId: u32,
    bounceId: u32,
    _pad1: u32,
}

struct ComplexFieldPixel {
    real: atomic<f32>,
    imag: atomic<f32>,
}

struct AccumParams {
    frameWidth: u32,
    frameHeight: u32,
    holoResX: u32,
    holoResY: u32,
}

@group(0) @binding(0) var<uniform> holoCam: HoloCamera;
@group(0) @binding(1) var<uniform> accumParams: AccumParams;
@group(0) @binding(2) var<storage, read> pathSamples: array<PathSample>;
@group(0) @binding(3) var<storage, read_write> fieldR: array<ComplexFieldPixel>;
@group(0) @binding(4) var<storage, read_write> fieldG: array<ComplexFieldPixel>;
@group(0) @binding(5) var<storage, read_write> fieldB: array<ComplexFieldPixel>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= arrayLength(&pathSamples)) { return; }

    let p = pathSamples[idx];

    // Skip dead paths
    if (p.radiance.w <= 0.0) { return; }

    let pixelId = p.pixelId;
    let px = pixelId % accumParams.frameWidth;
    let py = pixelId / accumParams.frameWidth;
    let holoX = px * accumParams.holoResX / accumParams.frameWidth;
    let holoY = py * accumParams.holoResY / accumParams.frameHeight;
    let pixelIndex = holoY * accumParams.holoResX + holoX;

    if (pixelIndex >= arrayLength(&fieldR)) { return; }

    let wl = p.dir.w;
    let amp = length(p.radiance.xyz) * p.radiance.w;
    let opl = p.opticalLength;
    let isBroadband = wl <= 0.0;

    // Red channel (650nm)
    if (isBroadband || (abs(wl - LAMBDA_R) <= abs(wl - LAMBDA_G) && abs(wl - LAMBDA_R) <= abs(wl - LAMBDA_B))) {
        let kR = 2.0 * PI / LAMBDA_R;
        let phaseR = kR * opl;
        atomicAdd(&fieldR[pixelIndex].real, amp * cos(phaseR));
        atomicAdd(&fieldR[pixelIndex].imag, amp * sin(phaseR));
    }

    // Green channel (530nm)
    if (isBroadband || (abs(wl - LAMBDA_G) < abs(wl - LAMBDA_R) && abs(wl - LAMBDA_G) <= abs(wl - LAMBDA_B))) {
        let kG = 2.0 * PI / LAMBDA_G;
        let phaseG = kG * opl;
        atomicAdd(&fieldG[pixelIndex].real, amp * cos(phaseG));
        atomicAdd(&fieldG[pixelIndex].imag, amp * sin(phaseG));
    }

    // Blue channel (450nm)
    if (isBroadband || (abs(wl - LAMBDA_B) < abs(wl - LAMBDA_R) && abs(wl - LAMBDA_B) < abs(wl - LAMBDA_G))) {
        let kB = 2.0 * PI / LAMBDA_B;
        let phaseB = kB * opl;
        atomicAdd(&fieldB[pixelIndex].real, amp * cos(phaseB));
        atomicAdd(&fieldB[pixelIndex].imag, amp * sin(phaseB));
    }
}
