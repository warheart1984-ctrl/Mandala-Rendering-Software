/**
 * Entanglement-Driven Muscle Simulation
 * 
 * Muscles as clusters of strongly entangled boundary nodes
 */

export class MuscleEntanglementSimulation {
  constructor(characterRig) {
    this.rig = characterRig;
    this.egt = characterRig.egt;
    this.muscles = new Map();
    this.fiberDirections = new Map();
    this.boneAnchors = new Map();
  }

  defineMuscle(muscleId, vertexIndices, fiberDirection) {
    this.muscles.set(muscleId, {
      vertices: vertexIndices,
      fiberDirection,
      activation: 0.0,
      restLength: this.computeRestLength(vertexIndices),
      currentLength: this.computeCurrentLength(vertexIndices)
    });
    
    this.fiberDirections.set(muscleId, fiberDirection);
    
    // Initialize entanglement within muscle group
    this.initializeMuscleEntanglement(muscleId, vertexIndices);
    
    return muscleId;
  }

  initializeMuscleEntanglement(muscleId, vertexIndices) {
    // High wij where tissue is tightly coupled
    for (let i = 0; i < vertexIndices.length; i++) {
      for (let j = i + 1; j < vertexIndices.length; j++) {
        const vi = vertexIndices[i];
        const vj = vertexIndices[j];
        
        // Same muscle, same fiber direction → high entanglement
        const edgeW = this.computeEntanglementWeight(vi, vj, muscleId);
        let edge = this.egt.edges.find(e => 
          (e.i === vi && e.j === vj) || (e.i === vj && e.j === vi)
        );
        
        if (edge) {
          edge.w_ij = Math.max(edge.w_ij, edgeW);
        } else {
          this.egt.addEdge(vi, vj, edgeW);
        }
      }
    }
  }

  computeEntanglementWeight(vi, vj, muscleId) {
    const posI = this.egt.nodes[vi].position;
    const posJ = this.egt.nodes[vj].position;
    
    // Distance-based coupling
    const dx = posI.x - posJ.x;
    const dy = posI.y - posJ.y;
    const dz = posI.z - posJ.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    
    // Fiber direction alignment
    const fiberDir = this.fiberDirections.get(muscleId);
    const vec = { x: posJ.x - posI.x, y: posJ.y - posI.y, z: posJ.z - posI.z };
    const alignment = this.dotProduct(vec, fiberDir) / 
                      (Math.sqrt(vec.x**2 + vec.y**2 + vec.z**2) * 
                       Math.sqrt(fiberDir.x**2 + fiberDir.y**2 + fiberDir.z**2) + 1e-12);
    
    // High entanglement for close vertices along fiber
    return Math.exp(-dist * 0.5) * Math.max(0, alignment) * 0.8 + 0.2;
  }

  activateMuscle(muscleId, intensity, duration = 1.0) {
    const muscle = this.muscles.get(muscleId);
    if (!muscle) return;
    
    muscle.activation = intensity;
    
    // Muscle fire: ρi(t)↑ and wij(t)↑ along fiber direction
    muscle.vertices.forEach(vi => {
      // Increase density
      this.egt.rho[vi] += intensity * 0.3;
      
      // Strengthen entanglement along fiber
      this.egt.edges.forEach(edge => {
        if (edge.i === vi || edge.j === vi) {
          const otherIdx = edge.i === vi ? edge.j : edge.i;
          if (muscle.vertices.includes(otherIdx)) {
            const fiberDir = this.fiberDirections.get(muscleId);
            const posI = this.egt.nodes[vi].position;
            const posJ = this.egt.nodes[otherIdx].position;
            
            const vec = { 
              x: posJ.x - posI.x, 
              y: posJ.y - posI.y, 
              z: posJ.z - posI.z 
            };
            const alignment = this.dotProduct(vec, fiberDir) / 
                              (Math.sqrt(vec.x**2 + vec.y**2 + vec.z**2) + 1e-12);
            
            if (alignment > 0.5) {
              edge.w_ij += intensity * alignment * 0.2;
            }
          }
        }
      });
    });
    
    // Solve local deformation field
    this.solveMuscleDeformation(muscleId);
  }

