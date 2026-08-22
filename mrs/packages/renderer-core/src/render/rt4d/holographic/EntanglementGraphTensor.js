/**
 * Entanglement Graph Tensor (EGT)
 * 
 * 3D boundary data structure that replaces time with entanglement information
 * 
 * EGT {
 *   Nodes: V = {v₁, v₂, ..., vₙ}
 *   Edges: E = {(vᵢ, vⱼ, wᵢⱼ)}
 *   Density: ρ(vᵢ)
 *   Curvature: K(vᵢ)
 *   CausalLinks: C = {(vᵢ → vⱼ)}
 * }
 * 
 * Status: enforced
 */

export class EntanglementGraphTensor {
  constructor(options = {}) {
    this.nodes = [];
    this.edges = [];
    this.density = [];
    this.curvature = [];
    this.causalLinks = [];
    
    this.boundaryResolution = options.boundaryResolution ?? 64;
    this.entropyPerUnitArea = options.entropyPerUnitArea ?? 1.0;
    this.alpha = options.alpha ?? 0.5; // Curvature gradient coefficient
    this.beta = options.beta ?? 0.3;   // Curvature Laplacian coefficient
    
    this.timeStep = 0;
  }

  /**
   * Create node at boundary position
   */
  createNode(position, id) {
    const node = {
      id: id ?? this.nodes.length,
      position: { x: position.x, y: position.y, z: position.z },
      rho: 0.0,      // Information density
      K: 0.0,        // Emergent curvature
      entanglementSum: 0.0,
      causalInDegree: 0,
      causalOutDegree: 0
    };
    
    this.nodes.push(node);
    this.density.push(0.0);
    this.curvature.push(0.0);
    
    return node;
  }

  /**
   * Create edge with entanglement weight
   */
  createEdge(nodeI, nodeJ, weight) {
    const edge = {
      i: nodeI,
      j: nodeJ,
      weight: Math.max(0, Math.min(1, weight)),
      mutualInformation: 0.0
    };
    
    this.edges.push(edge);
    
    // Update node entanglement sums
    this.nodes[nodeI].entanglementSum += edge.weight;
    this.nodes[nodeJ].entanglementSum += edge.weight;
    
    return edge;
  }

  /**
   * Create causal link (directed)
   */
  createCausalLink(fromNode, toNode, strength) {
    const link = {
      from: fromNode,
      to: toNode,
      strength: Math.max(0, Math.min(1, strength))
    };
    
    this.causalLinks.push(link);
    this.nodes[fromNode].causalOutDegree += 1;
    this.nodes[toNode].causalInDegree += 1;
    
    return link;
  }

  /**
   * Compute entanglement entropy for region A
   * S(A) ≈ Σ f(w_ij) for edges crossing boundary of A
   */
  computeEntanglementEntropy(regionNodes, f = (w) => w) {
    let entropy = 0.0;
    
    for (const edge of this.edges) {
      const inRegionI = regionNodes.includes(edge.i);
      const inRegionJ = regionNodes.includes(edge.j);
      
      // Edge crosses region boundary
      if (inRegionI !== inRegionJ) {
        entropy += f(edge.weight);
      }
    }
    
    return entropy;
  }

  /**
   * Compute local entanglement density at node
   */
  computeLocalEntanglementDensity(nodeId) {
    let sum = 0.0;
    let count = 0;
    
    for (const edge of this.edges) {
      if (edge.i === nodeId || edge.j === nodeId) {
        sum += edge.weight;
        count += 1;
      }
    }
    
    return count > 0 ? sum / count : 0.0;
  }

  /**
   * Compute entanglement gradient ∇ε
   */
  computeEntanglementGradient(nodeId) {
    const node = this.nodes[nodeId];
    let gradient = { x: 0, y: 0, z: 0 };
    
    for (const edge of this.edges) {
      let otherNodeId = null;
      if (edge.i === nodeId) otherNodeId = edge.j;
      if (edge.j === nodeId) otherNodeId = edge.i;
      
      if (otherNodeId !== null) {
        const otherNode = this.nodes[otherNodeId];
        const dx = otherNode.position.x - node.position.x;
        const dy = otherNode.position.y - node.position.y;
        const dz = otherNode.position.z - node.position.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 1e-12;
        
        const entropyDiff = otherNode.entanglementSum - node.entanglementSum;
        
        gradient.x += entropyDiff * dx / (dist * dist);
        gradient.y += entropyDiff * dy / (dist * dist);
        gradient.z += entropyDiff * dz / (dist * dist);
      }
    }
    
    return gradient;
  }

