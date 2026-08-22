/**
 * RT4D Holographic Integration
 * 
 * Integrates holographic encoding into RT4D pipeline
 * 
 * Bulk → Boundary → Dual Rendering
 * 
 * Status: enforced
 */

import { HolographicEncoder } from './HolographicEncoder.js';
import { EntanglementRenderer } from './EntanglementRenderer.js';
import { ProjectionTensor } from './ProjectionTensor.js';

export class RT4DHolographicIntegration {
  constructor(options = {}) {
    this.c = options.c ?? 1.0;
    this.encoder = new HolographicEncoder(options);
    this.renderer = new EntanglementRenderer(options);
    this.projectionTensor = new ProjectionTensor({ c: this.c });
    
    this.viewMode = options.viewMode ?? 'bulk'; // 'bulk', 'boundary', 'composite'
    this.renderMode = options.renderMode ?? 'composite';
    
    this.bulkState = null;
    this.boundaryEGT = null;
    this.frameCount = 0;
  }

  /**
   * Process frame with holographic duality
   */
  processFrame(bulkState, dt) {
    this.frameCount += 1;
    this.bulkState = bulkState;
    
    // Step 1: Update bulk
    if (bulkState.update) {
      bulkState.update(dt);
    }
    
    // Step 2: Encode to boundary
    this.boundaryEGT = this.encoder.buildEGT(bulkState);
    
    // Step 3: Render based on view mode
    const renderData = this.renderFrame();
    
    return {
      frame: this.frameCount,
      bulkState,
      boundaryEGT: this.boundaryEGT,
      renderData,
      viewMode: this.viewMode
    };
  }

  /**
   * Render frame based on view mode
   */
  renderFrame() {
    switch (this.viewMode) {
      case 'bulk':
        return this.renderBulk();
      case 'boundary':
        return this.renderBoundary();
      case 'composite':
        return this.renderComposite();
      default:
        return this.renderBulk();
    }
  }

  /**
   * Render bulk view
   */
  renderBulk() {
    return {
      type: 'bulk',
      data: this.bulkState,
      projection: '4D spacetime'
    };
  }

  /**
   * Render boundary view
   */
  renderBoundary() {
    return {
      type: 'boundary',
      data: this.renderer.renderBoundary(
        this.boundaryEGT,
        null,
        this.renderMode
      ),
      projection: '3D entanglement'
    };
  }

  /**
   * Render composite view
   */
  renderComposite() {
    return {
      type: 'composite',
      bulk: this.renderBulk(),
      boundary: this.renderBoundary(),
      duality: {
        bulkToBoundary: true,
        boundaryToBulk: true,
        reconstructable: true
      }
    };
  }

  /**
   * Set view mode
   */
  setViewMode(mode) {
    this.viewMode = mode;
  }

  /**
   * Set render mode
   */
  setRenderMode(mode) {
    this.renderMode = mode;
    this.renderer.renderMode = mode;
  }

  /**
   * Get holographic screen
   */
  getHolographicScreen() {
    if (!this.boundaryEGT) return null;
    
    return {
      egt: this.boundaryEGT.serialize(),
      summary: this.boundaryEGT.getSummary(),
      renderData: this.renderer.exportRenderData(this.boundaryEGT)
    };
  }

  /**
   * Get dual representation
   */
  getDualRepresentation() {
    if (!this.bulkState || !this.boundaryEGT) return null;
    
    const reconstructed = this.encoder.reconstructBulkFromBoundary();
    
    return {
      bulk: this.bulkState,
      boundary: this.boundaryEGT,
      reconstructed,
      consistency: {
        originalFieldCount: this.bulkState.fields?.length || 0,
        boundaryNodeCount: this.boundaryEGT.nodes.length,
        reconstructedFieldCount: reconstructed.fields.length,
        qualityScore: reconstructed.reconstructionQuality.qualityScore
      }
    };
  }

  /**
   * Update holographic encoding parameters
   */
  updateParameters(params) {
    if (params.c !== undefined) this.c = params.c;
    if (params.warpScale !== undefined) this.renderer.warpScale = params.warpScale;
    if (params.flowSpeed !== undefined) this.renderer.flowSpeed = params.flowSpeed;
    if (params.entropyPerUnitArea !== undefined) {
      this.encoder.egt.entropyPerUnitArea = params.entropyPerUnitArea;
    }
  }

  /**
   * Export frame data
   */
  exportFrame() {
    return {
      frame: this.frameCount,
      viewMode: this.viewMode,
      bulkState: this.bulkState,
      boundaryEGT: this.boundaryEGT?.serialize(),
      holographicScreen: this.getHolographicScreen(),
      dualRepresentation: this.getDualRepresentation()
    };
  }

  /**
   * Create boundary mesh from EGT
   */
  createBoundaryMesh() {
    if (!this.boundaryEGT) return null;
    
    const vertices = [];
    const indices = [];
    
    // Create mesh from EGT nodes
    for (const node of this.boundaryEGT.nodes) {
      vertices.push(node.position.x, node.position.y, node.position.z);
    }
    
    // Create edges
    for (const edge of this.boundaryEGT.edges) {
      indices.push(edge.i, edge.j);
    }
    
    return {
      vertices,
      indices,
      nodeCount: this.boundaryEGT.nodes.length,
      edgeCount: this.boundaryEGT.edges.length
    };
  }

  /**
   * Get frame loop template
   */
  getFrameLoopTemplate() {
    return `
while (running) {
    // 1. Simulate bulk
    bulk.stepBulk(dt);
    
    // 2. Encode to boundary
    holographicEncoder.updateEGT(egt, bulk);
    
    // 3. Render based on view mode
    if (viewMode == BULK)
        renderBulk(bulk);
    else if (viewMode == BOUNDARY)
        entanglementRenderer.renderBoundary(egt, boundaryMesh, mode);
    else
        renderCombined(bulk, egt, boundaryMesh);
}
`;
  }
}

/**
 * Factory functions
 */
export function createRT4DHolographicIntegration(options) {
  return new RT4DHolographicIntegration(options);
}

export function createHolographicFrameLoop(bulkEngine, options = {}) {
  const integration = new RT4DHolographicIntegration(options);
  
  return {
    processFrame: (dt) => integration.processFrame(bulkEngine.state, dt),
    setViewMode: (mode) => integration.setViewMode(mode),
    getDualRepresentation: () => integration.getDualRepresentation(),
    exportFrame: () => integration.exportFrame()
  };
}
