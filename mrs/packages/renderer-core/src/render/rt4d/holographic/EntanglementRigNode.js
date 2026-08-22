/**
 * Entanglement Tensor Rig Node
 * 
 * Each rig node as local information well
 * With CIEMS governance coordinates
 */

export class EntanglementRigNode {
  constructor(index, position) {
    this.index = index;
    this.pos = { x: position.x, y: position.y, z: position.z };
    this.normal = { x: 0, y: 0, z: 1 };
    this.tangent = { x: 1, y: 0, z: 0 };
    
    // Layer weights
    this.layerSkin = 0.0;
    this.layerMuscle = 0.0;
    this.layerBone = 0.0;
    
    // Entanglement tensor E = Σ wij * d^ij ⊗ d^ij
    this.E = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    
    this.rho = 0.0; // local activation/tension
    
    // CIEMS governance coordinates
    this.gov = {
      intent: 0.0,
      evidence: 0.0,
      conformance: 0.0,
      stewardship: 0.0
    };
    
    this.rig = null;
  }

  updateEntanglementTensor(neighbors, weights, positions) {
    // E = Σ wij * d^ij ⊗ d^ij
    // Reset tensor
    this.E = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    
    neighbors.forEach((neighborIdx, i) => {
      const weight = weights[i];
      if (weight <= 0) return;
      
      const neighborPos = positions[neighborIdx];
      
      // Direction vector d^ij
      const dx = neighborPos.x - this.pos.x;
      const dy = neighborPos.y - this.pos.y;
      const dz = neighborPos.z - this.pos.z;
      
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 1e-12;
      const d = { x: dx/dist, y: dy/dist, z: dz/dist };
      
      // Outer product d ⊗ d
      this.E[0][0] += weight * d.x * d.x;
      this.E[0][1] += weight * d.x * d.y;
      this.E[0][2] += weight * d.x * d.z;
      this.E[1][0] += weight * d.y * d.x;
      this.E[1][1] += weight * d.y * d.y;
      this.E[1][2] += weight * d.y * d.z;
      this.E[2][0] += weight * d.z * d.x;
      this.E[2][1] += weight * d.z * d.y;
      this.E[2][2] += weight * d.z * d.z;
    });
    
    // Normalize
    const trace = this.E[0][0] + this.E[1][1] + this.E[2][2];
    if (trace > 0) {
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          this.E[i][j] /= trace;
        }
      }
    }
  }

  getEntanglementMagnitude() {
    // Frobenius norm
    let sum = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        sum += this.E[i][j] * this.E[i][j];
      }
    }
    return Math.sqrt(sum);
  }

  getPrincipalEigenvectors() {
    // Simplified: return dominant direction
    // In practice, would compute full eigen decomposition
    const values = [];
    values.push(this.E[0][0]);
    values.push(this.E[1][1]);
    values.push(this.E[2][2]);
    
    const maxVal = Math.max(...values);
    const maxIdx = values.indexOf(maxVal);
    
    const eigenvectors = [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 }
    ];
    
    return {
      magnitude: maxVal,
      direction: eigenvectors[maxIdx]
    };
  }

  updateGovernance(animInput, physicsData, constraintState, healthCheck) {
    // Intent axis: what motion is trying to achieve
    this.gov.intent = animInput?.intent || 0.0;
    
    // Evidence axis: data supporting deformation
    this.gov.evidence = physicsData?.confidence || 0.0;
    
    // Conformance axis: how well deformation matches rules
    this.gov.conformance = constraintState?.conformance || 0.0;
    
    // Stewardship axis: long-term integrity
    this.gov.stewardship = healthCheck?.integrity || 0.0;
  }
}

export class EntanglementTensorRig {
  constructor(nodeCount) {
    this.nodes = [];
    this.egt = null;
    this.muscleRegions = new Map();
    
    for (let i = 0; i < nodeCount; i++) {
      this.nodes.push(new EntanglementRigNode(i, { x: 0, y: 0, z: 0 }));
    }
  }

  setEGT(egt) {
    this.egt = egt;
  }

  linkToEGT() {
    this.nodes.forEach((node, i) => {
      if (this.egt && this.egt.nodes[i]) {
        node.pos = { ...this.egt.nodes[i].position };
        node.rho = this.egt.rho[i] || 0.0;
      }
    });
  }

  computeNodeEntanglementTensors() {
    const positions = this.nodes.map(n => n.pos);
    
    this.nodes.forEach(node => {
      node.rig = this;
      const neighbors = [];
      const weights = [];
      
      this.egt.edges.forEach(edge => {
        if (edge.i === node.index) {
          neighbors.push(edge.j);
          weights.push(edge.w_ij);
        } else if (edge.j === node.index) {
          neighbors.push(edge.i);
          weights.push(edge.w_ij);
        }
      });
      
      node.updateEntanglementTensor(neighbors, weights, positions);
    });
  }

