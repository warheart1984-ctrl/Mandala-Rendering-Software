/**
 * Level of Detail (LOD) Manager for 4D Surfaces
 * Dynamically adjusts mesh resolution based on camera distance and screen space size
 */

export class LODManager {
  constructor(options = {}) {
    this.lodLevels = options.lodLevels ?? [
      { distance: 0, resolution: 256 },   // High detail
      { distance: 5, resolution: 128 },  // Medium detail
      { distance: 10, resolution: 64 },   // Low detail
      { distance: 20, resolution: 32 },   // Very low detail
    ];
    
    this.currentLOD = 0;
    this.targetLOD = 0;
    this.lodTransitionSpeed = options.lodTransitionSpeed ?? 0.1;
    this.minScreenSize = options.minScreenSize ?? 50; // Minimum pixels for high detail
    this.maxScreenSize = options.maxScreenSize ?? 500; // Maximum pixels for low detail
    
    // Cache for LOD meshes
    this.meshCache = new Map();
    this.currentMesh = null;
    this.targetMesh = null;
    this.transitionProgress = 0;
  }
  
  /**
   * Calculate appropriate LOD level based on distance and screen space size
   */
  calculateLOD(cameraPosition, surfaceBounds, screenWidth, screenHeight) {
    // Calculate distance to surface
    const distance = this.calculateDistance(cameraPosition, surfaceBounds);
    
    // Calculate screen space size
    const screenSize = this.calculateScreenSize(surfaceBounds, distance, screenWidth, screenHeight);
    
    // Determine LOD based on distance and screen size
    let lod = 0;
    for (let i = 0; i < this.lodLevels.length; i++) {
      if (distance > this.lodLevels[i].distance && screenSize < this.minScreenSize) {
        lod = i + 1;
      } else if (screenSize > this.maxScreenSize) {
        lod = Math.max(0, i - 1);
      }
    }
    
    return Math.min(lod, this.lodLevels.length - 1);
  }
  
  calculateDistance(cameraPosition, surfaceBounds) {
    const center = surfaceBounds.center ?? { x: 0, y: 0, z: 0, w: 0 };
    const dx = cameraPosition.x - center.x;
    const dy = cameraPosition.y - center.y;
    const dz = cameraPosition.z - center.z;
    const dw = cameraPosition.w - center.w;
    return Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
  }
  
  calculateScreenSize(surfaceBounds, distance, screenWidth, screenHeight) {
    const size = surfaceBounds.size ?? 2.0; // Approximate size in 4D
    const fov = Math.PI / 4; // 45 degrees
    const projectionScale = Math.tan(fov / 2) * distance;
    
    if (projectionScale === 0) return 0;
    
    const screenSpaceSize = (size / projectionScale) * Math.min(screenWidth, screenHeight);
    return screenSpaceSize;
  }
  
  /**
   * Get or generate mesh for specific LOD level
   */
  async getMesh(surface, lodLevel, sampleFunction) {
    const cacheKey = `${surface.id}-${lodLevel}`;
    
    if (this.meshCache.has(cacheKey)) {
      return this.meshCache.get(cacheKey);
    }
    
    // Generate mesh for this LOD level
    const resolution = this.lodLevels[lodLevel].resolution;
    const mesh = sampleFunction(surface, resolution);
    
    this.meshCache.set(cacheKey, mesh);
    return mesh;
  }
  
  /**
   * Update LOD based on camera position
   */
  update(cameraPosition, surfaceBounds, screenWidth, screenHeight) {
    this.targetLOD = this.calculateLOD(cameraPosition, surfaceBounds, screenWidth, screenHeight);
    
    // Smooth LOD transition
    if (this.targetLOD !== this.currentLOD) {
      this.transitionProgress += this.lodTransitionSpeed;
      
      if (this.transitionProgress >= 1.0) {
        this.currentLOD = this.targetLOD;
        this.transitionProgress = 0;
      }
    }
    
    return this.currentLOD;
  }
  
  /**
   * Get current resolution based on LOD
   */
  getCurrentResolution() {
    // Interpolate between resolutions during transition
    const currentRes = this.lodLevels[this.currentLOD].resolution;
    const targetRes = this.lodLevels[this.targetLOD].resolution;
    
    if (this.transitionProgress === 0) {
      return currentRes;
    }
    
    return Math.round(
      currentRes + (targetRes - currentRes) * this.transitionProgress
    );
  }
  
  /**
   * Clear mesh cache (call when surface changes or memory is low)
   */
  clearCache() {
    this.meshCache.clear();
  }
  
