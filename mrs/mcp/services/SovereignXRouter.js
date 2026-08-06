// mrs/mcp/services/SovereignXRouter.js

import { ConstitutionalComputeScheduler } from '../../../../Sovereign-X-Constitutional-Compute/src/scheduler.js';
import { getArena, ARENA_IDS } from '../../../../Sovereign-X-Constitutional-Compute/src/arenas/index.js';
import { detectHipSdk } from '../../../../Sovereign-X-Constitutional-Compute/src/hip/detect.js';
import { AuthorityRegistry } from '../../../../Sovereign-X-Constitutional-Compute/src/authority.js';
import { DurableContinuityLedger } from '../../../../Sovereign-X-Constitutional-Compute/src/ledger.durable.js';

export class SovereignXRouter {
  constructor(options = {}) {
    this.scheduler = new ConstitutionalComputeScheduler({
      useOrchestrator: options.useOrchestrator || false,
      ledger: options.ledger || new DurableContinuityLedger({ inMemory: true }),
      authority: options.authority || new AuthorityRegistry(),
    });
    
    this.hipStatus = null;
    this.arenaMetrics = new Map();
    this.efficiencyLog = [];
    
    // Initialize arena metrics
    for (const id of ARENA_IDS) {
      this.arenaMetrics.set(id, {
        executions: 0,
        totalTime: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        lastUsed: null,
      });
    }
  }

  async initialize() {
    // Detect HIP/ROCm SDK on startup
    this.hipStatus = detectHipSdk({ invokeTools: false });
    console.log('[SovereignXRouter] HIP SDK status:', this.hipStatus.status);
    return this.hipStatus;
  }

  /**
   * Route a render task to the optimal arena based on:
   * - HIP SDK availability
   * - Task type (compute vs memory bound)
   * - Historical performance
   * - GPU memory requirements
   */
  async routeRenderTask(renderTask) {
    const { scene, renderParams, priority = 'normal' } = renderTask;
    
    // Determine optimal arena
    const arenaSelection = this.selectArena(renderTask);
    
    // Create intent for Sovereign X scheduler
    const intent = this.createRenderIntent(renderTask, arenaSelection.arenaId);
    
    // Execute via scheduler
    const startTime = performance.now();
    const result = this.scheduler.schedule(intent);
    const executionTime = performance.now() - startTime;
    
    // Record metrics
    this.recordMetrics(arenaSelection.arenaId, executionTime, result.decision === 'allowed');
    
    // Calculate efficiency
    const efficiency = this.calculateEfficiency(arenaSelection.arenaId, renderTask, result, executionTime);
    
    return {
      arena: arenaSelection.arenaId,
      arenaLabel: arenaSelection.label,
      decision: result.decision,
      result: result.result,
      executionTime,
      efficiency,
      hipStatus: this.hipStatus,
      intentId: intent.id,
    };
  }

  /**
   * Select optimal arena based on task characteristics and system state
   */
  selectArena(renderTask) {
    const { renderParams, scene } = renderTask;
    const resolution = renderParams?.resolution || { width: 800, height: 600 };
    const spp = renderParams?.samplesPerPixel || 16;
    const maxDepth = renderParams?.maxDepth || 4;
    
    // Estimate compute intensity
    const pixelCount = resolution.width * resolution.height;
    const computeIntensity = pixelCount * spp * maxDepth;
    
    // Estimate memory requirements
    const meshCount = scene?.meshes?.length || 0;
    const vertexCount = scene?.meshes?.reduce((sum, m) => sum + (m.vertices4D?.length || 0), 0) || 0;
    const memoryEstimate = vertexCount * 16 + pixelCount * 4; // bytes
    
    // Decision logic
    if (this.hipStatus?.sdkPresent && computeIntensity > 1000000) {
      // High compute task with GPU available
      return { arenaId: 'gpu', label: 'GPU Arena', reason: 'High compute intensity, HIP SDK available' };
    }
    
    if (this.hipStatus?.sdkPresent && memoryEstimate > 100 * 1024 * 1024) {
      // Large memory task with GPU available
      return { arenaId: 'gpu', label: 'GPU Arena', reason: 'Large memory footprint, HIP SDK available' };
    }
    
    // Check if we have historical data favoring GPU
    const gpuMetrics = this.arenaMetrics.get('gpu');
    const cpuMetrics = this.arenaMetrics.get('cpu');
    
    if (gpuMetrics && cpuMetrics && gpuMetrics.successfulExecutions > 0) {
      const gpuAvgTime = gpuMetrics.totalTime / gpuMetrics.successfulExecutions;
      const cpuAvgTime = cpuMetrics.successfulExecutions > 0 ? cpuMetrics.totalTime / cpuMetrics.successfulExecutions : Infinity;
      
      if (gpuAvgTime < cpuAvgTime * 0.8) {
        // GPU is at least 20% faster on average
        if (this.hipStatus?.sdkPresent) {
          return { arenaId: 'gpu', label: 'GPU Arena', reason: 'Historical performance favors GPU' };
        }
      }
    }
    
    // Default to CPU
    return { arenaId: 'cpu', label: 'CPU Arena', reason: 'Default CPU execution or GPU unavailable' };
  }