  solveMuscleDeformation(muscleId) {
    const muscle = this.muscles.get(muscleId);
    const fiberDir = this.fiberDirections.get(muscleId);
    
    // Bone anchors = fixed nodes
    const anchors = this.getMuscleAnchors(muscleId);
    
    if (anchors.length === 0) return;
    
    // Compute deformation field from entanglement + anchors
    muscle.vertices.forEach(vi => {
      const pos = this.egt.nodes[vi].position;
      const rho = this.egt.rho[vi];
      
      // Find nearest anchor
      let nearestAnchor = null;
      let minDist = Infinity;
      
      anchors.forEach(anchorIdx => {
        const anchorPos = this.egt.nodes[anchorIdx].position;
        const dist = Math.sqrt(
          (pos.x - anchorPos.x)**2 + 
          (pos.y - anchorPos.y)**2 + 
          (pos.z - anchorPos.z)**2
        );
        
        if (dist < minDist) {
          minDist = dist;
          nearestAnchor = anchorPos;
        }
      });
      
      if (nearestAnchor) {
        // Muscle pulls toward anchor along fiber
        const dirVec = {
          x: nearestAnchor.x - pos.x,
          y: nearestAnchor.y - pos.y,
          z: nearestAnchor.z - pos.z
        };
        
        const alongFiber = this.dotProduct(dirVec, fiberDir) / 
                           Math.sqrt(fiberDir.x**2 + fiberDir.y**2 + fiberDir.z**2);
        
        if (alongFiber > 0) {
          // Shortening along fiber axis
          const shortenFactor = rho * 0.02;
          pos.x += fiberDir.x * shortenFactor;
          pos.y += fiberDir.y * shortenFactor;
          pos.z += fiberDir.z * shortenFactor;
          
          // Bulging perpendicular to fiber
          const perpVec = {
            x: pos.x - nearestAnchor.x,
            y: pos.y - nearestAnchor.y,
            z: pos.z - nearestAnchor.z
          };
          
          // Project out fiber direction
          const fiberDot = this.dotProduct(perpVec, fiberDir);
          const fiberLen = Math.sqrt(fiberDir.x**2 + fiberDir.y**2 + fiberDir.z**2);
          
          perpVec.x -= fiberDir.x * fiberDot / (fiberLen**2);
          perpVec.y -= fiberDir.y * fiberDot / (fiberLen**2);
          perpVec.z -= fiberDir.z * fiberDot / (fiberLen**2);
          
          const perpMag = Math.sqrt(perpVec.x**2 + perpVec.y**2 + perpVec.z**2);
          if (perpMag > 1e-12) {
            const bulgeFactor = rho * 0.01;
            pos.x += perpVec.x / perpMag * bulgeFactor;
            pos.y += perpVec.y / perpMag * bulgeFactor;
            pos.z += perpVec.z / perpMag * bulgeFactor;
          }
        }
      }
    });
    
    // Skin sliding over deeper tissue
    this.handleSkinSliding(muscleId);
  }

  handleSkinSliding(muscleId) {
    const muscle = this.muscles.get(muscleId);
    
    muscle.vertices.forEach(vi => {
      // Skin vertices can slide relative to muscle
      // Increase entanglement with neighbors to simulate sliding
      this.egt.edges.forEach(edge => {
        if (edge.i === vi && muscle.vertices.includes(edge.j)) {
          edge.w_ij *= 0.95; // Slight decrease = sliding
        }
        if (edge.j === vi && muscle.vertices.includes(edge.i)) {
          edge.w_ij *= 0.95;
        }
      });
    });
  }

  getMuscleAnchors(muscleId) {
    return this.boneAnchors.get(muscleId) || [];
  }

  setMuscleAnchors(muscleId, anchorVertexIndices) {
    this.boneAnchors.set(muscleId, anchorVertexIndices);
  }

  computeRestLength(vertexIndices) {
    let totalLength = 0;
    for (let i = 0; i < vertexIndices.length - 1; i++) {
      const p1 = this.egt.nodes[vertexIndices[i]].position;
      const p2 = this.egt.nodes[vertexIndices[i + 1]].position;
      const dist = Math.sqrt(
        (p2.x - p1.x)**2 + (p2.y - p1.y)**2 + (p2.z - p1.z)**2
      );
      totalLength += dist;
    }
    return totalLength;
  }

  computeCurrentLength(vertexIndices) {
    return this.computeRestLength(vertexIndices);
  }

