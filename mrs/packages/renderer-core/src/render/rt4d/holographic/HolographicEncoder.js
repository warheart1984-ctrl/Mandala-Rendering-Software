/**
 * Holographic Encoder
 * 
 * Transforms 4D bulk spacetime to 3D boundary entanglement graph
 * 
 * Pipeline: BulkSpacetime → BoundaryProjection → EGT → EFR
 * 
 * Status: enforced
 */

import { EntanglementGraphTensor } from './EntanglementGraphTensor.js';
import { ProjectionTensor } from './ProjectionTensor.js';

export class HolographicEncoder {
  constructor(options = {}) {
    this.c = options.c ?? 1.0;
    this.projectionTensor = new ProjectionTensor({ c: this.c });
    this.egt = new EntanglementGraphTensor(options);
    
    this.boundaryResolution = options.boundaryResolution ?? 64;
    this.maxEntanglementDistance = options.maxEntanglementDistance ?? 10.0;
    
    this.history = [];
  }

  /**
   * Build EGT from bulk spacetime state
   */
  buildEGT(bulkState) {
    // Reset EGT
    this.egt = new EntanglementGraphTensor();
    
    // Extract fields and worldlines
    const fields = bulkState.fields || [];
    const worldlines = bulkState.worldlines || [];
    
    // Combine into unified bulk elements
    const bulkElements = [
      ...fields.map(f => ({ 
        position: f.position, 
        energy: f.energy,
        strength: f.strength || 1.0
      })),
      ...worldlines.map(w => ({
        position: w.position,
        energy: w.mass || 0.1,
        strength: w.density || 1.0
      }))
    ];
    
    // Update EGT from bulk
    this.egt.updateFromBulk(bulkElements, {
      projectPoint4DTo3D: (point) => this.projectPoint4DTo3D(point)
    });
    
    // Store in history
    this.history.push({
      timeStep: this.egt.timeStep,
      egt: this.egt.serialize(),
      bulkState: {
        fieldCount: fields.length,
        worldlineCount: worldlines.length
      }
    });
    
    // Keep history bounded
    if (this.history.length > 100) {
      this.history.shift();
    }
    
    return this.egt;
  }

  /**
   * Project 4D point to 3D boundary
   */
  projectPoint4DTo3D(point4D) {
    const result = this.projectionTensor.projectVector(point4D);
    return result.projected;
  }

  /**
   * Update EGT with new bulk state
   */
  updateEGT(bulkState) {
    return this.buildEGT(bulkState);
  }

  /**
   * Get entanglement entropy for region
   */
  getEntanglementEntropy(regionNodes) {
    return this.egt.computeEntanglementEntropy(regionNodes);
  }

  /**
   * Get boundary curvature field
   */
  getBoundaryCurvature() {
    return {
      nodes: this.egt.nodes,
      curvature: this.egt.curvature,
      density: this.egt.density
    };
  }

  /**
   * Get causal structure
   */
  getCausalStructure() {
    return {
      links: this.egt.causalLinks,
      nodes: this.egt.nodes
    };
  }

  /**
   * Reconstruct approximate bulk from boundary
   * 
   * Inverse holographic map (approximate)
   */
  reconstructBulkFromBoundary(egt = this.egt) {
    const bulkFields = [];
    
    for (const node of egt.nodes) {
      // Reconstruct bulk point from boundary
      // Approximate: time ∝ entanglement entropy
      const reconstructedTime = node.entanglementSum * 0.1;
      
      bulkFields.push({
        position: {
          x: node.position.x,
          y: node.position.y,
          z: node.position.z,
          w: reconstructedTime
        },
        energy: node.rho,
        strength: node.entanglementSum
      });
    }
    
    return {
      fields: bulkFields,
      reconstructionQuality: this.estimateReconstructionQuality(egt)
    };
  }

  /**
   * Estimate reconstruction quality
   */
  estimateReconstructionQuality(egt) {
    const avgEntanglement = egt.nodes.reduce((sum, n) => 
      sum + n.entanglementSum, 0) / egt.nodes.length || 0;
    const avgCurvature = egt.curvature.reduce((sum, k) => 
      sum + k, 0) / egt.curvature.length || 0;
    
    // Quality based on information content
    return {
      informationContent: avgEntanglement,
      curvatureRichness: avgCurvature,
      nodeCount: egt.nodes.length,
      edgeCount: egt.edges.length,
      qualityScore: Math.min(1.0, avgEntanglement * 0.5 + avgCurvature * 0.5)
    };
  }

  /**
   * Get holographic screen representation
   */
  getHolographicScreen(options = {}) {
    const { mode = 'entanglement' } = options;
    
    switch (mode) {
      case 'entanglement':
        return this.getEntanglementField();
      case 'curvature':
        return this.getCurvatureField();
      case 'causal':
        return this.getCausalFlowField();
      case 'composite':
        return this.getCompositeField();
      default:
        return this.getEntanglementField();
    }
  }

  /**
   * Get entanglement field for rendering
   */
  getEntanglementField() {
    return {
      vertices: this.egt.nodes.map(n => n.position),
      colors: this.egt.nodes.map(n => ({
        r: Math.min(1, n.entanglementSum),
        g: 0,
        b: 1 - Math.min(1, n.entanglementSum)
      })),
      densities: this.egt.density,
      edges: this.egt.edges
    };
  }

  /**
   * Get curvature field for rendering
   */
  getCurvatureField() {
    return {
      vertices: this.egt.nodes.map(n => n.position),
      curvature: this.egt.curvature,
      densities: this.egt.density
    };
  }

  /**
   * Get causal flow field
   */
  getCausalFlowField() {
    const flows = [];
    
    for (const link of this.egt.causalLinks) {
      const from = this.egt.nodes[link.from];
      const to = this.egt.nodes[link.to];
      
      flows.push({
        start: from.position,
        end: to.position,
        strength: link.strength
      });
    }
    
    return {
      flows,
      nodes: this.egt.nodes
    };
  }

  /**
   * Get composite field
   */
  getCompositeField() {
    return {
      entanglement: this.getEntanglementField(),
      curvature: this.getCurvatureField(),
      causal: this.getCausalFlowField()
    };
  }

  /**
   * Export EGT for serialization
   */
  exportEGT() {
    return {
      timeStep: this.egt.timeStep,
      summary: this.egt.getSummary(),
      egt: this.egt.serialize(),
      history: this.history
    };
  }

  /**
   * Import EGT
   */
  importEGT(data) {
    this.egt.timeStep = data.timeStep || 0;
    this.history = data.history || [];
    return this.egt;
  }
}

/**
 * Factory functions
 */
export function createHolographicEncoder(options) {
  return new HolographicEncoder(options);
}

export function encodeBulkToBoundary(bulkState, options = {}) {
  const encoder = new HolographicEncoder(options);
  return encoder.buildEGT(bulkState);
}
