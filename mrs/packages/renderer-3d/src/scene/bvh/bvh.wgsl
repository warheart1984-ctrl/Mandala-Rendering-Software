struct BVHNode {
  boundsMin: vec3<f32>,
  boundsMax: vec3<f32>,
  child0: u32,
  child1: u32,
  child2: u32,
  child3: u32,
  flags: u32,
};

struct BVHMeta {
  rootIndex: u32,
  nodeCount: u32,
  version: u32,
  configHashLow: u32,
  configHashHigh: u32,
};

@group(0) @binding(0) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(1) var<storage, read> bvhPrimitives: array<u32>;
@group(0) @binding(2) var<uniform> bvhMeta: BVHMeta;

fn rayAABB(origin: vec3<f32>, dir: vec3<f32>, minB: vec3<f32>, maxB: vec3<f32>) -> bool {
  let invDir = 1.0 / dir;
  let t0 = (minB - origin) * invDir;
  let t1 = (maxB - origin) * invDir;
  let tmin = max(max(t0.x, t0.y), t0.z);
  let tmax = min(min(t1.x, t1.y), t1.z);
  return tmax >= max(tmin, 0.0);
}
