// RT4D Phase B — shade stage stub (simple luminance lift).
struct Params { width: u32, height: u32, stage: u32, seed: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> frame: array<u32>;
@group(0) @binding(2) var<storage, read_write> paths: array<u32>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let i = gid.y * params.width + gid.x;
  let r = (frame[i] >> 16u) & 0xffu;
  let g = (frame[i] >> 8u) & 0xffu;
  let b = frame[i] & 0xffu;
  let lit = min(255u, (r + g + b) / 3u + 16u);
  frame[i] = (255u << 24u) | (lit << 16u) | (g << 8u) | b;
}
