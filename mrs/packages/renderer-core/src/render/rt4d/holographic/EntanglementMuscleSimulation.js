/**
 * Entanglement-Driven Muscle Simulation
 * 
 * Data model and simulation matching specification
 */

export class MuscleRegion {
  constructor(id, vertexIds, anchorVertexIds, fiberDir) {
    this.id = id;
    this.vertexIds = vertexIds;
    this.anchorVertexIds = anchorVertexIds;
    this.fiberDir = {
      x: fiberDir.x,
      y: fiberDir.y,
      z: fiberDir.z
    };
    this.activation = 0.0;
    this.entanglementScale = 0.2;
    this.contractionScale = 0.02;
    this.bulgeScale = 0.01;
    this.smoothFactor = 0.1;
  }
}

export class EntanglementMuscleSimulation {
  constructor(characterRig) {
    this.rig = characterRig;
    this.egt = characterRig.egt;
    this.muscles = new Map();
    this.vertexNormals = new Map();
    
    this.initializeVertexNormals();
  }

  initializeVertexNormals() {
    // Initialize normals for each vertex
    this.egt.nodes.forEach((node, i) => {
      // Placeholder normals - would come from mesh
      this.vertexNormals.set(i, { x: 0, y: 0, z: 1 });
    });
  }

  addMuscle(muscleId, vertexIds, anchorVertexIds, fiberDir) {
    const muscle = new MuscleRegion(muscleId, vertexIds, anchorVertexIds, fiberDir);
    this.muscles.set(muscleId, muscle);
    
    // Initialize entanglement within muscle region
    this.initializeMuscleEntanglement(muscle);
    
    return muscle;
  }

  initializeMuscleEntanglement(muscle) {
    // Muscles are clusters with strong internal wij
    for (let i = 0; i < muscle.vertexIds.length; i++) {
      for (let j = i + 1; j < muscle.vertexIds.length; j++) {
        const vi = muscle.vertexIds[i];
        const vj = muscle.vertexIds[j];
        
        // Compute alignment with fiber direction
        const posI = this.egt.nodes[vi].position;
        const posJ = this.egt.nodes[vj].position;
        
        const vec = {
          x: posJ.x - posI.x,
          y: posJ.y - posI.y,
          z: posJ.z - posI.z
        };
        
        const vecLen = Math.sqrt(vec.x**2 + vec.y**2 + vec.z**2) + 1e-12;
        const fiberLen = Math.sqrt(
          muscle.fiberDir.x**2 + muscle.fiberDir.y**2 + muscle.fiberDir.z**2
        );
        
        const alignment = Math.abs(
          (vec.x * muscle.fiberDir.x + vec.y * muscle.fiberDir.y + vec.z * muscle.fiberDir.z) /
          (vecLen * fiberLen)
        );
        
        // High entanglement for vertices along fiber direction
        const w_ij = 0.5 + alignment * 0.5;
        
        let edge = this.egt.edges.find(e => 
          (e.i === vi && e.j === vj) || (e.i === vj && e.j === vi)
        );
        
        if (edge) {
          edge.w_ij = Math.max(edge.w_ij, w_ij);
        } else {
          this.egt.addEdge(vi, vj, w_ij);
        }
      }
    }
  }

  activateMuscle(muscleId, activationSignal) {
    const muscle = this.muscles.get(muscleId);
    if (!muscle) return;
    
    muscle.activation = activationSignal;
    
    // 1. Set activation: ρi = activationSignal
    for (const vi of muscle.vertexIds) {
      this.egt.rho[vi] = activationSignal;
    }
    
    // 2. Strengthen entanglement along fibers
    for (const edge of this.egt.edges) {
      const iInMuscle = muscle.vertexIds.includes(edge.i);
      const jInMuscle = muscle.vertexIds.includes(edge.j);
      
      if (iInMuscle && jInMuscle) {
        const posI = this.egt.nodes[edge.i].position;
        const posJ = this.egt.nodes[edge.j].position;
        
        const vec = {
          x: posJ.x - posI.x,
          y: posJ.y - posI.y,
          z: posJ.z - posI.z
        };
        
        const vecLen = Math.sqrt(vec.x**2 + vec.y**2 + vec.z**2) + 1e-12;
        const fiberLen = Math.sqrt(
          muscle.fiberDir.x**2 + muscle.fiberDir.y**2 + muscle.fiberDir.z**2
        );
        
        const align = Math.abs(
          (vec.x * muscle.fiberDir.x + vec.y * muscle.fiberDir.y + vec.z * muscle.fiberDir.z) /
          (vecLen * fiberLen)
        );
        
        // Strengthen entanglement along fiber direction
        const rhoAvg = (this.egt.rho[edge.i] + this.egt.rho[edge.j]) / 2;
        edge.w_ij += rhoAvg * align * muscle.entanglementScale;
        edge.w_ij = Math.min(1.0, edge.w_ij);
      }
    }
  }

