export { packBVH4D, intersectAABB4D, traverseBVH4DPacked } from "./bvh4dPacked.js";
export {
  BVH4D_CUDA_KERNEL_SOURCE,
  BVH4D_WGSL_KERNEL_SKETCH,
  BVH4D_CUDA_KERNEL_SOURCE as BVH4D_CUDA_KERNEL_SKETCH,
} from "./bvh4dKernelSketch.js";

export const BVH4D_WGSL_SOURCE = `struct BVHNode4D { minBounds: vec4<f32>, maxBounds: vec4<f32>, leftChild: i32, rightChild: i32, firstPrim: i32, primCount: i32 }
struct Hypersphere4D { center: vec4<f32>, radius: f32, materialId: i32, _p0: f32, _p1: f32 }
struct Hyperplane4D { normal: vec4<f32>, offset: f32, materialId: i32, _p0: f32, _p1: f32 }
struct MeshTri4D { v0: vec4<f32>, v1: vec4<f32>, v2: vec4<f32>, n0: vec4<f32>, n1: vec4<f32>, n2: vec4<f32>, materialId: i32, _p0: f32 }
struct HitRecord { t: f32, primId: i32, materialId: i32, normal: vec4<f32> }
const STACK_SIZE: i32 = 64; const EPS: f32 = 1e-12;
fn safeDenom(d: f32) -> f32 { if (abs(d) > EPS) { return d; } return select(-EPS, EPS, d >= 0.0); }
fn intersectAABB4D(o: vec4<f32>, d: vec4<f32>, bmin: vec4<f32>, bmax: vec4<f32>) -> vec2<f32> {
  var tEnter = -1e30; var tExit = 1e30;
  for (var k: i32 = 0; k < 4; k++) {
    let ok = o[k]; let dk = d[k]; let invD = 1.0 / safeDenom(dk);
    let t1 = (bmin[k] - ok) * invD; let t2 = (bmax[k] - ok) * invD;
    tEnter = max(tEnter, min(t1, t2)); tExit = min(tExit, max(t1, t2));
    if (tExit < tEnter) { return vec2<f32>(1e30, -1e30); }
  }
  return vec2<f32>(tEnter, tExit);
}
fn intersectHypersphere(o: vec4<f32>, d: vec4<f32>, sph: Hypersphere4D, tMin: f32, tMax: f32) -> vec2<f32> {
  let oc = o - sph.center; let a = dot(d, d); let b = 2.0 * dot(oc, d);
  let c = dot(oc, oc) - sph.radius * sph.radius; let disc = b * b - 4.0 * a * c;
  if (disc < 0.0) { return vec2<f32>(1e30, -1e30); }
  let s = sqrt(disc); var t0 = (-b - s) / (2.0 * a); var t1 = (-b + s) / (2.0 * a);
  var t = select(t1, t0, t0 >= tMin && t0 <= tMax);
  if (t < tMin || t > tMax) { return vec2<f32>(1e30, -1e30); }
  return vec2<f32>(t, 0.0);
}
fn hypersphereNormal(p: vec4<f32>, c: vec4<f32>) -> vec4<f32> { return normalize(p - c); }
fn intersectHyperplane(o: vec4<f32>, d: vec4<f32>, plane: Hyperplane4D, tMin: f32, tMax: f32) -> vec2<f32> {
  let nd = dot(plane.normal, d); if (abs(nd) < EPS) { return vec2<f32>(1e30, -1e30); }
  let t = (plane.offset - dot(plane.normal, o)) / nd;
  if (t < tMin || t > tMax) { return vec2<f32>(1e30, -1e30); }
  return vec2<f32>(t, 0.0);
}
fn intersectMeshTri(o: vec4<f32>, d: vec4<f32>, tri: MeshTri4D, tMin: f32, tMax: f32) -> vec2<f32> {
  let e1 = tri.v1 - tri.v0; let e2 = tri.v2 - tri.v0;
  let pvec = vec4<f32>(d.y*e2.z-d.z*e2.y, d.z*e2.w-d.w*e2.z, d.w*e2.x-d.x*e2.w, d.x*e2.y-d.y*e2.x);
  let det = dot(e1, pvec); if (abs(det) < EPS) { return vec2<f32>(1e30, -1e30); }
  let invDet = 1.0 / det; let tvec = o - tri.v0;
  let u = dot(tvec, pvec) * invDet; if (u < 0.0 || u > 1.0) { return vec2<f32>(1e30, -1e30); }
  let qvec = vec4<f32>(tvec.y*e1.z-tvec.z*e1.y, tvec.z*e1.w-tvec.w*e1.z, tvec.w*e1.x-tvec.x*e1.w, tvec.x*e1.y-tvec.y*e1.x);
  let v = dot(d, qvec) * invDet; if (v < 0.0 || u + v > 1.0) { return vec2<f32>(1e30, -1e30); }
  let t = dot(e2, qvec) * invDet; if (t < tMin || t > tMax) { return vec2<f32>(1e30, -1e30); }
  return vec2<f32>(t, 1.0);
}
fn meshTriNormal(tri: MeshTri4D, u: f32, v: f32) -> vec4<f32> {
  let w = 1.0 - u - v; return normalize(w * tri.n0 + u * tri.n1 + v * tri.n2);
}
@group(0) @binding(0)  var<storage, read> nodes: array<BVHNode4D>;
@group(0) @binding(1)  var<storage, read> spheres: array<Hypersphere4D>;
@group(0) @binding(2)  var<storage, read> planes: array<Hyperplane4D>;
@group(0) @binding(3)  var<storage, read> meshTris: array<MeshTri4D>;
@group(0) @binding(4)  var<storage, read> primType: array<i32>;
@group(0) @binding(5)  var<storage, read> primOffset: array<i32>;
@group(0) @binding(6)  var<storage, read> rayOrigins: array<vec4<f32>>;
@group(0) @binding(7)  var<storage, read> rayDirs: array<vec4<f32>>;
@group(0) @binding(8)  var<storage, read> rayTMin: array<f32>;
@group(0) @binding(9)  var<storage, read> rayTMax: array<f32>;
@group(0) @binding(10) var<storage, read_write> hits: array<HitRecord>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = i32(gid.x);
  if (idx >= i32(arrayLength(&rayOrigins))) { return; }
  let o = rayOrigins[idx]; let d = rayDirs[idx]; let tMin = rayTMin[idx]; let tMax = rayTMax[idx];
  var stack: array<i32, 64>; var sp: i32 = 0; stack[sp] = 0; sp = sp + 1;
  var closestT: f32 = tMax; var closestPrim: i32 = -1; var closestMat: i32 = -1; var closestN: vec4<f32> = vec4<f32>(0.0);
  loop {
    if (sp <= 0) { break; }
    sp = sp - 1; let nodeIdx = stack[sp]; let node = nodes[nodeIdx];
    let tRange = intersectAABB4D(o, d, node.minBounds, node.maxBounds);
    if (tRange.x > tRange.y || tRange.x > closestT) { continue; }
    if (node.primCount > 0) {
      for (var i: i32 = 0; i < node.primCount; i = i + 1) {
        let primId = node.firstPrim + i; let type = primType[primId]; let offset = primOffset[primId];
        var tHit: f32 = 1e30; var hit = false;
        if (type == 0) {
          let r = intersectHypersphere(o, d, spheres[offset], tMin, closestT);
          if (r.x < r.y && r.x < closestT) { tHit = r.x; let p = o + tHit * d; closestN = hypersphereNormal(p, spheres[offset].center); closestMat = spheres[offset].materialId; hit = true; }
        } else if (type == 1) {
          let r = intersectHyperplane(o, d, planes[offset], tMin, closestT);
          if (r.x < r.y && r.x < closestT) { tHit = r.x; closestN = planes[offset].normal; closestMat = planes[offset].materialId; hit = true; }
        } else if (type == 2) {
          let r = intersectMeshTri(o, d, meshTris[offset], tMin, closestT);
          if (r.x < r.y && r.x < closestT) { tHit = r.x; closestN = meshTriNormal(meshTris[offset], 0.0, 0.0); closestMat = meshTris[offset].materialId; hit = true; }
        }
        if (hit && tHit < closestT) { closestT = tHit; closestPrim = primId; }
      }
    } else {
      if (node.leftChild >= 0 && sp < 63) { stack[sp] = node.leftChild; sp = sp + 1; }
      if (node.rightChild >= 0 && sp < 63) { stack[sp] = node.rightChild; sp = sp + 1; }
    }
  }
  hits[idx].t = closestT; hits[idx].primId = closestPrim; hits[idx].materialId = closestMat; hits[idx].normal = closestN;
}`;