  defineMuscleRegion(muscleId, nodeIndices, fiberDir) {
    this.muscleRegions.set(muscleId, {
      nodes: nodeIndices,
      fiberDir,
      activation: 0.0
    });
  }

  mapCurvatureToMuscleActivation() {
    // From entanglement to curvature
    // First compute entanglement density εi = Σj wij
    const entanglementDensity = new Map();
    
    this.nodes.forEach(node => {
      let epsilon = 0;
      this.egt.edges.forEach(edge => {
        if (edge.i === node.index || edge.j === node.index) {
          epsilon += edge.w_ij;
        }
      });
      entanglementDensity.set(node.index, epsilon);
    });
    
    // Compute discrete Laplacian / gradient: Ki ≈ Δεi
    this.nodes.forEach(node => {
      const epsilon = entanglementDensity.get(node.index);
      let laplacian = 0;
      
      this.egt.edges.forEach(edge => {
        if (edge.i === node.index) {
          const neighborEpsilon = entanglementDensity.get(edge.j);
          laplacian += neighborEpsilon - epsilon;
        }
        if (edge.j === node.index) {
          const neighborEpsilon = entanglementDensity.get(edge.i);
          laplacian += neighborEpsilon - epsilon;
        }
      });
      
      node.egtCurvature = Math.abs(laplacian);
    });
    
    // Muscle regions: Ak = f(1/|Mk| Σi∈Mk Ki)
    this.muscleRegions.forEach((region, muscleId) => {
      const nodeCount = region.nodes.length;
      if (nodeCount === 0) return;
      
      const avgCurvature = region.nodes.reduce((sum, nodeIdx) => {
        const node = this.nodes[nodeIdx];
        return sum + (node.egtCurvature || 0);
      }, 0) / nodeCount;
      
      // Sigmoid shaping function
      const activation = 1 / (1 + Math.exp(-5 * (avgCurvature - 0.5)));
      region.activation = activation;
      
      // Node-level activation: ρi = g(Ki, Ak, fiber alignment)
      region.nodes.forEach(nodeIdx => {
        const node = this.nodes[nodeIdx];
        const fiberAlignment = this.computeFiberAlignment(nodeIdx, region.fiberDir);
        
        node.rho = this.computeNodeActivation(
          node.egtCurvature || 0,
          activation,
          fiberAlignment
        );
      });
    });
  }

  computeFiberAlignment(nodeIdx, fiberDir) {
    const node = this.nodes[nodeIdx];
    const eigen = node.getPrincipalEigenvectors();
    
    // Alignment between entanglement principal direction and fiber
    const dot = eigen.direction.x * fiberDir.x + 
                eigen.direction.y * fiberDir.y + 
                eigen.direction.z * fiberDir.z;
    
    const nodeDirMag = Math.sqrt(
      eigen.direction.x**2 + eigen.direction.y**2 + eigen.direction.z**2
    );
    const fiberMag = Math.sqrt(
      fiberDir.x**2 + fiberDir.y**2 + fiberDir.z**2
    );
    
    return Math.abs(dot / (nodeDirMag * fiberMag + 1e-12));
  }

  computeNodeActivation(curvature, muscleActivation, fiberAlignment) {
    // Higher curvature + aligned fibers = higher activation
    return muscleActivation * (0.5 + 0.5 * fiberAlignment) * 
           (0.5 + 0.5 * Math.min(1, curvature));
  }

  updateCIEMSGovernance(animationInput, physicsData) {
    // Update each node's governance coordinates
    this.nodes.forEach(node => {
      node.updateGovernance(
        animationInput ? this.getIntentForNode(node.index, animationInput) : null,
        physicsData ? this.getEvidenceForNode(node.index, physicsData) : null,
        this.getConformanceForNode(node.index),
        this.getStewardshipForNode(node.index)
      );
    });
  }

  getIntentForNode(nodeIdx, animationInput) {
    // Derive intent from animation inputs
    // Placeholder: map animation goal to node intent
    return animationInput.intensity || 0.5;
  }

  getEvidenceForNode(nodeIdx, physicsData) {
    // Evidence from physics/sensor data
    return physicsData.confidence || 0.5;
  }

  getConformanceForNode(nodeIdx) {
    // Conformance from constraint solvers
    const node = this.nodes[nodeIdx];
    const entanglementMag = node.getEntanglementMagnitude();
    
    // High entanglement magnitude = good conformance to tissue coupling
    return Math.min(1.0, entanglementMag * 2);
  }