  solveMuscleDeformation(muscleId) {
    const muscle = this.muscles.get(muscleId);
    if (!muscle || muscle.activation < 0.01) return;
    
    // Get anchor center
    const anchorCenter = this.computeAnchorCenter(muscle);
    
    // 1. Contraction along fiber
    this.contractAlongFiber(muscle, anchorCenter);
    
    // 2. Bulging perpendicular to fiber
    this.bulgePerpendicular(muscle);
    
    // 3. Smooth via entanglement
    this.smoothViaEntanglement(muscle);
  }

  computeAnchorCenter(muscle) {
    const center = { x: 0, y: 0, z: 0 };
    
    muscle.anchorVertexIds.forEach(anchorIdx => {
      const pos = this.egt.nodes[anchorIdx].position;
      center.x += pos.x;
      center.y += pos.y;
      center.z += pos.z;
    });
    
    const n = muscle.anchorVertexIds.length;
    if (n > 0) {
      center.x /= n;
      center.y /= n;
      center.z /= n;
    }
    
    return center;
  }

  contractAlongFiber(muscle, anchorCenter) {
    const fiberLen = Math.sqrt(
      muscle.fiberDir.x**2 + muscle.fiberDir.y**2 + muscle.fiberDir.z**2
    );
    
    if (fiberLen < 1e-12) return;
    
    const normFiber = {
      x: muscle.fiberDir.x / fiberLen,
      y: muscle.fiberDir.y / fiberLen,
      z: muscle.fiberDir.z / fiberLen
    };
    
    for (const vi of muscle.vertexIds) {
      const pos = this.egt.nodes[vi].position;
      const rho = this.egt.rho[vi];
      
      // Project position onto fiber axis
      const vecToAnchor = {
        x: anchorCenter.x - pos.x,
        y: anchorCenter.y - pos.y,
        z: anchorCenter.z - pos.z
      };
      
      const projection = 
        vecToAnchor.x * normFiber.x +
        vecToAnchor.y * normFiber.y +
        vecToAnchor.z * normFiber.z;
      
      const projPoint = {
        x: anchorCenter.x + normFiber.x * projection,
        y: anchorCenter.y + normFiber.y * projection,
        z: anchorCenter.z + normFiber.z * projection
      };
      
      // Mix toward fiber axis (contraction)
      const contraction = rho * muscle.contractionScale;
      pos.x = pos.x * (1 - contraction) + projPoint.x * contraction;
      pos.y = pos.y * (1 - contraction) + projPoint.y * contraction;
      pos.z = pos.z * (1 - contraction) + projPoint.z * contraction;
    }
  }