  /**
   * Clear cache for specific surface
   */
  clearSurfaceCache(surfaceId) {
    for (const key of this.meshCache.keys()) {
      if (key.startsWith(surfaceId)) {
        this.meshCache.delete(key);
      }
    }
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.meshCache.size,
      keys: Array.from(this.meshCache.keys()),
      currentLOD: this.currentLOD,
      targetLOD: this.targetLOD,
      transitionProgress: this.transitionProgress,
    };
  }
}

/**
 * Adaptive LOD Manager - adjusts based on performance metrics
 */
export class AdaptiveLODManager extends LODManager {
  constructor(options = {}) {
    super(options);
    this.targetFPS = options.targetFPS ?? 60;
    this.minFPS = options.minFPS ?? 30;
    this.performanceHistory = [];
    this.maxHistorySize = 60;
    this.autoAdjust = options.autoAdjust ?? true;
  }
  
  recordFrameTime(frameTime) {
    this.performanceHistory.push(frameTime);
    
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory.shift();
    }
    
    if (this.autoAdjust && this.performanceHistory.length >= 10) {
      this.adjustBasedOnPerformance();
    }
  }
  
  adjustBasedOnPerformance() {
    const avgFrameTime = this.performanceHistory.reduce((a, b) => a + b, 0) / this.performanceHistory.length;
    const currentFPS = 1000 / avgFrameTime;
    
    if (currentFPS < this.minFPS) {
      // Performance is poor, reduce quality
      this.targetLOD = Math.min(this.targetLOD + 1, this.lodLevels.length - 1);
    } else if (currentFPS > this.targetFPS + 10) {
      // Performance is good, increase quality
      this.targetLOD = Math.max(this.targetLOD - 1, 0);
    }
  }
  
  getPerformanceStats() {
    if (this.performanceHistory.length === 0) {
      return { avgFPS: 0, minFPS: 0, maxFPS: 0 };
    }
    
    const avgFrameTime = this.performanceHistory.reduce((a, b) => a + b, 0) / this.performanceHistory.length;
    const minFrameTime = Math.min(...this.performanceHistory);
    const maxFrameTime = Math.max(...this.performanceHistory);
    
    return {
      avgFPS: 1000 / avgFrameTime,
      minFPS: 1000 / maxFrameTime,
      maxFPS: 1000 / minFrameTime,
      frameCount: this.performanceHistory.length,
    };
  }
}

/**
 * Progressive LOD - renders low-res first, then refines
 */
export class ProgressiveLODManager extends LODManager {
  constructor(options = {}) {
    super(options);
    this.maxPasses = options.maxPasses ?? 3;
    this.currentPass = 0;
    this.passTime = options.passTime ?? 16; // ms per pass
  }
  
  update(cameraPosition, surfaceBounds, screenWidth, screenHeight) {
    const baseLOD = super.update(cameraPosition, surfaceBounds, screenWidth, screenHeight);
    
    // Progressive refinement through multiple passes
    this.currentPass = (this.currentPass + 1) % this.maxPasses;
    
    // Adjust resolution based on pass
    const resolutionMultiplier = 1 + (this.currentPass / this.maxPasses);
    const baseResolution = this.lodLevels[baseLOD].resolution;
    
    return Math.round(baseResolution * resolutionMultiplier);
  }
  
  resetProgression() {
    this.currentPass = 0;
  }
}

/**
 * Screen-space LOD - based on projected size on screen
 */
export class ScreenSpaceLODManager extends LODManager {
  constructor(options = {}) {
    super(options);
    this.pixelThresholds = options.pixelThresholds ?? [
      { pixels: 100, resolution: 256 },
      { pixels: 50, resolution: 128 },
      { pixels: 25, resolution: 64 },
      { pixels: 10, resolution: 32 },
    ];
  }
  
  calculateLOD(cameraPosition, surfaceBounds, screenWidth, screenHeight) {
    const distance = this.calculateDistance(cameraPosition, surfaceBounds);
    const screenSize = this.calculateScreenSize(surfaceBounds, distance, screenWidth, screenHeight);
    
    for (let i = 0; i < this.pixelThresholds.length; i++) {
      if (screenSize < this.pixelThresholds[i].pixels) {
        return i;
      }
    }
    
    return 0;
  }
}

export function createLODManager(options = {}) {
  return new LODManager(options);
}

export function createAdaptiveLODManager(options = {}) {
  return new AdaptiveLODManager(options);
}

export function createProgressiveLODManager(options = {}) {
  return new ProgressiveLODManager(options);
}

export function createScreenSpaceLODManager(options = {}) {
  return new ScreenSpaceLODManager(options);
}
