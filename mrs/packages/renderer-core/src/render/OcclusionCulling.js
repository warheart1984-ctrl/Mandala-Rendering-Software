/**
 * Occlusion Culling for 4D Renderer
 * Improves performance by skipping rendering of hidden geometry
 */

export class OcclusionCuller {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.threshold = options.threshold ?? 0.5; // Depth threshold for culling
    this.useFrustum = options.useFrustum ?? true;
    this.useBackface = options.useBackface ?? true;
    this.useDistance = options.useDistance ?? true;
    this.maxDistance = options.maxDistance ?? 100;
    
    this.culledFaces = 0;
    this.culledEdges = 0;
    this.totalFaces = 0;
    this.totalEdges = 0;
  }
  
  /**
   * Cull faces based on various criteria
   */
  cullFaces(mesh, camera, width, height) {
    if (!this.enabled) return mesh.faces;
    
    this.totalFaces = mesh.faces.length;
    this.culledFaces = 0;
    
    const visibleFaces = [];
    
    for (const face of mesh.faces) {
      if (this.isFaceVisible(face, mesh.vertices, camera, width, height)) {
        visibleFaces.push(face);
      } else {
        this.culledFaces++;
      }
    }
    
    return visibleFaces;
  }
  
  /**
   * Cull edges based on visibility
   */
  cullEdges(mesh, camera, width, height) {
    if (!this.enabled) return mesh.edges;
    
    this.totalEdges = mesh.edges.length;
    this.culledEdges = 0;
    
    const visibleEdges = [];
    
    for (const edge of mesh.edges) {
      if (this.isEdgeVisible(edge, mesh.vertices, camera, width, height)) {
        visibleEdges.push(edge);
      } else {
        this.culledEdges++;
      }
    }
    
    return visibleEdges;
  }
  
  /**
   * Check if a face is visible
   */
  isFaceVisible(face, vertices, camera, width, height) {
    const v0 = vertices[face[0]];
    const v1 = vertices[face[1]];
    const v2 = vertices[face[2]];
    
    // Backface culling
    if (this.useBackface) {
      if (!this.isFrontFacing(v0, v1, v2, camera)) {
        return false;
      }
    }
    
    // Distance culling
    if (this.useDistance) {
      const avgDist = (this.distanceToCamera(v0, camera) + 
                       this.distanceToCamera(v1, camera) + 
                       this.distanceToCamera(v2, camera)) / 3;
      if (avgDist > this.maxDistance) {
        return false;
      }
    }
    
    // Frustum culling
    if (this.useFrustum) {
      if (!this.isInFrustum(v0, camera, width, height) &&
          !this.isInFrustum(v1, camera, width, height) &&
          !this.isInFrustum(v2, camera, width, height)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Check if an edge is visible
   */
  isEdgeVisible(edge, vertices, camera, width, height) {
    const v0 = vertices[edge[0]];
    const v1 = vertices[edge[1]];
    
    // Distance culling
    if (this.useDistance) {
      const avgDist = (this.distanceToCamera(v0, camera) + 
                       this.distanceToCamera(v1, camera)) / 2;
      if (avgDist > this.maxDistance) {
        return false;
      }
    }
    
    // Frustum culling
    if (this.useFrustum) {
      if (!this.isInFrustum(v0, camera, width, height) &&
          !this.isInFrustum(v1, camera, width, height)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Check if face is front-facing (backface culling)
   */
  isFrontFacing(v0, v1, v2, camera) {
    // Calculate face normal
    const edge1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
    const edge2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };
    
    const normal = {
      x: edge1.y * edge2.z - edge1.z * edge2.y,
      y: edge1.z * edge2.x - edge1.x * edge2.z,
      z: edge1.x * edge2.y - edge1.y * edge2.x
    };
    
    // Calculate vector from camera to face center
    const faceCenter = {
      x: (v0.x + v1.x + v2.x) / 3,
      y: (v0.y + v1.y + v2.y) / 3,
      z: (v0.z + v1.z + v2.z) / 3
    };
    
    const toCamera = {
      x: camera.position.x - faceCenter.x,
      y: camera.position.y - faceCenter.y,
      z: camera.position.z - faceCenter.z
    };
    
    // Dot product - if positive, face is facing away
    const dot = normal.x * toCamera.x + normal.y * toCamera.y + normal.z * toCamera.z;
    
    return dot < 0;
  }
  
  /**
   * Calculate distance from point to camera
   */
  distanceToCamera(point, camera) {
    const dx = point.x - camera.position.x;
    const dy = point.y - camera.position.y;
    const dz = point.z - camera.position.z;
    const dw = point.w - (camera.position.w || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
  }
  
  /**
   * Check if point is in camera frustum
   */
  isInFrustum(point, camera, width, height) {
    // Simple frustum check based on projected position
    const d4 = camera.d4 ?? 4;
    const d3 = camera.d3 ?? 4;
    const scale = camera.scale ?? 80;
    
    // Project 4D to 3D
    const denom4 = d4 - point.w;
    if (denom4 <= 0) return false;
    const k4 = d4 / denom4;
    const p3 = {
      x: k4 * point.x,
      y: k4 * point.y,
      z: k4 * point.z
    };
    
    // Project 3D to 2D
    const denom3 = d3 - p3.z;
    if (denom3 <= 0) return false;
    const k3 = d3 / denom3;
    const p2 = {
      X: width / 2 + k3 * p3.x * scale,
      Y: height / 2 - k3 * p3.y * scale
    };
    
    // Check if in screen bounds
    return p2.X >= -50 && p2.X <= width + 50 && 
           p2.Y >= -50 && p2.Y <= height + 50;
  }
  
  /**
   * Get culling statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      culledFaces: this.culledFaces,
      culledEdges: this.culledEdges,
      totalFaces: this.totalFaces,
      totalEdges: this.totalEdges,
      faceCullRatio: this.totalFaces > 0 ? this.culledFaces / this.totalFaces : 0,
      edgeCullRatio: this.totalEdges > 0 ? this.culledEdges / this.totalEdges : 0
    };
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.culledFaces = 0;
    this.culledEdges = 0;
    this.totalFaces = 0;
    this.totalEdges = 0;
  }
  
  /**
   * Enable/disable culling
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

/**
 * Hierarchical Occlusion Culling using BVH
 */
export class BVHOcclusionCuller extends OcclusionCuller {
  constructor(options = {}) {
    super(options);
    this.bvh = null;
    this.buildBVH = options.buildBVH ?? true;
  }
  
  /**
   * Build Bounding Volume Hierarchy
   */
  buildBVH(mesh) {
    if (!this.buildBVH) return null;
    
    // Build simple BVH from faces
    const faces = mesh.faces.map((face, index) => ({
      index,
      face,
      bounds: this.computeFaceBounds(face, mesh.vertices)
    }));
    
    this.bvh = this.buildBVHRecursive(faces, 0);
    return this.bvh;
  }
  
  computeFaceBounds(face, vertices) {
    const v0 = vertices[face[0]];
    const v1 = vertices[face[1]];
    const v2 = vertices[face[2]];
    
    return {
      min: {
        x: Math.min(v0.x, v1.x, v2.x),
        y: Math.min(v0.y, v1.y, v2.y),
        z: Math.min(v0.z, v1.z, v2.z),
        w: Math.min(v0.w, v1.w, v2.w)
      },
      max: {
        x: Math.max(v0.x, v1.x, v2.x),
        y: Math.max(v0.y, v1.y, v2.y),
        z: Math.max(v0.z, v1.z, v2.z),
        w: Math.max(v0.w, v1.w, v2.w)
      }
    };
  }
  
  buildBVHRecursive(faces, depth) {
    if (faces.length <= 4 || depth > 10) {
      return {
        type: 'leaf',
        faces: faces
      };
    }
    
    // Find split axis (largest extent)
    const bounds = this.computeBounds(faces);
    const extents = {
      x: bounds.max.x - bounds.min.x,
      y: bounds.max.y - bounds.min.y,
      z: bounds.max.z - bounds.min.z,
      w: bounds.max.w - bounds.min.w
    };
    
    let splitAxis = 'x';
    let maxExtent = extents.x;
    for (const axis of ['y', 'z', 'w']) {
      if (extents[axis] > maxExtent) {
        maxExtent = extents[axis];
        splitAxis = axis;
      }
    }
    
    // Split faces
    const mid = bounds.min[splitAxis] + extents[splitAxis] / 2;
    const left = faces.filter(f => f.bounds.min[splitAxis] < mid);
    const right = faces.filter(f => f.bounds.min[splitAxis] >= mid);
    
    return {
      type: 'node',
      bounds,
      left: this.buildBVHRecursive(left, depth + 1),
      right: this.buildBVHRecursive(right, depth + 1)
    };
  }
  
  computeBounds(faces) {
    let min = { x: Infinity, y: Infinity, z: Infinity, w: Infinity };
    let max = { x: -Infinity, y: -Infinity, z: -Infinity, w: -Infinity };
    
    for (const f of faces) {
      min.x = Math.min(min.x, f.bounds.min.x);
      min.y = Math.min(min.y, f.bounds.min.y);
      min.z = Math.min(min.z, f.bounds.min.z);
      min.w = Math.min(min.w, f.bounds.min.w);
      
      max.x = Math.max(max.x, f.bounds.max.x);
      max.y = Math.max(max.y, f.bounds.max.y);
      max.z = Math.max(max.z, f.bounds.max.z);
      max.w = Math.max(max.w, f.bounds.max.w);
    }
    
    return { min, max };
  }
  
  /**
   * Traverse BVH and cull nodes
   */
  cullFacesWithBVH(mesh, camera, width, height) {
    if (!this.bvh) {
      this.buildBVH(mesh);
    }
    
    const visibleFaces = [];
    this.traverseBVH(this.bvh, mesh, camera, width, height, visibleFaces);
    
    return visibleFaces;
  }
  
  traverseBVH(node, mesh, camera, width, height, visibleFaces) {
    if (node.type === 'leaf') {
      for (const f of node.faces) {
        if (this.isFaceVisible(f.face, mesh.vertices, camera, width, height)) {
          visibleFaces.push(f.face);
        } else {
          this.culledFaces++;
        }
      }
      this.totalFaces += node.faces.length;
    } else {
      // Check if node bounds are visible
      if (this.isBoundsVisible(node.bounds, camera, width, height)) {
        this.traverseBVH(node.left, mesh, camera, width, height, visibleFaces);
        this.traverseBVH(node.right, mesh, camera, width, height, visibleFaces);
      } else {
        // Cull entire node
        this.cullNode(node);
      }
    }
  }
  
  isBoundsVisible(bounds, camera, width, height) {
    // Check if any corner of bounds is visible
    const corners = [
      bounds.min,
      { x: bounds.max.x, y: bounds.min.y, z: bounds.min.z, w: bounds.min.w },
      { x: bounds.min.x, y: bounds.max.y, z: bounds.min.z, w: bounds.min.w },
      { x: bounds.min.x, y: bounds.min.y, z: bounds.max.z, w: bounds.min.w },
      { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z, w: bounds.max.w },
      bounds.max
    ];
    
    for (const corner of corners) {
      if (this.isInFrustum(corner, camera, width, height)) {
        return true;
      }
    }
    
    return false;
  }
  
  cullNode(node) {
    if (node.type === 'leaf') {
      this.culledFaces += node.faces.length;
      this.totalFaces += node.faces.length;
    } else {
      this.cullNode(node.left);
      this.cullNode(node.right);
    }
  }
}

/**
 * Distance-based occlusion culling
 */
export class DistanceOcclusionCuller extends OcclusionCuller {
  constructor(options = {}) {
    super(options);
    this.lodDistances = options.lodDistances ?? [10, 20, 40, 80];
  }
  
  cullFacesWithLOD(mesh, camera, width, height) {
    const faceLODs = [];
    
    for (const face of mesh.faces) {
      const v0 = mesh.vertices[face[0]];
      const v1 = mesh.vertices[face[1]];
      const v2 = mesh.vertices[face[2]];
      
      const avgDist = (this.distanceToCamera(v0, camera) + 
                       this.distanceToCamera(v1, camera) + 
                       this.distanceToCamera(v2, camera)) / 3;
      
      // Determine LOD level
      let lod = 0;
      for (let i = 0; i < this.lodDistances.length; i++) {
        if (avgDist > this.lodDistances[i]) {
          lod = i + 1;
        }
      }
      
      faceLODs.push({ face, lod, distance: avgDist });
    }
    
    // Filter based on LOD
    const maxLOD = this.lodDistances.length;
    const visibleFaces = faceLODs
      .filter(f => f.lod < maxLOD)
      .map(f => f.face);
    
    this.culledFaces = faceLODs.length - visibleFaces.length;
    this.totalFaces = faceLODs.length;
    
    return visibleFaces;
  }
}

export function createOcclusionCuller(options = {}) {
  return new OcclusionCuller(options);
}

export function createBVHOcclusionCuller(options = {}) {
  return new BVHOcclusionCuller(options);
}

export function createDistanceOcclusionCuller(options = {}) {
  return new DistanceOcclusionCuller(options);
}
