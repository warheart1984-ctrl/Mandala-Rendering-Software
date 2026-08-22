/**
 * Boundary-Encoded Facial Rig
 * 
 * Face as high-resolution holographic boundary
 * Expressions as information patterns
 */

export class FacialHolographicRig {
  constructor(characterRig) {
    this.rig = characterRig;
    this.egt = characterRig.egt;
    this.facialRegions = new Map();
    this.expressionSignals = new Map();
    this.controlInfluences = new Map();
    
    this.initializeFacialRegions();
  }

  initializeFacialRegions() {
    // Define facial regions with vertices
    this.facialRegions.set('brows', {
      vertices: [],
      muscles: ['frontalis', 'corrugator'],
      tags: ['brow']
    });
    
    this.facialRegions.set('eyelids', {
      vertices: [],
      muscles: ['orbicularis_oculi'],
      tags: ['eye']
    });
    
    this.facialRegions.set('nose', {
      vertices: [],
      muscles: ['nasalis'],
      tags: ['nose']
    });
    
    this.facialRegions.set('cheeks', {
      vertices: [],
      muscles: ['zygomaticus_major', 'zygomaticus_minor'],
      tags: ['cheek']
    });
    
    this.facialRegions.set('lips', {
      vertices: [],
      muscles: ['orbicularis_oris', 'levator_labii'],
      tags: ['mouth']
    });
    
    this.facialRegions.set('jaw', {
      vertices: [],
      muscles: ['masseter', 'temporalis'],
      tags: ['jaw']
    });
    
    // Initialize entanglement for facial zones
    this.initializeFacialEntanglement();
  }

  initializeFacialEntanglement() {
    // High wij where vertices share expression zone
    this.facialRegions.forEach((region, regionName) => {
      const vertices = region.vertices;
      
      for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
          const vi = vertices[i];
          const vj = vertices[j];
          
          // Shared expression zone → high entanglement
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
    });
    
    // Cross-region entanglement for expression lines
    this.createExpressionLines();
  }

  createExpressionLines() {
    // Nasolabial fold
    const cheeks = this.facialRegions.get('cheeks').vertices;
    const lips = this.facialRegions.get('lips').vertices;
    
    cheeks.forEach(vi => {
      lips.forEach(vj => {
        const wij = 0.6;
        let edge = this.egt.edges.find(e => 
          (e.i === vi && e.j === vj) || (e.i === vj && e.j === vi)
        );
        
        if (edge) {
          edge.w_ij = Math.max(edge.w_ij, wij);
        } else {
          this.egt.addEdge(vi, vj, wij);
        }
      });
    });
    
    // Eye-forehead connection for surprise
    const brows = this.facialRegions.get('brows').vertices;
    const eyelids = this.facialRegions.get('eyelids').vertices;
    
    brows.forEach(vi => {
      eyelids.forEach(vj => {
        const wij = 0.5;
        this.egt.addEdge(vi, vj, wij);
      });
    });
  }

  express(expressionName, intensity) {
    const expressionMap = {
      smile: {
        regions: {
          cheeks: intensity,
          lips: intensity * 0.8,
          eyelids: intensity * 0.3
        },
        entanglementPattern: {
          from: 'mouth_corners',
          to: 'cheeks',
          strength: intensity * 0.4
        },
        flowDirection: { x: 0.5, y: -0.3, z: 0 }
      },
      
      frown: {
        regions: {
          brows: intensity,
          nose: intensity * 0.6,
          cheeks: -intensity * 0.3
        },
        entanglementPattern: {
          from: 'eyebrows_inner',
          to: 'nose_bridge',
          strength: intensity * 0.5
        },
        flowDirection: { x: 0, y: -0.5, z: 0 }
      },
      
      blink: {
        regions: {
          eyelids: intensity * 2.0
        },
        entanglementPattern: {
          from: 'upper_lid',
          to: 'lower_lid',
          strength: intensity
        },
        flowDirection: { x: 0, y: -1, z: 0 }
      },
      
      surprise: {
        regions: {
          brows: intensity,
          eyelids: intensity * 0.7,
          lips: intensity * 0.5,
          jaw: intensity * 0.3
        },
        entanglementPattern: [
          { from: 'eyebrows', to: 'eyelids', strength: intensity },
          { from: 'lips', to: 'cheeks', strength: intensity * 0.6 }
        ],
        flowDirection: { x: 0, y: 1, z: 0 }
      },
      
      anger: {
        regions: {
          brows: intensity * 1.2,
          nose: intensity,
          lips: intensity * 0.7
        },
        entanglementPattern: {
          from: 'eyebrows_inner',
          to: 'nose',
          strength: intensity * 0.6
        },
        flowDirection: { x: 0, y: -0.7, z: 0.2 }
      }
    };

    const expr = expressionMap[expressionName];
    if (!expr) return;

    // 1. Expression signal → boundary fields
    // Increase ρi in relevant regions
    Object.entries(expr.regions).forEach(([regionName, regionIntensity]) => {
      const region = this.facialRegions.get(regionName);
      if (!region) return;
      
      region.vertices.forEach(vi => {
        this.egt.rho[vi] += Math.abs(regionIntensity) * 0.4;
        
        // Control influence weights
        if (!this.controlInfluences.has(vi)) {
          this.controlInfluences.set(vi, new Map());
        }
        const influences = this.controlInfluences.get(vi);
        influences.set(expressionName, regionIntensity);
      });
    });

    // 2. Strengthen wij along expression lines
    if (expr.entanglementPattern) {
      const patterns = Array.isArray(expr.entanglementPattern) 
        ? expr.entanglementPattern 
        : [expr.entanglementPattern];
      
      patterns.forEach(pattern => {
        this.strengthenExpressionEntanglement(
          pattern.from,
          pattern.to,
          pattern.strength
        );
      });
    }

    // 3. Define flow direction
    if (expr.flowDirection) {
      this.addCausalFlow(expressionName, expr.flowDirection);
    }

    // 4. Rig response: high ρ + structured w → deformation
    this.applyFacialDeformation(expressionName, intensity);
  }

