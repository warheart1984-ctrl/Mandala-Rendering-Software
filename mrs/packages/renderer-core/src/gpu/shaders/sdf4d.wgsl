// 4D SDF Library — WGSL
// All functions operate in 4D space: vec4<f32> = (x, y, z, w)

#ifndef SDF4D_WGSL
#define SDF4D_WGSL

// ──────────────────────────────────────────────────────────────
// Primitives
// ──────────────────────────────────────────────────────────────

fn sdfHypersphere(p: vec4<f32>, r: f32) -> f32 {
  return length(p) - r;
}

fn sdfTesseract(p: vec4<f32>, s: vec4<f32>) -> f32 {
  let q = abs(p) - s;
  return length(max(q, vec4<f32>(0.0))) + min(max(q.x, max(q.y, max(q.z, q.w))), 0.0);
}

fn sdfHypertorus(p: vec4<f32>, R: f32, r: f32) -> f32 {
  // Clifford torus: S¹(R) × S¹(r) in 4D
  let d1 = length(p.xy) - R;
  let d2 = length(p.zw) - r;
  return sqrt(d1*d1 + d2*d2);
}

fn sdfTorus3DIn4D(p: vec4<f32>, R: f32, r: f32) -> f32 {
  // Standard 3D torus in XY plane, extended along Z with W modulation
  let d1 = length(p.xy) - R;
  let d2 = length(vec2<f32>(d1, p.z)) - r;
  return d2 + 0.3 * sin(p.w * 6.28318); // W modulation
}

fn sdfGyroid4D(p: vec4<f32>, scale: f32) -> f32 {
  // 4D gyroid (triply periodic minimal surface extended to 4D)
  let s = p * scale;
  let gx = cos(s.x) * sin(s.y) + cos(s.y) * sin(s.z) + cos(s.z) * sin(s.w);
  let gy = cos(s.y) * sin(s.z) + cos(s.z) * sin(s.w) + cos(s.w) * sin(s.x);
  let gz = cos(s.z) * sin(s.w) + cos(s.w) * sin(s.x) + cos(s.x) * sin(s.y);
  let gw = cos(s.w) * sin(s.x) + cos(s.x) * sin(s.y) + cos(s.y) * sin(s.z);
  return 0.3 - length(vec4<f32>(gx, gy, gz, gw)) * 0.5;
}

fn sdfSierpinski4D(p: vec4<f32>, iter: u32, scale: f32) -> f32 {
  // 4D Sierpinski tetrahedron
  var pos = p * scale;
  var s = 1.0;
  for (var i = 0u; i < iter; i++) {
    let corners = array<vec4<f32>, 5>(
      vec4<f32>(1, 1, 1, 1),
      vec4<f32>(-1, -1, 1, 1),
      vec4<f32>(-1, 1, -1, 1),
      vec4<f32>(1, -1, -1, 1),
      vec4<f32>(1, 1, -1, -1)
    );
    var minDist = 1e9;
    for (var j = 0u; j < 5u; j++) {
      let d = length(pos - corners[j]);
      if (d < minDist) minDist = d;
    }
    pos = pos * 2.0;
    s *= 2.0;
  }
  return minDist / s;
}

// ──────────────────────────────────────────────────────────────
// Boolean Operations
// ──────────────────────────────────────────────────────────────

fn opUnion(a: f32, b: f32) -> f32 {
  return min(a, b);
}

fn opIntersection(a: f32, b: f32) -> f32 {
  return max(a, b);
}

fn opSubtraction(a: f32, b: f32) -> f32 {
  return max(a, -b);
}

fn opSmoothUnion(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn opSmoothSubtraction(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 - 0.5 * (b + a) / k, 0.0, 1.0);
  return mix(b, -a, h) + k * h * (1.0 - h);
}

// ──────────────────────────────────────────────────────────────
// Transformations
// ──────────────────────────────────────────────────────────────

fn rotateXW(p: vec4<f32>, a: f32) -> vec4<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec4<f32>(c * p.x - s * p.w, p.y, p.z, s * p.x + c * p.w);
}

fn rotateYZ(p: vec4<f32>, a: f32) -> vec4<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec4<f32>(p.x, c * p.y - s * p.z, s * p.y + c * p.z, p.w);
}

fn rotateZW(p: vec4<f32>, a: f32) -> vec4<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec4<f32>(p.x, p.y, c * p.z - s * p.w, s * p.z + c * p.w);
}

fn rotateYW(p: vec4<f32>, a: f32) -> vec4<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec4<f32>(p.x, c * p.y - s * p.w, p.z, s * p.y + c * p.w);
}

fn rotateCinematic(p: vec4<f32>, t: f32) -> vec4<f32> {
  let r = p;
  let r1 = rotateXW(r, t * 0.7);
  let r2 = rotateYZ(r1, t * 1.1);
  let r3 = rotateZW(r2, t * 1.5);
  let r4 = rotateYW(r3, t * 2.0);
  return r4;
}

fn rotateXZ(p: vec4<f32>, a: f32) -> vec4<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec4<f32>(c * p.x - s * p.z, p.y, s * p.x + c * p.z, p.w);
}

fn rotateXY(p: vec4<f32>, a: f32) -> vec4<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec4<f32>(c * p.x - s * p.y, s * p.x + c * p.y, p.z, p.w);
}

