/**
 * Packed 4D BVH node layout for GPU upload (matches CUDA/WGSL kernels).
 * CPU SoT remains BVH4D.js; this module packs / traverses the same AABB4 math.
 */
export function packBVH4D(bvh) {
  const nodes = bvh.nodes ?? [];
  const packed = new Array(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const isLeaf = n.left < 0 && n.right < 0 && n.start >= 0;
    packed[i] = {
      minBounds: [n.box.min.x, n.box.min.y, n.box.min.z, n.box.min.w],
      maxBounds: [n.box.max.x, n.box.max.y, n.box.max.z, n.box.max.w],
      leftChild: n.left ?? -1,
      rightChild: n.right ?? -1,
      firstPrim: isLeaf ? n.start : -1,
      primCount: isLeaf ? Math.max(0, n.end - n.start) : 0,
    };
  }

  return packed;
}

/**
 * Flatten packed BVH nodes into a Float32Array for GPU buffer upload.
 * Layout per node (12 floats = 48 bytes):
 *   [minX, minY, minZ, minW, maxX, maxY, maxZ, maxW, leftChild, rightChild, firstPrim, primCount]
 */
export function flattenBVH4DNodes(packed) {
  const floats = new Float32Array(packed.length * 12);
  for (let i = 0; i < packed.length; i++) {
    const n = packed[i];
    const o = i * 12;
    floats[o + 0]  = n.minBounds[0];
    floats[o + 1]  = n.minBounds[1];
    floats[o + 2]  = n.minBounds[2];
    floats[o + 3]  = n.minBounds[3];
    floats[o + 4]  = n.maxBounds[0];
    floats[o + 5]  = n.maxBounds[1];
    floats[o + 6]  = n.maxBounds[2];
    floats[o + 7]  = n.maxBounds[3];
    floats[o + 8]  = n.leftChild;
    floats[o + 9]  = n.rightChild;
    floats[o + 10] = n.firstPrim;
    floats[o + 11] = n.primCount;
  }
  return floats;
}

/**
 * Create WebGPU buffers for BVH traversal compute pass.
 * @param {GPUDevice} device
 * @param {Array} packedNodes - output of packBVH4D()
 * @returns {{ nodeBuffer, scratchBuffer }}
 */
export function createBVH4DGPUBuffers(device, packedNodes) {
  const nodeData = flattenBVH4DNodes(packedNodes);
  const nodeBuffer = device.createBuffer({
    size: nodeData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(nodeBuffer.getMappedRange()).set(nodeData);
  nodeBuffer.unmap();

  return { nodeBuffer };
}

/** 4D slab AABB ∩ ray. Returns { hit, tEnter, tExit }. */
export function intersectAABB4D(origin, direction, minBounds, maxBounds, tMin = 0, tMax = 1e30) {
  let tEnter = -Infinity;
  let tExit = Infinity;
  const o = [origin.x, origin.y, origin.z, origin.w];
  const d = [direction.x, direction.y, direction.z, direction.w];

  for (let k = 0; k < 4; k++) {
    const dk = Math.abs(d[k]) > 1e-12 ? d[k] : (d[k] >= 0 ? 1e-12 : -1e-12);
    const t1 = (minBounds[k] - o[k]) / dk;
    const t2 = (maxBounds[k] - o[k]) / dk;
    const tNear = Math.min(t1, t2);
    const tFar = Math.max(t1, t2);
    tEnter = Math.max(tEnter, tNear);
    tExit = Math.min(tExit, tFar);
    if (tExit < tEnter) return { hit: false, tEnter, tExit };
  }

  const hit = tEnter <= tExit && tExit >= tMin && tEnter <= tMax;
  return { hit, tEnter: Math.max(tEnter, tMin), tExit };
}

/**
 * Stack-based GPU-style traversal over packed nodes (CPU reference).
 * primIntersect(primIndex, ray) -> { t, ... } | null
 */
export function traverseBVH4DPacked(nodes, ray, primIntersect, options = {}) {
  const stackLimit = options.stackLimit ?? 64;
  const stack = new Int32Array(stackLimit);
  let sp = 0;
  stack[sp++] = 0;

  let closestT = Infinity;
  let closestHit = null;

  const o = ray.origin;
  const d = ray.direction;
  const tMin = ray.tMin ?? 0.001;
  const tMax = ray.tMax ?? 1e9;

  while (sp > 0) {
    const nodeIdx = stack[--sp];
    const node = nodes[nodeIdx];
    if (!node) continue;

    const box = intersectAABB4D(o, d, node.minBounds, node.maxBounds, tMin, closestT);
    if (!box.hit || box.tEnter > closestT) continue;

    if (node.primCount > 0) {
      for (let i = 0; i < node.primCount; i++) {
        const primId = node.firstPrim + i;
        const hit = primIntersect(primId, ray);
        if (hit && hit.t < closestT && hit.t >= tMin) {
          closestT = hit.t;
          closestHit = { ...hit, primId };
        }
      }
    } else {
      if (node.leftChild >= 0 && sp < stackLimit) stack[sp++] = node.leftChild;
      if (node.rightChild >= 0 && sp < stackLimit) stack[sp++] = node.rightChild;
    }
  }

  return closestHit;
}