  getStewardshipForNode(nodeIdx) {
    // Long-term integrity
    const node = this.nodes[nodeIdx];
    
    // Check for invalid states
    const posMag = Math.sqrt(
      node.pos.x**2 + node.pos.y**2 + node.pos.z**2
    );
    
    // Reasonable position magnitude
    const positionHealthy = posMag < 10 ? 1.0 : 0.5;
    
    // Reasonable activation
    const activationHealthy = node.rho <= 2.0 ? 1.0 : 0.5;
    
    return positionHealthy * activationHealthy;
  }

  aggregateGovernance() {
    // Frame-level CIEMS trace
    const N = this.nodes.length;
    
    let intentSum = 0, evidenceSum = 0, conformanceSum = 0, stewardshipSum = 0;
    
    this.nodes.forEach(node => {
      intentSum += node.gov.intent;
      evidenceSum += node.gov.evidence;
      conformanceSum += node.gov.conformance;
      stewardshipSum += node.gov.stewardship;
    });
    
    return {
      intent: intentSum / N,
      evidence: evidenceSum / N,
      conformance: conformanceSum / N,
      stewardship: stewardshipSum / N
    };
  }

  updateFrame(deltaTime, animationInput, physicsData) {
    // Per frame:
    
    // 1. Update entanglement tensors
    this.computeNodeEntanglementTensors();
    
    // 2. Map curvature to muscle activation
    this.mapCurvatureToMuscleActivation();
    
    // 3. Update CIEMS governance
    this.updateCIEMSGovernance(animationInput, physicsData);
    
    // 4. Aggregate governance trace
    const governanceTrace = this.aggregateGovernance();
    
    return governanceTrace;
  }
}

export class ConstitutionalHolographicOrganismArena {
  constructor(nodeCount) {
    this.rig = new EntanglementTensorRig(nodeCount);
    this.frameHistory = [];
  }

  initialize(egt) {
    this.rig.setEGT(egt);
    this.rig.linkToEGT();
  }

  defineAnatomy() {
    // Define muscle regions with fiber directions
    // Each muscle gets a set of nodes and fiber direction
    
    // Example: bicep
    this.rig.defineMuscleRegion('bicep', [10, 11, 12, 13, 14], {
      x: 0, y: 1, z: 0
    });
    
    // Example: tricep
    this.rig.defineMuscleRegion('tricep', [15, 16, 17, 18, 19], {
      x: 0, y: -1, z: 0
    });
    
    // Add more muscles...
  }

  processFrame(deltaTime, animationInput, physicsData) {
    // Update rig with entanglement tensors
    const governanceTrace = this.rig.updateFrame(deltaTime, animationInput, physicsData);
    
    // Store constitutional record
    this.frameHistory.push({
      frame: this.frameHistory.length,
      timestamp: Date.now(),
      governance: governanceTrace,
      nodes: this.rig.nodes.map(n => ({
        index: n.index,
        entanglementMag: n.getEntanglementMagnitude(),
        rho: n.rho,
        governance: { ...n.gov }
      }))
    });
    
    return governanceTrace;
  }

  getConstitutionalRecord() {
    return {
      totalFrames: this.frameHistory.length,
      averageGovernance: this.computeAverageGovernance(),
      recentFrames: this.frameHistory.slice(-10),
      anomalies: this.detectAnomalies()
    };
  }

  computeAverageGovernance() {
    if (this.frameHistory.length === 0) return null;
    
    const sum = this.frameHistory.reduce((acc, frame) => {
      acc.intent += frame.governance.intent;
      acc.evidence += frame.governance.evidence;
      acc.conformance += frame.governance.conformance;
      acc.stewardship += frame.governance.stewardship;
      return acc;
    }, { intent: 0, evidence: 0, conformance: 0, stewardship: 0 });
    
    const n = this.frameHistory.length;
    return {
      intent: sum.intent / n,
      evidence: sum.evidence / n,
      conformance: sum.conformance / n,
      stewardship: sum.stewardship / n
    };
  }

  detectAnomalies() {
    const anomalies = [];
    
    this.frameHistory.forEach(frame => {
      const gov = frame.governance;
      
      // Detect governance violations
      if (gov.conformance < 0.3) {
        anomalies.push({
          frame: frame.frame,
          type: 'conformance_violation',
          value: gov.conformance
        });
      }
      
      if (gov.stewardship < 0.3) {
        anomalies.push({
          frame: frame.frame,
          type: 'stewardship_violation',
          value: gov.stewardship
        });
      }
    });
    
    return anomalies;
  }
}
