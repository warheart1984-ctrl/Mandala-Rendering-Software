// HoloRT4D_PathFinalize — post-loop adapter (GPU hook: partial).
// Dispatched ONCE after `for b in maxBounces { shade }`. Never inside the bounce loop.
//
// Frozen 64-byte PathSample. pathFinalize() writes ONLY the last 16-byte chunk.
// Bounce helper writes pos/dir/wl/radiance/weight. Adapter fills bounce fields
// from RT4D ray buffers without rewriting BVH math.
//
// Status: partial — opticalLength is single-segment hit.t.

struct FrameParams {
    sampleIndex: f32,
    maxDepth: f32,
    width: f32,
    height: f32,
    seed: f32,
    _p0: f32,
    _p1: f32,
    _p2: f32,
}

struct HitRecord {
    t: f32,
    primId: i32,
    materialId: i32,
    normal: vec4<f32>,
}

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

@group(0) @binding(0) var<uniform> frame: FrameParams;
@group(0) @binding(1) var<storage, read> rayOrigins: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> rayDirs: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> hits: array<HitRecord>;
@group(0) @binding(4) var<storage, read> pathThroughput: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> pathSamples: array<PathSample>;

fn writeBounceFields(p: ptr<storage, PathSample, read_write>, pos: vec3f, w: f32, dir: vec3f, wl: f32, radiance: vec3f, weight: f32) {
    (*p).pos = pos;
    (*p)._pad0 = w;
    (*p).dir = dir;
    (*p).wl = wl;
    (*p).radiance = radiance;
    (*p).weight = weight;
}

// FINALIZE ONLY — last 16 bytes. Call once after the bounce loop.
fn pathFinalize(p: ptr<storage, PathSample, read_write>, opticalLength: f32, pixelId: u32, bounceId: u32) {
    (*p).opticalLength = opticalLength;
    (*p).pixelId = pixelId;
    (*p).bounceId = bounceId;
    (*p)._pad1 = 0u;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    let total = u32(frame.width) * u32(frame.height);
    if (idx >= total || idx >= arrayLength(&pathSamples)) { return; }

    let origin = rayOrigins[idx];
    let dir = rayDirs[idx];
    let hit = hits[idx];
    let throughput = pathThroughput[idx];

    var weight = 1.0;
    if (throughput.x == 0.0 && throughput.y == 0.0 && throughput.z == 0.0) {
        weight = 0.0;
    }

    writeBounceFields(&pathSamples[idx], origin.xyz, origin.w, dir.xyz, 0.0, throughput.xyz, weight);

    var opticalLength = 0.0;
    if (hit.t > 0.0) { opticalLength = hit.t; }
    // Match CPU sketch: bounceId = maxBounces - 1. RT4D FrameParams.maxDepth is that count.
    var bounceId = 0u;
    if (frame.maxDepth >= 1.0) {
        bounceId = u32(frame.maxDepth) - 1u;
    }
    pathFinalize(&pathSamples[idx], opticalLength, idx, bounceId);
}
