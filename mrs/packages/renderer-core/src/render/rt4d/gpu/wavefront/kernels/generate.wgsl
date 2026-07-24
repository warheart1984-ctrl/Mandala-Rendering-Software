// RT4D Phase B — generate stage stub (visible hash + XY gradient).
struct Params { width: u32, height: u32, stage: u32, seed: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> frame: array<u32>;
@group(0) @binding(2) var<storage, read_write> paths: array<u32>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let i = gid.y * params.width + gid.x;
  let h = (gid.x * 374761393u) ^ (gid.y * 668265263u) ^ params.seed;
  frame[i] = (255u << 24u)
    | ((h & 0xffu) << 16u)
    | (((gid.x * 255u) / max(params.width, 1u)) << 8u)
    | ((gid.y * 255u) / max(params.height, 1u));
  if (i < arrayLength(&paths)) { paths[i] = h; }
}