  dotProduct(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  update(deltaTime) {
    // Decay activation
    this.muscles.forEach((muscle, id) => {
      muscle.activation *= Math.exp(-deltaTime * 2.0);
      
      // Decay rho
      muscle.vertices.forEach(vi => {
        this.egt.rho[vi] *= Math.exp(-deltaTime * 1.0);
      });
    });
    
    // Recompute curvature
    for (let i = 0; i < this.egt.nodes.length; i++) {
      this.egt.computeCurvature(i);
    }
  }

  getMuscleState(muscleId) {
    const muscle = this.muscles.get(muscleId);
    if (!muscle) return null;
    
    const avgRho = muscle.vertices.reduce((sum, vi) => sum + this.egt.rho[vi], 0) / muscle.vertices.length;
    
    let avgEntanglement = 0;
    let edgeCount = 0;
    muscle.vertices.forEach(vi => {
      this.egt.edges.forEach(edge => {
        if (edge.i === vi || edge.j === vi) {
          if (muscle.vertices.includes(edge.i) && muscle.vertices.includes(edge.j)) {
            avgEntanglement += edge.w_ij;
            edgeCount++;
          }
        }
      });
    });
    avgEntanglement = edgeCount > 0 ? avgEntanglement / edgeCount : 0;
    
    return {
      activation: muscle.activation,
      avgDensity: avgRho,
      avgEntanglement,
      vertices: muscle.vertices.length
    };
  }
}

export class FacialEntanglementRig {
  constructor(characterRig) {
    this.rig = characterRig;
    this.egt = characterRig.egt;
    this.expressionZones = new Map();
    this.muscleMap = new Map();
    
    this.initializeFacialMapping();
  }

  initializeFacialMapping() {
    // Define facial regions
    this.expressionZones.set('eyebrows', { vertices: [], muscles: ['frontalis'] });
    this.expressionZones.set('eyelids', { vertices: [], muscles: ['orbicularis_oculi'] });
    this.expressionZones.set('nose', { vertices: [], muscles: ['nasalis'] });
    this.expressionZones.set('cheeks', { vertices: [], muscles: ['zygomaticus_major', 'zygomaticus_minor'] });
    this.expressionZones.set('lips', { vertices: [], muscles: ['orbicularis_oris', 'levator_labii'] });
    this.expressionZones.set('jaw', { vertices: [], muscles: ['masseter', 'temporalis'] });
    
    // Initialize entanglement for expression zones
    this.expressionZones.forEach((zone, name) => {
      this.initializeZoneEntanglement(name, zone.vertices);
    });
  }

  initializeZoneEntanglement(zoneName, vertexIndices) {
    // High wij for shared expression zones
    for (let i = 0; i < vertexIndices.length; i++) {
      for (let j = i + 1; j < vertexIndices.length; j++) {
        const vi = vertexIndices[i];
        const vj = vertexIndices[j];
        
        // Expression zone coupling
        const wij = 0.7 + Math.random() * 0.3;
        let edge = this.egt.edges.find(e => 
          (e.i === vi && e.j === vj) || (e.i === vj && e.j === vi)
        );
        
        if (edge) {
          edge.w_ij = Math.max(edge.w_ij, wij);
        } else {
          this.egt.addEdge(vi, vj, wij);
        }
      }
    }
  }

