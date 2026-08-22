// HoloRT4D_BinPaths — Polar path. Count increment is u32 only.
//
// TileHeaders.offset is a CPU prefix-sum (plain u32). This kernel only
// atomicAdds the u32 count, then writes entries[offset+dst] = pathIndex.
//
// Pixel → holo map (do not use pixelId % 16 unless frameWidth == 16):
//   px = pixelId % frameWidth
//   holoX = px * holoResX / frameWidth
//
// Workgroup 256 (Polar-friendly max). Offsets must be CPU prefix-summed first.
// Status: partial — GPU dispatch wired; Polar live validation not claimed.

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
    count: atomic<u32>,
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

@group(0) @binding(0) var<storage, read_write> headers: array<TileBinHeader>;
@group(0) @binding(1) var<storage, read_write> entries: array<TileBinEntry>;
@group(0) @binding(2) var<storage, read_write> complexField: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read> pathSamples: array<PathSample>;
@group(1) @binding(1) var<uniform> params: HoloParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (params.frameWidth == 0u || params.frameHeight == 0u) { return; }
    if (idx >= params.pathCount || idx >= arrayLength(&pathSamples)) { return; }

    let p = pathSamples[idx];
    let pixelId = p.pixelId;

    let px = pixelId % params.frameWidth;
    let py = pixelId / params.frameWidth;
    let holoX = px * params.holoResX / params.frameWidth;
    let holoY = py * params.holoResY / params.frameHeight;

    let tileX = holoX / params.tileSizeX;
    let tileY = holoY / params.tileSizeY;
    let tileId = tileY * params.numTilesX + tileX;
    if (tileId >= arrayLength(&headers)) { return; }

    // Only u32 atomic on this path.
    let dst = atomicAdd(&headers[tileId].count, 1u);
    let slot = headers[tileId].offset + dst;
    if (slot >= arrayLength(&entries)) { return; }
    entries[slot] = TileBinEntry(idx);
}