  /**
   * Create a Sovereign X intent from a render task
   */
  createRenderIntent(renderTask, arenaId) {
    const intentId = `render-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      id: intentId,
      action: 'render_4d_tesseract',
      arena: arenaId,
      ccr: {
        authorityId: 'mandala-renderer',
        authoritySignature: `sig-${intentId}`,
        continuityParentId: null,
        origin: 'mandala-rendering-system',
        justification: '4D path tracing render request',
        evidenceIds: renderTask.evidenceIds || [],
      },
      params: {
        scene: renderTask.scene,
        render: renderTask.renderParams,
        identity: renderTask.identity,
      },
      priority: renderTask.priority || 'normal',
    };
  }

  /**
   * Record execution metrics for arena
   */
  recordMetrics(arenaId, executionTime, success) {
    const metrics = this.arenaMetrics.get(arenaId);
    if (!metrics) return;
    
    metrics.executions++;
    metrics.totalTime += executionTime;
    metrics.lastUsed = new Date().toISOString();
    
    if (success) {
      metrics.successfulExecutions++;
    } else {
      metrics.failedExecutions++;
    }
  }

  /**
   * Calculate efficiency metrics (useful-FLOPs per watt proxy)
   */
  calculateEfficiency(arenaId, renderTask, result, executionTime) {
    const { renderParams, scene } = renderTask;
    const resolution = renderParams?.resolution || { width: 800, height: 600 };
    const spp = renderParams?.samplesPerPixel || 16;
    const maxDepth = renderParams?.maxDepth || 4;
    
    // Estimate useful FLOPs (simplified)
    const pixelCount = resolution.width * resolution.height;
    const flopsPerSample = 1000; // rough estimate for path tracing
    const usefulFlops = pixelCount * spp * maxDepth * flopsPerSample;
    
    // Estimate power (proxy)
    const powerEstimate = arenaId === 'gpu' ? 150 : 65; // watts (typical GPU vs CPU)
    
    // Efficiency metrics
    const flopsPerWatt = usefulFlops / powerEstimate;
    const flopsPerSecond = usefulFlops / (executionTime / 1000);
    const memoryEfficiency = this.estimateMemoryEfficiency(renderTask, arenaId);
    
    return {
      usefulFlops,
      executionTimeMs: executionTime,
      estimatedPowerWatts: powerEstimate,
      flopsPerWatt,
      flopsPerSecond,
      memoryEfficiency,
      arena: arenaId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Estimate memory efficiency
   */
  estimateMemoryEfficiency(renderTask, arenaId) {
    const { scene, renderParams } = renderTask;
    const resolution = renderParams?.resolution || { width: 800, height: 600 };
    
    const vertexCount = scene?.meshes?.reduce((sum, m) => sum + (m.vertices4D?.length || 0), 0) || 0;
    const textureMemory = 0; // textures not implemented yet
    const framebufferMemory = resolution.width * resolution.height * 16; // 4 channels * 4 bytes
    const bvhMemory = vertexCount * 32; // rough BVH estimate
    
    const totalMemory = vertexCount * 16 + textureMemory + framebufferMemory + bvhMemory;
    const gpuMemoryLimit = arenaId === 'gpu' ? 8 * 1024 * 1024 * 1024 : 16 * 1024 * 1024 * 1024; // 8GB vs 16GB system RAM
    
    return {
      totalMemoryBytes: totalMemory,
      memoryUtilization: totalMemory / gpuMemoryLimit,
      fitsInMemory: totalMemory < gpuMemoryLimit,
      vertexCount,
      framebufferMemory,
      bvhMemory,
    };
  }

  /**
   * Get current routing statistics
   */
  getStats() {
    const stats = {};
    for (const [id, metrics] of this.arenaMetrics.entries()) {
      stats[id] = {
        ...metrics,
        avgExecutionTime: metrics.successfulExecutions > 0 
          ? metrics.totalTime / metrics.successfulExecutions 
          : 0,
        successRate: metrics.executions > 0 
          ? metrics.successfulExecutions / metrics.executions 
          : 0,
      };
    }
    return {
      arenas: stats,
      hipStatus: this.hipStatus,
      totalExecutions: Array.from(this.arenaMetrics.values()).reduce((sum, m) => sum + m.executions, 0),
      efficiencyLog: this.efficiencyLog.slice(-100), // last 100 entries
    };
  }

  /**
   * Force refresh HIP SDK detection
   */
  async refreshHipDetection() {
    this.hipStatus = detectHipSdk({ invokeTools: true });
    return this.hipStatus;
  }
}

// Singleton instance
export const sovereignXRouter = new SovereignXRouter();