  express(expressionName, intensity, duration = 1.0) {
    const expressionMap = {
      smile: {
        zones: ['cheeks', 'lips'],
        muscleActivation: { zygomaticus_major: intensity, orbicularis_oris: intensity * 0.5 },
        entanglementPatterns: [
          { from: 'mouth_corners', to: 'cheeks', strength: intensity }
        ],
        causalFlow: { direction: [1, 0.5, 0], origin: 'mouth_corners', target: 'eyes' }
      },
      frown: {
        zones: ['eyebrows', 'nose'],
        muscleActivation: { frontalis: -intensity, corrugator: intensity },
        entanglementPatterns: [
          { from: 'eyebrows_inner', to: 'nose_bridge', strength: intensity }
        ],
        causalFlow: { direction: [-0.5, 0.8, 0], origin: 'eyebrows_inner', target: 'nose' }
      },
      blink: {
        zones: ['eyelids'],
        muscleActivation: { orbicularis_oculi: intensity * 2 },
        entanglementPatterns: [
          { from: 'upper_lid', to: 'lower_lid', strength: intensity }
        ],
        duration: 0.2
      },
      surprise: {
        zones: ['eyebrows', 'eyelids', 'lips'],
        muscleActivation: { frontalis: intensity, orbicularis_oculi: -intensity * 0.5, levator_labii: intensity },
        entanglementPatterns: [
          { from: 'eyebrows', to: 'eyelids', strength: intensity },
          { from: 'lips', to: 'cheeks', strength: intensity * 0.7 }
        ],
        causalFlow: { direction: [0, 1, 0], origin: 'eyebrows', target: 'forehead' }
      }
    };

    const expr = expressionMap[expressionName];
    if (!expr) return;

    // Increase ρ around muscle regions
    Object.entries(expr.muscleActivation).forEach(([muscle, actIntensity]) => {
      const muscleVertices = this.getMuscleVertices(muscle);
      muscleVertices.forEach(vi => {
        this.egt.rho[vi] += Math.abs(actIntensity) * 0.4;
      });
    });

    // Strengthen entanglement
    expr.entanglementPatterns?.forEach(pattern => {
      this.strengthenEntanglement(pattern.from, pattern.to, pattern.strength);
    });

    // Add causal flow
    if (expr.causalFlow) {
      this.addCausalFlow(expr.causalFlow);
    }

    // Update rig
    this.updateFacialRig();
  }

  strengthenEntanglement(fromZone, toZone, strength) {
    const fromVertices = this.getZoneVertices(fromZone);
    const toVertices = this.getZoneVertices(toZone);
    
    fromVertices.forEach(vi => {
      toVertices.forEach(vj => {
        const edge = this.egt.edges.find(e => 
          (e.i === vi && e.j === vj) || (e.i === vj && e.j === vi)
        );
        
        if (edge) {
          edge.w_ij += strength * 0.3;
        } else {
          this.egt.addEdge(vi, vj, strength * 0.5);
        }
      });
    });
  }

  addCausalFlow(flow) {
    // Store causal links for directed motion
    const fromVertices = this.getZoneVertices(flow.origin);
    const toVertices = this.getZoneVertices(flow.target);
    
    fromVertices.forEach(vi => {
      toVertices.forEach(vj => {
        this.egt.addCausalLink(vi, vj, 0.8);
      });
    });
  }

  updateFacialRig() {
    // Facial bones respond to boundary state
    this.expressionZones.forEach((zone, name) => {
      const vertices = zone.vertices;
      if (vertices.length === 0) return;
      
      const avgRho = vertices.reduce((sum, vi) => sum + this.egt.rho[vi], 0) / vertices.length;
      
      let avgEntanglement = 0;
      let edgeCount = 0;
      vertices.forEach(vi => {
        this.egt.edges.forEach(edge => {
          if (edge.i === vi || edge.j === vi) {
            avgEntanglement += edge.w_ij;
            edgeCount++;
          }
        });
      });
      avgEntanglement = edgeCount > 0 ? avgEntanglement / edgeCount : 0;
      
      // High ρ + structured wij → facial movement
      if (avgRho > 0.5 && avgEntanglement > 0.6) {
        this.applyFacialDeformation(name, avgRho, avgEntanglement);
      }
    });
  }

  applyFacialDeformation(zoneName, rho, entanglement) {
    const vertices = this.getZoneVertices(zoneName);
    
    vertices.forEach(vi => {
      const pos = this.egt.nodes[vi].position;
      
      // Deformation based on entanglement pattern
      const deformation = rho * entanglement * 0.05;
      
      // Apply zone-specific deformation
      switch (zoneName) {
        case 'cheeks':
          pos.y += deformation * 0.3;
          pos.z += deformation * 0.5;
          break;
        case 'lips':
          pos.y += deformation * 0.2;
          pos.z += deformation * 0.4;
          break;
        case 'eyebrows':
          pos.y += deformation * 0.4;
          break;
      }
    });
  }

  getZoneVertices(zoneName) {
    const zone = this.expressionZones.get(zoneName);
    return zone ? zone.vertices : [];
  }

  getMuscleVertices(muscleName) {
    // Map muscle name to vertices
    const muscleMap = {
      'frontalis': this.getZoneVertices('eyebrows'),
      'orbicularis_oculi': [...this.getZoneVertices('eyelids')],
      'zygomaticus_major': this.getZoneVertices('cheeks'),
      'orbicularis_oris': this.getZoneVertices('lips')
    };
    
    return muscleMap[muscleName] || [];
  }

