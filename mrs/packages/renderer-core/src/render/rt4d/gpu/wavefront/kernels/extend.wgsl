// RT4D Phase B — extend stage stub (mix path state into frame).
struct Params { width: u32, height: u32, stage: u32, seed: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> frame: array<u32>;
@group(0) @binding(2) var<storage, read_write> paths: array<u32>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let i = gid.y * params.width + gid.x;
  var c = frame[i];
  c = c ^ (params.stage * 0x9e3779b9u);
  frame[i] = c;
  if (i < arrayLength(&paths)) { paths[i] = paths[i] ^ c; }
}
