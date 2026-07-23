// RT4D Accumulate Shader — progressive sample averaging
// Dispatch: 1 thread per pixel

struct FrameParams {
  sampleIndex: f32,
  maxDepth: f32,
  width: f32,
  height: f32,
  seed: f32,
  _pad0: f32, _pad1: f32, _pad2: f32,
}

@group(0) @binding(0) var<storage, read_write> accumBuffer: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> outputBuffer: array<vec4<f32>>;
@group(0) @binding(2) var<uniform> frame: FrameParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = u32(gid.x);
  let total = u32(frame.width * frame.height);
  if (idx >= total) { return; }

  let n = frame.sampleIndex;
  if (n < 0.5) {
    outputBuffer[idx] = accumBuffer[idx];
    return;
  }

  let prev = accumBuffer[idx];
  let invN = 1.0 / n;
  outputBuffer[idx] = vec4<f32>(
    prev.x * invN,
    prev.y * invN,
    prev.z * invN,
    1.0
  );
}
