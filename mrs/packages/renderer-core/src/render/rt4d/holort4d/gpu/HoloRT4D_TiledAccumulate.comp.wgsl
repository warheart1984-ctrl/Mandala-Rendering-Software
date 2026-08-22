// HoloRT4D_TiledAccumulate — Polar primary path. No atomics.
//
// One workgroup per tile. Shared SoA tileReal[16][17], tileImag[16][17].
// Barrier, then exactly one writer per hologram pixel (plain stores).
//
// Local coords use the same map as BinPaths — NOT `pixelId % 16`:
//   px = pixelId % frameWidth
//   holoX = px * holoResX / frameWidth   (or px if same res)
//   lx = holoX % TILE_SIZE
// `pixelId % 16` is only valid when the frame is 16 px wide.
//
// Each thread owns lid.xy == (lx, ly) of this tile, so one global store per pixel.
// Paths are matched to that owned pixel (no shared-memory races).
// Status: partial — needs Polar WebGPU/Vulkan validation.

const PI: f32 = 3.14159265;
const TILE: u32 = 16u;

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

struct TileBinHeader {
    offset: u32,
    count: u32,
}

struct TileBinEntry {
    pathIndex: u32,
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

@group(0) @binding(0) var<storage, read> tileHeaders: array<TileBinHeader>;
@group(0) @binding(1) var<storage, read> tileEntries: array<TileBinEntry>;
@group(0) @binding(2) var<storage, read_write> complexField: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read> pathSamples: array<PathSample>;
@group(1) @binding(1) var<uniform> params: HoloParams;

var<workgroup> tileReal: array<f32, 272>;
var<workgroup> tileImag: array<f32, 272>;

fn tileSlot(ly: u32, lx: u32) -> u32 {
    // SoA stride 17: columns 0–15 are pixels, column 16 is Polar bank pad. Never write lx==16.
    return ly * 17u + lx;
}

// Same map as BinPaths. Do not use pixelId % 16.
fn holoXYFromPixelId(pixelId: u32) -> vec2<u32> {
    let px = pixelId % params.frameWidth;
    let py = pixelId / params.frameWidth;
    let holoX = px * params.holoResX / params.frameWidth;
    let holoY = py * params.holoResY / params.frameHeight;
    return vec2<u32>(holoX, holoY);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let lx = lid.x;
    let ly = lid.y;
    let slot = tileSlot(ly, lx);

    tileReal[slot] = 0.0;
    tileImag[slot] = 0.0;
    workgroupBarrier();

    if (params.frameWidth == 0u || params.frameHeight == 0u) { return; }

    let tileId = wid.y * params.numTilesX + wid.x;
    if (tileId >= arrayLength(&tileHeaders)) { return; }
    let header = tileHeaders[tileId];
    let globalX = wid.x * TILE + lx;
    let globalY = wid.y * TILE + ly;
    let globalIdx = globalY * params.holoResX + globalX;

    for (var i = 0u; i < header.count; i = i + 1u) {
        let entryIdx = header.offset + i;
        if (entryIdx >= arrayLength(&tileEntries)) { continue; }
        let p = pathSamples[tileEntries[entryIdx].pathIndex];
        let holo = holoXYFromPixelId(p.pixelId);
        // lx/ly for this path: holo.x % TILE, holo.y % TILE — matches lid when this thread owns the pixel
        if (holo.x == globalX && holo.y == globalY) {
            var lam = p.wl;
            if (lam <= 0.0) { lam = params.lambda; }
            let phase = (2.0 * PI / lam) * p.opticalLength;
            let amp = length(p.radiance) * p.weight;
            tileReal[slot] += amp * cos(phase);
            tileImag[slot] += amp * sin(phase);
        }
    }

    workgroupBarrier();

    // Exactly one writer per pixel. Plain stores — no atomics.
    if (globalX < params.holoResX && globalY < params.holoResY && globalIdx < arrayLength(&complexField)) {
        complexField[globalIdx] = vec2<f32>(tileReal[slot], tileImag[slot]);
    }
}
