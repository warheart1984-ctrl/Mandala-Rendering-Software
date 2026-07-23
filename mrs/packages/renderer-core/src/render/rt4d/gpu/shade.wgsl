// RT4D Shade Shader — hits → color contribution + scatter direction
// Dispatch: 1 thread per ray
// Uses PCG hash for GPU-side BRDF sampling

struct FrameParams {
  sampleIndex: f32,
  maxDepth: f32,
  width: f32,
  height: f32,
  seed: f32,
  _pad0: f32, _pad1: f32, _pad2: f32,
}

struct HitRecord {
  t: f32,
  primId: i32,
  materialId: i32,
  normal: vec4<f32>,
}

struct MaterialData {
  albedo: vec4<f32>,
  emission: vec4<f32>,
  typeAndParams: vec4<f32>,
  volumeParams: vec4<f32>,
}

struct LightData {
  center: vec4<f32>,
  radius: f32,
  materialId: f32,
  _pad0: f32, _pad1: f32,
  emission: vec4<f32>,
}

@group(0) @binding(0) var<uniform> frame: FrameParams;
@group(0) @binding(1) var<storage, read> hits: array<HitRecord>;
@group(0) @binding(2) var<storage, read> materials: array<MaterialData>;
@group(0) @binding(3) var<storage, read> lights: array<LightData>;
@group(0) @binding(4) var<storage, read> rayDirsIn: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read> rayOriginsIn: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> rayOriginsOut: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read_write> scatterDirs: array<vec4<f32>>;
@group(0) @binding(8) var<storage, read_write> pathThroughput: array<vec4<f32>>;

const PI: f32 = 3.14159265;
const EPS: f32 = 1e-6;

fn pcgHash(input: u32) -> u32 {
  var state = input * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn randFloat(seed: ptr<function, u32>) -> f32 {
  *seed = pcgHash(*seed);
  return f32(*seed) / 4294967295.0;
}

fn cosineWeightedSampleS3(n: vec4<f32>, u1: f32, u2: f32, u3: f32) -> vec4<f32> {
  let phi = u1 * 2.0 * PI;
  let psi = u2 * 2.0 * PI;
  let theta = asin(pow(u3, 1.0 / 3.0));

  let sinT = sin(theta);
  let cosT = cos(theta);
  let localDir = vec4<f32>(
    cosT * cos(phi) * cos(psi),
    cosT * cos(phi) * sin(psi),
    cosT * sin(phi),
    sinT
  );

  var t2 = vec4<f32>(1.0, 0.0, 0.0, 0.0);
  if (abs(n.x) > 0.9) { t2 = vec4<f32>(0.0, 1.0, 0.0, 0.0); }
  t2 = normalize(t2 - n * dot(n, t2));
  let t3 = normalize(cross4D(n, t2, vec4<f32>(0.0, 0.0, 0.0, 1.0)));
  let t4 = normalize(cross4D(n, t2, t3));

  return localDir.x * t2 + localDir.y * t3 + localDir.z * t4 + localDir.w * n;
}

fn cross4D(a: vec4<f32>, b: vec4<f32>, c: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(
    a.y * (b.z * c.w - b.w * c.z) - a.z * (b.y * c.w - b.w * c.y) + a.w * (b.y * c.z - b.z * c.y),
    a.z * (b.w * c.x - b.x * c.w) - a.w * (b.z * c.x - b.x * c.z) + a.x * (b.z * c.w - b.w * c.z),
    a.w * (b.x * c.y - b.y * c.x) - a.x * (b.w * c.y - b.y * c.w) + a.y * (b.w * c.x - b.x * c.w),
    a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x)
  );
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = u32(gid.x);
  let total = u32(frame.width * frame.height);
  if (idx >= total) { return; }

  let hit = hits[idx];
  let rayDir = rayDirsIn[idx];

  var seed = idx * 31337u + u32(frame.seed) + u32(frame.sampleIndex) * 1000000u;

  if (hit.primId < 0) {
    rayOriginsOut[idx] = vec4<f32>(0.0);
    scatterDirs[idx] = vec4<f32>(0.0);
    pathThroughput[idx] = vec4<f32>(0.0);
    return;
  }

  let matId = hit.materialId;
  let mat = materials[matId];
  let normal = hit.normal;

  // Compute hit position from ray origin + t * direction
  let hitPos = rayOriginsIn[idx] + rayDir * hit.t;

  // Emissive primitive → pass through emission, terminate path
  if (mat.typeAndParams.x > 1.5 && mat.typeAndParams.x < 2.5) {
    let cosW = max(dot(-rayDir, normal), 0.0);
    pathThroughput[idx] = mat.emission * cosW;
    rayOriginsOut[idx] = vec4<f32>(0.0);
    scatterDirs[idx] = vec4<f32>(0.0);
    return;
  }

  // Diffuse: cosine-weighted sample on S³
  let u1 = randFloat(&seed);
  let u2 = randFloat(&seed);
  let u3 = randFloat(&seed);

  let scatterDir = cosineWeightedSampleS3(normal, u1, u2, u3);
  let cosTheta = max(dot(scatterDir, normal), 0.0);

  // Lambertian: BRDF = 3ρ/(4π), pdf = 3cosθ/(4π)
  let brdf = 3.0 * mat.albedo / (4.0 * PI);
  let pdf = 3.0 * cosTheta / (4.0 * PI);
  let throughput = brdf * cosTheta / max(pdf, EPS);

  let offset = 0.002;
  rayOriginsOut[idx] = hitPos + normal * offset;
  scatterDirs[idx] = scatterDir;
  pathThroughput[idx] = throughput;
}