  /**
   * Compute emergent curvature from entanglement gradient
   * K_i = α||∇ε_i|| + β(Δε_i)
   */
  computeCurvature(nodeId) {
    const gradient = this.computeEntanglementGradient(nodeId);
    const gradientMagnitude = Math.sqrt(
      gradient.x*gradient.x + 
      gradient.y*gradient.y + 
      gradient.z*gradient.z
    );
    
    // Discrete Laplacian Δε_i = Σ(ε_j - ε_i)
    let laplacian = 0.0;
    for (const edge of this.edges) {
      if (edge.i === nodeId) {
        laplacian += this.nodes[edge.j].entanglementSum - this.nodes[nodeId].entanglementSum;
      }
      if (edge.j === nodeId) {
        laplacian += this.nodes[edge.i].entanglementSum - this.nodes[nodeId].entanglementSum;
      }
    }
    
    const curvature = this.alpha * gradientMagnitude + this.beta * Math.abs(laplacian);
    
    this.nodes[nodeId].K = curvature;
    this.curvature[nodeId] = curvature;
    
    return curvature;
  }

  /**
   * Update EGT from bulk state
   */
  updateFromBulk(bulkFields, projectionOperator) {
    // Reset
    this.edges = [];
    this.causalLinks = [];
    this.density.fill(0);
    this.curvature.fill(0);
    
    // Project bulk to boundary
    for (const field of bulkFields) {
      const boundaryPos = projectionOperator.projectPoint4DTo3D(field.position);
      const nodeId = this.findOrCreateNode(boundaryPos);
      
      // Update density (information density ∝ bulk energy)
      this.nodes[nodeId].rho += field.energy || 0.1;
      this.density[nodeId] = this.nodes[nodeId].rho;
    }
    
    // Build entanglement edges based on bulk interactions
    for (let i = 0; i < bulkFields.length; i++) {
      for (let j = i + 1; j < bulkFields.length; j++) {
        const fieldI = bulkFields[i];
        const fieldJ = bulkFields[j];
        
        // Compute interaction strength
        const interaction = this.computeInteractionStrength(fieldI, fieldJ);
        
        if (interaction > 0.01) {
          const posI = projectionOperator.projectPoint4DTo3D(fieldI.position);
          const posJ = projectionOperator.projectPoint4DTo3D(fieldJ.position);
          const nodeI = this.findOrCreateNode(posI);
          const nodeJ = this.findOrCreateNode(posJ);
          
          this.createEdge(nodeI, nodeJ, interaction);
          
          // Causal link if temporal ordering exists
          if (fieldI.position.w < fieldJ.position.w) {
            this.createCausalLink(nodeI, nodeJ, interaction);
          }
        }
      }
    }
    
    // Compute curvature for all nodes
    for (let i = 0; i < this.nodes.length; i++) {
      this.computeCurvature(i);
    }
    
    this.timeStep += 1;
  }

  /**
   * Find or create node at position
   */
  findOrCreateNode(position) {
    const tolerance = 0.1;
    
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const dist = Math.sqrt(
        (node.position.x - position.x)**2 +
        (node.position.y - position.y)**2 +
        (node.position.z - position.z)**2
      );
      
      if (dist < tolerance) {
        return i;
      }
    }
    
    return this.createNode(position).id;
  }

  /**
   * Compute interaction strength between bulk fields
   */
  computeInteractionStrength(fieldI, fieldJ) {
    const dx = fieldI.position.x - fieldJ.position.x;
    const dy = fieldI.position.y - fieldJ.position.y;
    const dz = fieldI.position.z - fieldJ.position.z;
    const dw = fieldI.position.w - fieldJ.position.w;
    
    const spatialDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const temporalDist = Math.abs(dw);
    
    // Interaction decays with distance
    const spatialWeight = Math.exp(-spatialDist * 0.5);
    const temporalWeight = Math.exp(-temporalDist * 0.1);
    
    // Field overlap
    const overlap = Math.min(fieldI.strength || 1, fieldJ.strength || 1);
    
    return spatialWeight * temporalWeight * overlap;
  }

  /**
   * Serialize EGT for storage
   */
  serialize() {
    return {
      timeStep: this.timeStep,
      nodeCount: this.nodes.length,
      edgeCount: this.edges.length,
      nodes: this.nodes.map(n => ({
        id: n.id,
        position: n.position,
        rho: n.rho,
        K: n.K,
        entanglementSum: n.entanglementSum
      })),
      edges: this.edges.map(e => ({
        i: e.i,
        j: e.j,
        weight: e.weight
      })),
      causalLinks: this.causalLinks.map(c => ({
        from: c.from,
        to: c.to,
        strength: c.strength
      }))
    };
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const totalEntropy = this.nodes.reduce((sum, n) => sum + n.entanglementSum, 0);
    const avgCurvature = this.curvature.reduce((sum, k) => sum + k, 0) / this.curvature.length || 0;
    const totalDensity = this.density.reduce((sum, r) => sum + r, 0);
    
    return {
      timeStep: this.timeStep,
      nodeCount: this.nodes.length,
      edgeCount: this.edges.length,
      causalLinkCount: this.causalLinks.length,
      totalEntropy,
      avgCurvature,
      totalDensity,
      avgEntanglementPerNode: totalEntropy / this.nodes.length || 0
    };
  }
}

export function createEntanglementGraphTensor(options) {
  return new EntanglementGraphTensor(options);
}