// ──────────────────────────────────────────────────────────────
// Domain Operations
// ──────────────────────────────────────────────────────────────

fn opRep(p: vec4<f32>, c: vec4<f32>) -> vec4<f32> {
  // Repeat in 4D
  return mod(p + 0.5 * c, c) - 0.5 * c;
}

fn opRepLimited(p: vec4<f32>, c: vec4<f32>, limit: vec4<u32>) -> vec4<f32> {
  let q = mod(p + 0.5 * c, c) - 0.5 * c;
  let m = vec4<f32>(limit) * 0.5 * c;
  return clamp(q, -m, m);
}

fn opTwist(p: vec4<f32>, k: f32) -> vec4<f32> {
  let c = cos(k * p.w);
  let s = sin(k * p.w);
  return vec4<f32>(c * p.x - s * p.y, s * p.x + c * p.y, p.z, p.w);
}

fn opBend(p: vec4<f32>, k: f32) -> vec4<f32> {
  let c = cos(k * p.x);
  let s = sin(k * p.x);
  return vec4<f32>(p.x, c * p.y - s * p.z, s * p.y + c * p.z, p.w);
}

// ──────────────────────────────────────────────────────────────
// 4D Noise (simplified for GPU)
// ──────────────────────────────────────────────────────────────

fn hash4(p: vec4<f32>) -> f32 {
  let p3 = fract(p * vec4<f32>(0.1031, 0.1030, 0.0973, 0.1099));
  p3 += dot(p3, p3.yzwx + 33.33);
  return fract((p3.x + p3.y) * p3.z * p3.w);
}

fn noise4(p: vec4<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(mix(hash4(i + vec4<f32>(0,0,0,0)), hash4(i + vec4<f32>(1,0,0,0)), u.x),
          mix(hash4(i + vec4<f32>(0,1,0,0)), hash4(i + vec4<f32>(1,1,0,0)), u.x), u.y),
      mix(
        mix(hash4(i + vec4<f32>(0,0,1,0)), hash4(i + vec4<f32>(1,0,1,0)), u.x),
        mix(hash4(i + vec4<f32>(0,1,1,0)), hash4(i + vec4<f32>(1,1,1,0)), u.x), u.y), u.z),
    mix(
      mix(
        mix(hash4(i + vec4<f32>(0,0,0,1)), hash4(i + vec4<f32>(1,0,0,1)), u.x),
        mix(hash4(i + vec4<f32>(0,1,0,1)), hash4(i + vec4<f32>(1,1,0,1)), u.x), u.y),
      mix(
        mix(hash4(i + vec4<f32>(0,0,1,1)), hash4(i + vec4<f32>(1,0,1,1)), u.x),
        mix(hash4(i + vec4<f32>(0,1,1,1)), hash4(i + vec4<f32>(1,1,1,1)), u.x), u.y), u.w);
}

fn fbm4(p: vec4<f32>, octaves: u32) -> f32 {
  var value = 0.0;
  var amplitude = 1.0;
  var freq = p;
  for (var i = 0u; i < octaves; i++) {
    value += amplitude * noise4(freq);
    freq *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

fn ridged4(p: vec4<f32>, octaves: u32) -> f32 {
  var value = 0.0;
  var amplitude = 1.0;
  var freq = p;
  for (var i = 0u; i < octaves; i++) {
    let n = abs(noise4(freq));
    value += amplitude * (1.0 - n) * (1.0 - n);
    freq *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// ──────────────────────────────────────────────────────────────
// Scene SDF — compose your 4D world here
// ──────────────────────────────────────────────────────────────

fn map(p: vec4<f32>, time: f32, params: SceneParams) -> f32 {
  let rp = rotateCinematic(p, time * params.rotationSpeed);
  
  // Primitive selection via params.shapeType
  // 0 = hypersphere, 1 = hypertorus, 2 = gyroid, 3 = torus3D, 4 = fbm noise, 5 = ridged
  var d = 1e9;
  
  if (params.shapeType == 0u) {
    d = sdfHypersphere(rp, params.shapeParam1);
  } else if (params.shapeType == 1u) {
    d = sdfHypertorus(rp, params.shapeParam1, params.shapeParam2);
  } else if (params.shapeType == 2u) {
    d = sdfGyroid4D(rp, params.shapeParam1);
  } else if (params.shapeType == 3u) {
    d = sdfTorus3DIn4D(rp, params.shapeParam1, params.shapeParam2);
  } else if (params.shapeType == 4u) {
    d = fbm4(rp * params.shapeParam1, 6u) * params.shapeParam2;
  } else if (params.shapeType == 5u) {
    d = ridged4(rp * params.shapeParam1, 5u) * params.shapeParam2;
  }
  
  // Add some noise detail
  d += 0.02 * noise4(rp * 5.0 + time * 0.5);
  
  return d;
}

fn mapNormal(p: vec4<f32>, time: f32, params: SceneParams) -> vec4<f32> {
  const eps = 0.001;
  let d = map(p, time, params);
  let nx = map(p + vec4<f32>(eps, 0, 0, 0), time, params) - d;
  let ny = map(p + vec4<f32>(0, eps, 0, 0), time, params) - d;
  let nz = map(p + vec4<f32>(0, 0, eps, 0), time, params) - d;
  let nw = map(p + vec4<f32>(0, 0, 0, eps), time, params) - d;
  return normalize(vec4<f32>(nx, ny, nz, nw));
}

#endif