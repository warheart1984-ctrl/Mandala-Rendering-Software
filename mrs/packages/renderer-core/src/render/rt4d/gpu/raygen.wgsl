// RT4D Ray Generation Shader — camera → rays
// Dispatch: 1 thread per pixel

struct Camera {
  position: vec4<f32>,
  forward: vec4<f32>,
  right: vec4<f32>,
  up: vec4<f32>,
  thru: vec4<f32>,
  fovX: f32, fovY: f32, fovZ: f32, fovW: f32,
  width: f32, height: f32,
  lensRadius: f32, focalDistance: f32,
}

@group(0) @binding(0) var<uniform> cam: Camera;
@group(0) @binding(1) var<storage, read_write> rayOrigins: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> rayDirs: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> rayTMin: array<f32>;
@group(0) @binding(4) var<storage, read_write> rayTMax: array<f32>;

fn pcgHash(input: u32) -> u32 {
  var state = input * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn randFloat(seed: ptr<function, u32>) -> f32 {
  *seed = pcgHash(*seed);
  return f32(*seed) / 4294967295.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = u32(gid.x);
  let total = u32(cam.width * cam.height);
  if (idx >= total) { return; }

  let px = idx % u32(cam.width);
  let py = idx / u32(cam.width);

  var seed = idx * 198491317u + 12345u;
  let u1 = randFloat(&seed);
  let u2 = randFloat(&seed);
  let u3 = randFloat(&seed);
  let u4 = randFloat(&seed);

  let ndcX = (f32(px) + u1) / cam.width;
  let ndcY = 1.0 - (f32(py) + u2) / cam.height;

  let aspectX = tan(cam.fovX * 0.5 * 0.01745329);
  let aspectY = tan(cam.fovY * 0.5 * 0.01745329);
  let aspectZ = tan(cam.fovZ * 0.5 * 0.01745329);
  let aspectW = tan(cam.fovW * 0.5 * 0.01745329);

  let rx = (2.0 * ndcX - 1.0) * aspectX;
  let ry = (2.0 * ndcY - 1.0) * aspectY;
  let rz = (u4 * 2.0 - 1.0) * aspectZ;
  let rw = (u3 * 2.0 - 1.0) * aspectW;

  var dir = normalize(
    rx * cam.right + ry * cam.up + (1.0 + rz) * cam.forward + rw * cam.thru
  );

  var origin = cam.position;

  if (cam.lensRadius > 0.0) {
    let r1 = 6.2831853 * randFloat(&seed);
    let r2 = sqrt(randFloat(&seed)) * cam.lensRadius;
    let lensOff = vec4<f32>(cos(r1) * r2, sin(r1) * r2, 0.0, 0.0);
    let pFocus = origin + dir * cam.focalDistance;
    origin = origin + lensOff;
    dir = normalize(pFocus - origin);
  }

  rayOrigins[idx] = origin;
  rayDirs[idx] = dir;
  rayTMin[idx] = 0.001;
  rayTMax[idx] = 1e9;
}