  strengthenExpressionEntanglement(fromZone, toZone, strength) {
    const fromVertices = this.getZoneVertices(fromZone);
    const toVertices = this.getZoneVertices(toZone);
    
    fromVertices.forEach(vi => {
      toVertices.forEach(vj => {
        const edge = this.egt.edges.find(e => 
          (e.i === vi && e.j === vj) || (e.i === vj && e.j === vi)
        );
        
        if (edge) {
          edge.w_ij += strength * 0.3;
          edge.w_ij = Math.min(1.0, edge.w_ij);
        } else {
          this.egt.addEdge(vi, vj, strength * 0.5);
        }
      });
    });
  }

  addCausalFlow(expressionName, flowDir) {
    // Create causal links for directed motion
    const regionMap = {
      'smile': ['lips', 'cheeks'],
      'frown': ['brows', 'nose'],
      'blink': ['eyelids'],
      'surprise': ['brows', 'eyelids', 'lips']
    };
    
    const regions = regionMap[expressionName] || [];
    
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const fromVerts = this.getZoneVertices(regions[i]);
        const toVerts = this.getZoneVertices(regions[j]);
        
        fromVerts.forEach(vi => {
          toVerts.forEach(vj => {
            this.egt.addCausalLink(vi, vj, 0.7);
          });
        });
      }
    }
  }

  getZoneVertices(zoneName) {
    // Map zone names to regions
    const zoneMap = {
      'mouth_corners': this.facialRegions.get('lips').vertices,
      'cheeks': this.facialRegions.get('cheeks').vertices,
      'eyebrows_inner': this.facialRegions.get('brows').vertices,
      'nose_bridge': this.facialRegions.get('nose').vertices,
      'upper_lid': this.facialRegions.get('eyelids').vertices,
      'lower_lid': this.facialRegions.get('eyelids').vertices,
      'eyebrows': this.facialRegions.get('brows').vertices,
      'eyelids': this.facialRegions.get('eyelids').vertices,
      'lips': this.facialRegions.get('lips').vertices
    };
    
    return zoneMap[zoneName] || [];
  }

  applyFacialDeformation(expressionName, intensity) {
    this.facialRegions.forEach((region, regionName) => {
      const vertices = region.vertices;
      if (vertices.length === 0) return;
      
      const avgRho = vertices.reduce((sum, vi) => sum + this.egt.rho[vi], 0) / vertices.length;
      
      if (avgRho < 0.3) return;
      
      vertices.forEach(vi => {
        const node = this.egt.nodes[vi];
        const rho = this.egt.rho[vi];
        const normal = this.getVertexNormal(vi);
        
        // Local displacement
        switch (regionName) {
          case 'lips':
            // Pull mouth corners along flow direction
            const flowDir = this.getFlowDirection(expressionName);
            node.position.x += flowDir.x * rho * 0.03;
            node.position.y += flowDir.y * rho * 0.03;
            node.position.z += flowDir.z * rho * 0.03;
            break;
            
          case 'cheeks':
            // Bulge via normal offset proportional to ρ
            node.position.x += normal.x * rho * 0.02;
            node.position.y += normal.y * rho * 0.02;
            node.position.z += normal.z * rho * 0.02;
            break;
            
          case 'eyelids':
            // Close/open via entanglement along lid edges
            const lidClosure = rho * 0.04;
            node.position.y -= lidClosure;
            break;
            
          case 'brows':
            // Lift brows
            const lift = rho * 0.03;
            node.position.y += lift;
            break;
            
          case 'nose':
            // Wrinkle nose
            node.position.x += (Math.random() - 0.5) * rho * 0.01;
            node.position.y += (Math.random() - 0.5) * rho * 0.01;
            break;
        }
      });
    });
    
    // Smoothing via entanglement
    this.smoothFacialDeformation();
  }

  getFlowDirection(expressionName) {
    const flows = {
      'smile': { x: 0.5, y: -0.3, z: 0 },
      'frown': { x: 0, y: -0.5, z: 0 },
      'blink': { x: 0, y: -1, z: 0 },
      'surprise': { x: 0, y: 1, z: 0 },
      'anger': { x: 0, y: -0.7, z: 0.2 }
    };
    
    return flows[expressionName] || { x: 0, y: 0, z: 0 };
  }

  getVertexNormal(vi) {
    // Placeholder - would come from mesh
    return { x: 0, y: 0, z: 1 };
  }

  smoothFacialDeformation() {
    // Blend motion based on wij
    const positions = new Map();
    
    this.facialRegions.forEach(region => {
      region.vertices.forEach(vi => {
        const node = this.egt.nodes[vi];
        positions.set(vi, { x: node.position.x, y: node.position.y, z: node.position.z });
      });
    });
    
    this.facialRegions.forEach(region => {
      region.vertices.forEach(vi => {
        let avg = { x: 0, y: 0, z: 0 };
        let wSum = 0;
        
        this.egt.edges.forEach(edge => {
          let neighborIdx = null;
          if (edge.i === vi) neighborIdx = edge.j;
          if (edge.j === vi) neighborIdx = edge.i;
          
          if (neighborIdx !== null) {
            const neighborPos = positions.get(neighborIdx);
            if (neighborPos) {
              avg.x += neighborPos.x * edge.w_ij;
              avg.y += neighborPos.y * edge.w_ij;
              avg.z += neighborPos.z * edge.w_ij;
              wSum += edge.w_ij;
            }
          }
        });
        
        if (wSum > 0) {
          avg.x /= wSum;
          avg.y /= wSum;
          avg.z /= wSum;
          
          const node = this.egt.nodes[vi];
          const blendFactor = 0.3;
          node.position.x = node.position.x * (1 - blendFactor) + avg.x * blendFactor;
          node.position.y = node.position.y * (1 - blendFactor) + avg.y * blendFactor;
          node.position.z = node.position.z * (1 - blendFactor) + avg.z * blendFactor;
        }
      });
    });
  }

  update(deltaTime) {
    // Decay expression signals
    this.facialRegions.forEach(region => {
      region.vertices.forEach(vi => {
        this.egt.rho[vi] *= Math.exp(-deltaTime * 1.5);
      });
    });
    
    // Recompute curvature
    for (let i = 0; i < this.egt.nodes.length; i++) {
      this.egt.computeCurvature(i);
    }
  }

  getExpressionState() {
    const state = {};
    
    this.facialRegions.forEach((region, name) => {
      const vertices = region.vertices;
      if (vertices.length === 0) return;
      
      const avgRho = vertices.reduce((sum, vi) => sum + this.egt.rho[vi], 0) / vertices.length;
      const avgK = vertices.reduce((sum, vi) => sum + this.egt.K[vi], 0) / vertices.length;
      
      state[name] = {
        avgRho,
        avgK,
        active: avgRho > 0.3
      };
    });
    
    return state;
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
    
    this.bodyRegions = new Map();
    this.initializeBodyRegions();
    this.inferAnatomy();
  }

  initializeBodyRegions() {
    // Global EGT over whole body
    this.bodyRegions.set('head', { vertices: [], layer: 'skin' });
    this.bodyRegions.set('torso', { vertices: [], layer: 'skin' });
    this.bodyRegions.set('arms', { vertices: [], layer: 'skin' });
    this.bodyRegions.set('legs', { vertices: [], layer: 'skin' });
    this.bodyRegions.set('hands', { vertices: [], layer: 'skin' });
    this.bodyRegions.set('feet', { vertices: [], layer: 'skin' });
  }

  inferAnatomy() {
    // Bulk inference from boundary
    
    // Bones: persistent high-curvature paths with low deformation
    this.inferBones();
    
    // Muscles: clusters of high ρ and strong internal w
    this.inferMuscles();
    
    // Soft tissue/organs: lower-frequency, high-mass entanglement
    this.inferSoftTissue();
  }

  inferBones() {
    const boneCandidates = [];
    
    this.egt.edges.forEach(edge => {
      const curvatureAvg = (this.egt.K[edge.i] + this.egt.K[edge.j]) / 2;
      const densityAvg = (this.egt.rho[edge.i] + this.egt.rho[edge.j]) / 2;
      
      // High curvature, low density → bone-like
      if (curvatureAvg > 0.6 && densityAvg < 0.3 && edge.w_ij > 0.7) {
        boneCandidates.push({
          from: this.egt.nodes[edge.i].position,
          to: this.egt.nodes[edge.j].position,
          strength: edge.w_ij,
          curvature: curvatureAvg
        });
      }
    });
    
    // Cluster into bone paths
    this.anatomy.bones = this.clusterIntoPaths(boneCandidates);
  }

  inferMuscles() {
    const clusters = this.clusterByEntanglement();
    
    clusters.forEach(cluster => {
      const avgRho = cluster.vertices.reduce((sum, vi) => sum + this.egt.rho[vi], 0) / cluster.vertices.length;
      const avgWij = cluster.edges.reduce((sum, e) => sum + e.w_ij, 0) / cluster.edges.length;
      
      // High ρ + strong wij → muscle
      if (avgRho > 0.5 && avgWij > 0.6) {
        this.anatomy.muscles.push({
          vertices: cluster.vertices,
          density: avgRho,
          entanglement: avgWij,
          fiberDirection: this.inferFiberDirection(cluster.vertices),
          type: this.classifyMuscle(cluster)
        });
      }
    });
  }

  inferSoftTissue() {
    const clusters = this.clusterByProximity();
    
    clusters.forEach(cluster => {
      const avgRho = cluster.vertices.reduce((sum, vi) => sum + this.egt.rho[vi], 0) / cluster.vertices.length;
      const avgWij = cluster.edges.reduce((sum, e) => sum + e.w_ij, 0) / cluster.edges.length;
      
      // Lower entanglement, moderate density → soft tissue
      if (avgRho > 0.3 && avgWij < 0.5 && cluster.vertices.length > 20) {
        this.anatomy.softTissue.push({
          vertices: cluster.vertices,
          density: avgRho,
          volume: this.computeVolume(cluster.vertices)
        });
      }
    });
  }

  clusterByEntanglement() {
    const clusters = [];
    const visited = new Set();
    
    this.egt.nodes.forEach((node, i) => {
      if (visited.has(i)) return;
      
      const cluster = {
        vertices: [i],
        edges: []
      };
      
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

  clusterIntoPaths(candidates) {
    // Group spatially proximate bone candidates
    const paths = [];
    
    candidates.forEach(candidate => {
      let found = false;
      paths.forEach(path => {
        const last = path[path.length - 1];
        const dist = Math.sqrt(
          (candidate.from.x - last.from.x)**2 +
          (candidate.from.y - last.from.y)**2 +
          (candidate.from.z - last.from.z)**2
        );
        
        if (dist < 1.0) {
          path.push(candidate);
          found = true;
        }
      });
      
      if (!found) {
        paths.push([candidate]);
      }
    });
    
    return paths;
  }

  inferFiberDirection(vertexIndices) {
    // Infer from anisotropic entanglement
    let dir = { x: 0, y: 0, z: 0 };
    
    for (let i = 0; i < vertexIndices.length - 1; i++) {
      const p1 = this.egt.nodes[vertexIndices[i]].position;
      const p2 = this.egt.nodes[vertexIndices[i + 1]].position;
      
      dir.x += p2.x - p1.x;
      dir.y += p2.y - p1.y;
      dir.z += p2.z - p1.z;
    }
    
    const len = Math.sqrt(dir.x**2 + dir.y**2 + dir.z**2) + 1e-12;
    return {
      x: dir.x / len,
      y: dir.y / len,
      z: dir.z / len
    };
  }

  classifyMuscle(cluster) {
    const centroid = this.computeCentroid(cluster.vertices);
    
    if (centroid.y > 0.5) return 'upper_body';
    if (centroid.y < -0.5) return 'lower_body';
    if (Math.abs(centroid.x) > 0.5) return 'lateral';
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
      case 'posture':
        this.updatePosture(deltaTime, motionInput);
        break;
    }
    
    // Recompute curvature
    for (let i = 0; i < this.egt.nodes.length; i++) {
      this.egt.computeCurvature(i);
    }
  }

  updateWalkCycle(deltaTime, input) {
    // Periodic entanglement waves along legs, spine, arms
    const phase = input.phase || 0;
    const wave = Math.sin(phase * 2 * Math.PI) * 0.5 + 0.5;
    
    this.anatomy.muscles.forEach(muscle => {
      if (muscle.type === 'lower_body') {
        muscle.vertices.forEach(vi => {
          this.egt.rho[vi] = wave * 0.8;
        });
      }
      
      if (muscle.type === 'core') {
        muscle.vertices.forEach(vi => {
          this.egt.rho[vi] = 0.3 + wave * 0.3;
        });
      }
    });
    
    // Update entanglement to propagate wave
    this.propagateEntanglementWave('legs', wave);
  }

  updateBreathing(deltaTime, input) {
    // Rhythmic ρ changes in ribcage and abdomen
    const phase = (input.phase || 0) * 0.5;
    const breath = Math.sin(phase) * 0.5 + 0.5;
    
    this.anatomy.muscles.forEach(muscle => {
      if (muscle.type === 'core') {
        muscle.vertices.forEach(vi => {
          this.egt.rho[vi] = 0.4 + breath * 0.4;
        });
        
        // Boundary expands/contracts
        muscle.vertices.forEach(vi => {
          const node = this.egt.nodes[vi];
          const expansion = breath * 0.02;
          node.position.x *= (1 + expansion);
          node.position.y *= (1 + expansion);
          node.position.z *= (1 + expansion);
        });
      }
    });
  }

  updateGesture(deltaTime, input) {
    // Directed flow fields across limbs
    const flowDir = input.direction;
    const limb = input.limb;
    
    this.anatomy.muscles.forEach(muscle => {
      if (muscle.type === limb || muscle.type.includes(limb)) {
        muscle.vertices.forEach(vi => {
          this.egt.rho[vi] += 0.2;
          
          // Apply flow direction
          const node = this.egt.nodes[vi];
          node.position.x += flowDir.x * 0.01;
          node.position.y += flowDir.y * 0.01;
          node.position.z += flowDir.z * 0.01;
        });
      }
    });
  }

  updatePosture(deltaTime, input) {
    // Postural changes via entanglement patterns
    const spineMuscles = this.anatomy.muscles.filter(m => m.type === 'core');
    
    spineMuscles.forEach(muscle => {
      const curvature = input.curvature || 0;
      muscle.vertices.forEach(vi => {
        const node = this.egt.nodes[vi];
        node.position.x += curvature * 0.01;
        this.egt.rho[vi] = 0.5 + Math.abs(curvature) * 0.3;
      });
    });
  }

  propagateEntanglementWave(region, amplitude) {
    // Propagate entanglement changes through body
    this.anatomy.muscles.forEach(muscle => {
      if (muscle.type.includes(region)) {
        muscle.vertices.forEach(vi => {
          this.egt.edges.forEach(edge => {
            if (edge.i === vi || edge.j === vi) {
              edge.w_ij = Math.min(1.0, edge.w_ij + amplitude * 0.1);
            }
          });
        });
      }
    });
  }

  getHolographicState() {
    return {
      bones: this.anatomy.bones.length,
      muscles: this.anatomy.muscles.length,
      softTissue: this.anatomy.softTissue.length,
      avgDensity: this.egt.rho.reduce((a, b) => a + b, 0) / this.egt.rho.length,
      avgCurvature: this.egt.K.reduce((a, b) => a + b, 0) / this.egt.K.length,
      avgEntanglement: this.egt.edges.reduce((a, e) => a + e.w_ij, 0) / this.egt.edges.length
    };
  }

  renderViews() {
    return {
      bulkView: {
        type: '4D_body_motion',
        anatomy: this.anatomy,
        inferredStructures: true
      },
      boundaryView: {
        type: 'entanglement_field',
        nodes: this.egt.nodes.length,
        avgRho: this.egt.rho.reduce((a, b) => a + b, 0) / this.egt.rho.length,
        avgK: this.egt.K.reduce((a, b) => a + b, 0) / this.egt.K.length
      },
      combined: {
        type: 'unified_organism',
        information: 'boundary',
        geometry: 'bulk',
        motion: 'entanglement_evolution'
      }
    };
  }
}