  getExpressionParameters() {
    const params = {};
    
    this.expressionZones.forEach((zone, name) => {
      const vertices = zone.vertices;
      if (vertices.length === 0) return;
      
      const avgRho = vertices.reduce((sum, vi) => sum + this.egt.rho[vi], 0) / vertices.length;
      const avgK = vertices.reduce((sum, vi) => sum + this.egt.K[vi], 0) / vertices.length;
      
      params[name] = { avgRho, avgK, active: avgRho > 0.3 };
    });
    
    return params;
  }
}

export class FullBodyHolographicReconstruction {
  constructor(characterRig) {
    this.rig = characterRig;
    this.egt = characterRig.egt;
    this.anatomy = {
      bones: [],
      muscles: [],
      softTissue: [],
      organs: []
    };
    
    this.inferAnatomy();
  }

  inferAnatomy() {
    // One EGT over whole body
    // nodes: all skin vertices
    // edges: tissue coupling (muscle groups, fascia, joints)
    // ρ: activation/tension
    // K: curvature from entanglement gradients
    
    this.inferBones();
    this.inferMuscles();
    this.inferSoftTissue();
  }

  inferBones() {
    // Bones: persistent low-deformation, high-curvature paths
    const boneCandidates = [];
    
    this.egt.edges.forEach(edge => {
      if (edge.w_ij > 0.8) {
        const nodeI = this.egt.nodes[edge.i];
        const nodeJ = this.egt.nodes[edge.j];
        
        const curvatureAvg = (this.egt.K[edge.i] + this.egt.K[edge.j]) / 2;
        const densityAvg = (this.egt.rho[edge.i] + this.egt.rho[edge.j]) / 2;
        
        // High curvature, low density → bone-like
        if (curvatureAvg > 0.6 && densityAvg < 0.3) {
          boneCandidates.push({
            from: nodeI.position,
            to: nodeJ.position,
            strength: edge.w_ij,
            curvature: curvatureAvg
          });
        }
      }
    });
    
    // Cluster bone candidates into paths
    this.anatomy.bones = this.clusterBoneCandidates(boneCandidates);
  }

  inferMuscles() {
    // Muscles: clusters of high ρ and strong internal wij
    const clusters = this.clusterByEntanglement();
    
    clusters.forEach(cluster => {
      const avgRho = cluster.vertices.reduce((sum, vi) => sum + this.egt.rho[vi], 0) / cluster.vertices.length;
      const avgEntanglement = cluster.edges.reduce((sum, e) => sum + e.w_ij, 0) / cluster.edges.length;
      
      if (avgRho > 0.5 && avgEntanglement > 0.6) {
        this.anatomy.muscles.push({
          vertices: cluster.vertices,
          density: avgRho,
          entanglement: avgEntanglement,
          type: this.classifyMuscleType(cluster)
        });
      }
    });
  }

  inferSoftTissue() {
    // Organs/soft tissue: lower-frequency, high-mass entanglement regions
    const clusters = this.clusterByProximity();
    
    clusters.forEach(cluster => {
      const avgRho = cluster.vertices.reduce((sum, vi) => sum + this.egt.rho[vi], 0) / cluster.vertices.length;
      const avgEntanglement = cluster.edges.reduce((sum, e) => sum + e.w_ij, 0) / cluster.edges.length;
      
      // Lower entanglement, moderate density
      if (avgRho > 0.3 && avgEntanglement < 0.5) {
        this.anatomy.softTissue.push({
          vertices: cluster.vertices,
          density: avgRho,
          volume: this.computeVolume(cluster.vertices)
        });
      }
    });
  }

  clusterByEntanglement() {
    // Simple clustering by high wij
    const clusters = [];
    const visited = new Set();
    
    this.egt.nodes.forEach((node, i) => {
      if (visited.has(i)) return;
      
      const cluster = {
        vertices: [i],
        edges: []
      };
      
      // Find connected vertices with high entanglement
      const queue = [i];
      while (queue.length > 0) {
        const vi = queue.shift();
        visited.add(vi);
        
        this.egt.edges.forEach(edge => {
          if (edge.i === vi && !visited.has(edge.j) && edge.w_ij > 0.6) {
            cluster.vertices.push(edge.j);
            cluster.edges.push(edge);
            queue.push(edge.j);
          }
          if (edge.j === vi && !visited.has(edge.i) && edge.w_ij > 0.6) {
            cluster.vertices.push(edge.i);
            cluster.edges.push(edge);
            queue.push(edge.i);
          }
        });
      }
      
      if (cluster.vertices.length > 5) {
        clusters.push(cluster);
      }
    });
    
    return clusters;
  }