  bulgePerpendicular(muscle) {
    for (const vi of muscle.vertexIds) {
      const pos = this.egt.nodes[vi].position;
      const rho = this.egt.rho[vi];
      const normal = this.vertexNormals.get(vi);
      
      if (!normal) continue;
      
      // Bulge perpendicular to fiber
      const fiberLen = Math.sqrt(
        muscle.fiberDir.x**2 + muscle.fiberDir.y**2 + muscle.fiberDir.z**2
      );
      
      const normFiber = {
        x: muscle.fiberDir.x / fiberLen,
        y: muscle.fiberDir.y / fiberLen,
        z: muscle.fiberDir.z / fiberLen
      };
      
      // Project normal onto plane perpendicular to fiber
      const dot = normal.x * normFiber.x + normal.y * normFiber.y + normal.z * normFiber.z;
      
      const perpNormal = {
        x: normal.x - normFiber.x * dot,
        y: normal.y - normFiber.y * dot,
        z: normal.z - normFiber.z * dot
      };
      
      const perpLen = Math.sqrt(perpNormal.x**2 + perpNormal.y**2 + perpNormal.z**2) + 1e-12;
      
      if (perpLen > 1e-12) {
        const bulge = rho * muscle.bulgeScale;
        pos.x += (perpNormal.x / perpLen) * bulge;
        pos.y += (perpNormal.y / perpLen) * bulge;
        pos.z += (perpNormal.z / perpLen) * bulge;
      }
    }
  }

  smoothViaEntanglement(muscle) {
    // Create copy for smoothing
    const positions = new Map();
    
    muscle.vertexIds.forEach(vi => {
      const pos = this.egt.nodes[vi].position;
      positions.set(vi, { x: pos.x, y: pos.y, z: pos.z });
    });
    
    // Entanglement smoothing
    muscle.vertexIds.forEach(vi => {
      const pos = positions.get(vi);
      let avg = { x: 0, y: 0, z: 0 };
      let wSum = 0;
      
      // Find neighbors
      this.egt.edges.forEach(edge => {
        let neighborIdx = null;
        if (edge.i === vi) neighborIdx = edge.j;
        if (edge.j === vi) neighborIdx = edge.i;
        
        if (neighborIdx !== null && muscle.vertexIds.includes(neighborIdx)) {
          const nPos = positions.get(neighborIdx);
          if (nPos) {
            avg.x += nPos.x * edge.w_ij;
            avg.y += nPos.y * edge.w_ij;
            avg.z += nPos.z * edge.w_ij;
            wSum += edge.w_ij;
          }
        }
      });
      
      if (wSum > 0) {
        avg.x /= wSum;
        avg.y /= wSum;
        avg.z /= wSum;
        
        // Mix original with average
        const factor = muscle.smoothFactor;
        pos.x = pos.x * (1 - factor) + avg.x * factor;
        pos.y = pos.y * (1 - factor) + avg.y * factor;
        pos.z = pos.z * (1 - factor) + avg.z * factor;
      }
    });
    
    // Apply smoothed positions
    muscle.vertexIds.forEach(vi => {
      const pos = positions.get(vi);
      const nodePos = this.egt.nodes[vi].position;
      nodePos.x = pos.x;
      nodePos.y = pos.y;
      nodePos.z = pos.z;
    });
  }

  updateMuscleActivation(muscleId, deltaTime) {
    const muscle = this.muscles.get(muscleId);
    if (!muscle) return;
    
    // Decay activation
    muscle.activation *= Math.exp(-deltaTime * 1.5);
    
    // Decay rho
    muscle.vertexIds.forEach(vi => {
      this.egt.rho[vi] *= Math.exp(-deltaTime * 1.0);
    });
  }

  updateCurvatureAndShading() {
    // Recompute εᵢ = Σⱼ wᵢⱼ
    const entanglementDensity = new Map();
    
    this.egt.nodes.forEach((node, i) => {
      let epsilon = 0;
      this.egt.edges.forEach(edge => {
        if (edge.i === i || edge.j === i) {
          epsilon += edge.w_ij;
        }
      });
      entanglementDensity.set(i, epsilon);
    });
    
    // Recompute Kᵢ from gradients/Laplacian
    for (let i = 0; i < this.egt.nodes.length; i++) {
      // Compute gradient
      const grad = this.computeEntanglementGradient(i, entanglementDensity);
      const gradMag = Math.sqrt(grad.x**2 + grad.y**2 + grad.z**2);
      
      // Compute Laplacian
      const laplacian = this.computeEntanglementLaplacian(i, entanglementDensity);
      
      // Curvature proxy
      this.egt.K[i] = 0.5 * gradMag + 0.3 * Math.abs(laplacian);
    }
  }