  clusterBoneCandidates(candidates) {
    // Group by spatial proximity
    const clusters = [];
    
    candidates.forEach(candidate => {
      let found = false;
      clusters.forEach(cluster => {
        const last = cluster[candidate.last || 0];
        const dist = Math.sqrt(
          (candidate.from.x - last.from.x)**2 +
          (candidate.from.y - last.from.y)**2 +
          (candidate.from.z - last.from.z)**2
        );
        
        if (dist < 0.5) {
          cluster.push(candidate);
          found = true;
        }
      });
      
      if (!found) {
        clusters.push([candidate]);
      }
    });
    
    return clusters;
  }

  classifyMuscleType(cluster) {
    // Classify based on position and entanglement pattern
    const centroid = this.computeCentroid(cluster.vertices);
    
    if (centroid.y > 0.5) return 'upper_body';
    if (centroid.y < -0.5) return 'lower_body';
    return 'core';
  }

  computeCentroid(vertexIndices) {
    let x = 0, y = 0, z = 0;
    vertexIndices.forEach(vi => {
      const pos = this.egt.nodes[vi].position;
      x += pos.x; y += pos.y; z += pos.z;
    });
    const n = vertexIndices.length;
    return { x: x/n, y: y/n, z: z/n };
  }

  computeVolume(vertexIndices) {
    // Approximate volume from vertex spread
    const centroid = this.computeCentroid(vertexIndices);
    let volume = 0;
    
    vertexIndices.forEach(vi => {
      const pos = this.egt.nodes[vi].position;
      const dist = Math.sqrt(
        (pos.x - centroid.x)**2 +
        (pos.y - centroid.y)**2 +
        (pos.z - centroid.z)**2
      );
      volume += dist;
    });
    
    return volume / vertexIndices.length;
  }

  updateMotion(deltaTime, motionInput) {
    // Animation = evolving ρi(t), wij(t), causal flows
    
    switch (motionInput.type) {
      case 'walk':
        this.updateWalkCycle(deltaTime, motionInput);
        break;
      case 'breath':
        this.updateBreathing(deltaTime, motionInput);
        break;
      case 'gesture':
        this.updateGesture(deltaTime, motionInput);
        break;
    }
  }

  updateWalkCycle(deltaTime, input) {
    // Periodic entanglement waves along legs, spine, arms
    const phase = input.phase;
    
    this.anatomy.muscles.forEach(muscle => {
      if (muscle.type === 'lower_body') {
        const wave = Math.sin(phase * 2 * Math.PI) * 0.5 + 0.5;
        muscle.vertices.forEach(vi => {
          this.egt.rho[vi] = wave * 0.8;
        });
      }
    });
  }

  updateBreathing(deltaTime, input) {
    // Rhythmic ρ oscillation in torso
    const phase = this.time || 0;
    this.time = (phase + deltaTime) % 10;
    
    const breath = Math.sin(phase * 0.5) * 0.5 + 0.5;
    
    this.anatomy.muscles.forEach(muscle => {
      if (muscle.type === 'core') {
        muscle.vertices.forEach(vi => {
          this.egt.rho[vi] = breath * 0.6;
        });
      }
    });
  }

  updateGesture(deltaTime, input) {
    // Directed flow fields across limbs
    const flowDir = input.direction;
    
    this.anatomy.muscles.forEach(muscle => {
      if (muscle.type === input.limb) {
        muscle.vertices.forEach(vi => {
          this.egt.rho[vi] += 0.2;
        });
      }
    });
  }

  getAnatomy() {
    return this.anatomy;
  }

  getHolographicState() {
    return {
      bones: this.anatomy.bones.length,
      muscles: this.anatomy.muscles.length,
      softTissue: this.anatomy.softTissue.length,
      avgDensity: this.egt.rho.reduce((a, b) => a + b, 0) / this.egt.rho.length,
      avgCurvature: this.egt.K.reduce((a, b) => a + b, 0) / this.egt.K.length
    };
  }
}