  computeEntanglementGradient(nodeIdx, entanglementDensity) {
    const node = this.egt.nodes[nodeIdx];
    const epsilon = entanglementDensity.get(nodeIdx);
    
    let grad = { x: 0, y: 0, z: 0 };
    
    this.egt.edges.forEach(edge => {
      let otherIdx = null;
      if (edge.i === nodeIdx) otherIdx = edge.j;
      if (edge.j === nodeIdx) otherIdx = edge.i;
      
      if (otherIdx !== null) {
        const otherNode = this.egt.nodes[otherIdx];
        const otherEpsilon = entanglementDensity.get(otherIdx);
        
        const dx = otherNode.position.x - node.position.x;
        const dy = otherNode.position.y - node.position.y;
        const dz = otherNode.position.z - node.position.z;
        const distSq = dx*dx + dy*dy + dz*dz + 1e-12;
        
        const diff = otherEpsilon - epsilon;
        
        grad.x += diff * dx / distSq;
        grad.y += diff * dy / distSq;
        grad.z += diff * dz / distSq;
      }
    });
    
    return grad;
  }

  computeEntanglementLaplacian(nodeIdx, entanglementDensity) {
    const epsilon = entanglementDensity.get(nodeIdx);
    let laplacian = 0;
    
    this.egt.edges.forEach(edge => {
      if (edge.i === nodeIdx) {
        const otherEpsilon = entanglementDensity.get(edge.j);
        laplacian += otherEpsilon - epsilon;
      }
      if (edge.j === nodeIdx) {
        const otherEpsilon = entanglementDensity.get(edge.i);
        laplacian += otherEpsilon - epsilon;
      }
    });
    
    return laplacian;
  }

  getShaderInputs(muscleId) {
    const muscle = this.muscles.get(muscleId);
    if (!muscle) return [];
    
    return muscle.vertexIds.map(vi => {
      const node = this.egt.nodes[vi];
      const rho = this.egt.rho[vi];
      const K = this.egt.K[vi];
      
      // Compute entanglement sum w_sum
      let w_sum = 0;
      this.egt.edges.forEach(edge => {
        if (edge.i === vi || edge.j === vi) {
          w_sum += edge.w_ij;
        }
      });
      
      return {
        position: node.position,
        rho,
        w_sum,
        K,
        normal: this.vertexNormals.get(vi)
      };
    });
  }

  updateFrame(deltaTime, activations) {
    // Update per frame
    
    // 1. Read control signals → muscle activations
    activations.forEach(({ muscleId, signal }) => {
      this.activateMuscle(muscleId, signal);
    });
    
    // 2. Update ρ and w for each muscle
    this.muscles.forEach((muscle, id) => {
      this.solveMuscleDeformation(id);
    });
    
    // 3. Recompute ε, K
    this.updateCurvatureAndShading();
    
    // 4. Decay activations
    this.muscles.forEach((muscle, id) => {
      this.updateMuscleActivation(id, deltaTime);
    });
  }

  getMuscleState(muscleId) {
    const muscle = this.muscles.get(muscleId);
    if (!muscle) return null;
    
    const avgRho = muscle.vertexIds.reduce((sum, vi) => sum + this.egt.rho[vi], 0) / muscle.vertexIds.length;
    const avgK = muscle.vertexIds.reduce((sum, vi) => sum + this.egt.K[vi], 0) / muscle.vertexIds.length;
    
    let avgWij = 0;
    let edgeCount = 0;
    muscle.vertexIds.forEach(vi => {
      this.egt.edges.forEach(edge => {
        if (edge.i === vi || edge.j === vi) {
          if (muscle.vertexIds.includes(edge.i) && muscle.vertexIds.includes(edge.j)) {
            avgWij += edge.w_ij;
            edgeCount++;
          }
        }
      });
    });
    avgWij = edgeCount > 0 ? avgWij / edgeCount : 0;
    
    return {
      muscleId,
      activation: muscle.activation,
      avgRho,
      avgK,
      avgEntanglement: avgWij,
      vertexCount: muscle.vertexIds.length
    };
  }
}
