/**
 * Character Holographic Rig
 * 
 * Treat character surface (skin mesh) as boundary
 * Rig + anatomy encoded in boundary entanglement
 */

import { EGT } from './RT4DHolographicArchitecture.js';

export class CharacterHolographicRig {
  constructor(mesh, skeleton) {
    this.mesh = mesh;
    this.skeleton = skeleton;
    this.egt = new EGT();
    this.boneInfluences = new Map();
    
    this.initializeBoundaryEncoding();
  }

  initializeBoundaryEncoding() {
    // Each skin vertex → boundary node
    this.mesh.vertices.forEach((vertex, i) => {
      const node = this.egt.addNode(vertex);
      
      // Store bone influence vector B_i
      const boneWeights = this.getBoneWeights(i);
      this.boneInfluences.set(i, boneWeights);
      
      // Local info density ρ_i (stress, tension, deformation energy)
      this.egt.rho[i] = this.computeInitialDensity(vertex, boneWeights);
    });
    
    // Build entanglement edges
    this.mesh.indices.forEach(tri => {
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          const vi = tri[i];
          const vj = tri[j];
          
          const wij = this.computeEntanglementWeight(vi, vj);
          this.egt.addEdge(vi, vj, wij);
        }
      }
    });
    
    // Compute initial curvature
    for (let i = 0; i < this.egt.nodes.length; i++) {
      this.egt.computeCurvature(i);
    }
  }

  getBoneWeights(vertexIndex) {
    return this.skeleton.getVertexWeights(vertexIndex);
  }

  computeInitialDensity(vertex, boneWeights) {
    // Base density on bone influence variance
    const variance = this.computeVariance(boneWeights);
    const deformPotential = this.computeDeformationPotential(vertex);
    
    return variance * 0.5 + deformPotential * 0.5;
  }

  computeEntanglementWeight(vi, vj) {
    const wi = this.boneInfluences.get(vi);
    const wj = this.boneInfluences.get(vj);
    
    // Similarity of bone weights
    const boneSimilarity = this.cosineSimilarity(wi, wj);
    
    // Shared deformation
    const deformSimilarity = this.computeDeformationSimilarity(vi, vj);
    
    // Shared material region
    const materialSimilarity = this.computeMaterialSimilarity(vi, vj);
    
    // Combined entanglement weight
    return (boneSimilarity * 0.4 + 
            deformSimilarity * 0.3 + 
            materialSimilarity * 0.3);
  }

  computeVariance(weights) {
    const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
    const variance = weights.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / weights.length;
    return Math.sqrt(variance);
  }

  computeDeformationPotential(vertex) {
    // Measure proximity to joints, stretch potential
    return 0.5; // Placeholder
  }

  computeDeformationSimilarity(vi, vj) {
    // Compare deformation history or expected motion
    return 0.7; // Placeholder
  }

  computeMaterialSimilarity(vi, vj) {
    // Compare material tags: skin, muscle, fat, etc.
    return 0.8; // Placeholder
  }

  cosineSimilarity(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-12);
  }

  // Reconstruction: bulk anatomy from boundary
  reconstructAnatomy() {
    const anatomy = {
      muscles: [],
      bones: [],
      volumes: []
    };
    
    // Group vertices by bone influence clusters
    const clusters = this.clusterByBoneInfluence();
    
    clusters.forEach(cluster => {
      const muscleVolume = this.inferMuscleVolume(cluster);
      anatomy.muscles.push(muscleVolume);
    });
    
    // Infer bone paths from high entanglement gradients
    const bonePaths = this.inferBonePaths();
    anatomy.bones.push(...bonePaths);
    
    // Infer volumes from density gradients
    const volumes = this.inferVolumesFromDensity();
    anatomy.volumes.push(...volumes);
    
    return anatomy;
  }

  clusterByBoneInfluence() {
    const clusters = new Map();
    
    this.egt.nodes.forEach((node, i) => {
      const weights = this.boneInfluences.get(i);
      const dominantBone = weights.indexOf(Math.max(...weights));
      
      if (!clusters.has(dominantBone)) {
        clusters.set(dominantBone, []);
      }
      
      clusters.get(dominantBone).push({
        index: i,
        node,
        weights,
        rho: this.egt.rho[i],
        K: this.egt.K[i]
      });
    });
    
    return clusters;
  }

  inferMuscleVolume(cluster) {
    const vertices = cluster.map(v => v.node.position);
    const avgRho = cluster.reduce((sum, v) => sum + v.rho, 0) / cluster.length;
    
    return {
      type: 'muscle',
      vertices,
      density: avgRho,
      curvature: cluster.reduce((sum, v) => sum + v.K, 0) / cluster.length
    };
  }

  inferBonePaths() {
    const paths = [];
    
    // Find high entanglement corridors
    this.egt.edges.forEach(edge => {
      if (edge.w_ij > 0.8) {
        const nodeI = this.egt.nodes[edge.i];
        const nodeJ = this.egt.nodes[edge.j];
        
        // If this edge connects vertices with consistent bone influence,
        // it may be along a bone path
        const wi = this.boneInfluences.get(edge.i);
        const wj = this.boneInfluences.get(edge.j);
        
        if (this.boneInfluenceConsistent(wi, wj)) {
          paths.push({
            from: nodeI.position,
            to: nodeJ.position,
            strength: edge.w_ij
          });
        }
      }
    });
    
    return paths;
  }

  boneInfluenceConsistent(wi, wj) {
    const boneI = wi.indexOf(Math.max(...wi));
    const boneJ = wj.indexOf(Math.max(...wj));
    return boneI === boneJ;
  }

  inferVolumesFromDensity() {
    // Use ρ gradients to infer internal volumes
    const volumes = [];
    
    for (let i = 0; i < this.egt.nodes.length; i++) {
      const gradient = this.egt.computeEntanglementGradient(i);
      const gradMag = Math.sqrt(
        gradient.x*gradient.x + gradient.y*gradient.y + gradient.z*gradient.z
      );
      
      if (gradMag > 0.5) {
        volumes.push({
          center: this.egt.nodes[i].position,
          density: this.egt.rho[i],
          gradientMagnitude: gradMag,
          curvature: this.egt.K[i]
        });
      }
    }
    
    return volumes;
  }

  getEntanglementField() {
    return {
      nodes: this.egt.nodes,
      rho: this.egt.rho,
      K: this.egt.K,
      edges: this.egt.edges,
      boneInfluences: this.boneInfluences
    };
  }
}

export class EntanglementDrivenAnimation {
  constructor(characterRig) {
    this.rig = characterRig;
    this.time = 0;
    this.flowField = new Map();
  }

  update(deltaTime, animationState) {
    this.time += deltaTime;
    
    // Update boundary state
    this.updateBoundaryState(animationState);
    
    // Update entanglement weights
    this.updateEntanglement(animationState);
    
    // Compute resulting deformations
    this.computeDeformations();
    
    // Update bone transforms from boundary
    this.updateBonesFromBoundary();
  }

  updateBoundaryState(animationState) {
    // Muscle activation increases ρ
    animationState.activeMuscles.forEach(muscleId => {
      const vertices = this.getMuscleVertices(muscleId);
      vertices.forEach(vi => {
        this.rig.egt.rho[vi] += 0.1;
      });
    });
    
    // Propagate via entanglement
    this.propagateDensity();
  }

  propagateDensity() {
    // Information propagation via entanglement edges
    const newRho = [...this.rig.egt.rho];
    
    this.rig.egt.nodes.forEach((node, i) => {
      let incomingDensity = 0;
      
      this.rig.egt.edges.forEach(edge => {
        if (edge.i === i || edge.j === i) {
          const otherIdx = edge.i === i ? edge.j : edge.i;
          incomingDensity += this.rig.egt.rho[otherIdx] * edge.w_ij * 0.1;
        }
      });
      
      newRho[i] = this.rig.egt.rho[i] * 0.9 + incomingDensity;
    });
    
    this.rig.egt.rho = newRho;
  }

  updateEntanglement(animationState) {
    // Update wij based on motion flow
    animationState.motionFlow.forEach((flow, vi) => {
      this.rig.egt.edges.forEach(edge => {
        if (edge.i === vi || edge.j === vi) {
          const otherIdx = edge.i === vi ? edge.j : edge.i;
          
          // Update entanglement based on flow direction alignment
          const flowAlignment = this.computeFlowAlignment(vi, otherIdx, flow);
          edge.w_ij = edge.w_ij * 0.9 + flowAlignment * 0.1;
        }
      });
    });
    
    // Recompute curvature
    for (let i = 0; i < this.rig.egt.nodes.length; i++) {
      this.rig.egt.computeCurvature(i);
    }
  }

  computeFlowAlignment(vi, vj, flow) {
    // Compare flow direction to edge direction
    const posI = this.rig.egt.nodes[vi].position;
    const posJ = this.rig.egt.nodes[vj].position;
    
    const edgeDir = {
      x: posJ.x - posI.x,
      y: posJ.y - posI.y,
      z: posJ.z - posI.z
    };
    
    const dot = edgeDir.x * flow.x + edgeDir.y * flow.y + edgeDir.z * flow.z;
    const mag = Math.sqrt(edgeDir.x**2 + edgeDir.y**2 + edgeDir.z**2) * 
                Math.sqrt(flow.x**2 + flow.y**2 + flow.z**2);
    
    return Math.max(0, dot / (mag + 1e-12));
  }

  computeDeformations() {
    // High ρ + strong wij → contraction, bulging
    this.rig.egt.nodes.forEach((node, i) => {
      const entanglementSum = this.rig.egt.edges
        .filter(e => e.i === i || e.j === i)
        .reduce((sum, e) => sum + e.w_ij, 0);
      
      const deformation = this.rig.egt.rho[i] * entanglementSum * 0.1;
      
      // Store deformation for vertex update
      node.deformation = deformation;
    });
  }

  updateBonesFromBoundary() {
    // Infer bone transforms from boundary deformation patterns
    this.rig.boneInfluences.forEach((weights, vi) => {
      const deformation = this.rig.egt.nodes[vi].deformation || 0;
      
      // Update bone influence weights based on deformation
      weights.forEach((w, boneIdx) => {
        weights[boneIdx] = w * (1 + deformation * 0.05);
      });
      
      // Normalize
      const sum = weights.reduce((a, b) => a + b, 0);
      weights.forEach((_, i) => weights[i] /= sum);
    });
  }

  getMuscleVertices(muscleId) {
    // Return vertices influenced by muscle
    const vertices = [];
    this.rig.boneInfluences.forEach((weights, vi) => {
      if (weights[muscleId] > 0.5) {
        vertices.push(vi);
      }
    });
    return vertices;
  }
}

export class AnatomicalShaderInputs {
  static generatePerVertexInputs(nodeIndex, egt, boneInfluences) {
    const node = egt.nodes[nodeIndex];
    const rho = egt.rho[nodeIndex];
    const K = egt.K[nodeIndex];
    
    // Entanglement sum
    const w_sum = egt.edges
      .filter(e => e.i === nodeIndex || e.j === nodeIndex)
      .reduce((sum, e) => sum + e.w_ij, 0);
    
    // Layer tags from bone influences
    const weights = boneInfluences.get(nodeIndex);
    const layerTags = this.determineLayerTags(weights);
    
    return {
      pos: node.position,
      normal: { x: 0, y: 0, z: 1 }, // Placeholder
      rho,
      w_sum,
      K,
      layerTags,
      flowDir: { x: 0, y: 0, z: 0 },
      flowStrength: 0
    };
  }

  static determineLayerTags(boneWeights) {
    // Infer anatomical layer from bone weights
    const maxWeight = Math.max(...boneWeights);
    const maxIdx = boneWeights.indexOf(maxWeight);
    
    if (maxIdx < 10) return 'skin';
    if (maxIdx < 20) return 'muscle';
    if (maxIdx < 30) return 'bone';
    return 'deep';
  }

  static generateWGSLShader() {
    return `
// Character Anatomical Reconstruction Shader
// RT4D holographic character rendering

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) rho: f32,
  @location(3) w_sum: f32,
  @location(4) K: f32,
  @location(5) layer: u32,
};

struct VertexOutput {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) rho: f32,
  @location(3) w_sum: f32,
  @location(4) K: f32,
  @location(5) layer: u32,
};

@group(0) @binding(0) var<uniform> warpScale: f32;
@group(0) @binding(1) var<uniform> time: f32;

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  
  // Anatomical warping from curvature
  let offset = normalize(input.normal) * input.K * warpScale;
  let warpedPos = input.position + offset;
  
  // Subsurface scattering from rho
  let subsurfaceBoost = clamp(input.rho * 1.5, 0.0, 1.0);
  
  output.worldPos = warpedPos;
  output.normal = input.normal;
  output.rho = input.rho;
  output.w_sum = input.w_sum;
  output.K = input.K;
  output.layer = input.layer;
  
  output.clipPos = vec4<f32>(warpedPos, 1.0);
  
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  // Base color from entanglement
  let entanglement = clamp(input.w_sum, 0.0, 1.0);
  let intensity = clamp(input.rho, 0.0, 1.0);
  
  var baseColor: vec3<f32>;
  
  // Layer-specific coloring
  switch input.layer {
    case 0u: // skin
      baseColor = vec3<f32>(0.9, 0.7, 0.6) * intensity;
      break;
    case 1u: // muscle
      baseColor = vec3<f32>(0.8, 0.2, 0.2) * intensity;
      break;
    case 2u: // bone
      baseColor = vec3<f32>(0.9, 0.9, 0.8) * intensity;
      break;
    default:
      baseColor = vec3<f32>(0.5, 0.5, 0.5) * intensity;
  }
  
  // Curvature affects roughness
  let roughness = 0.5 + abs(input.K) * 0.3;
  
  // Subsurface scattering
  let subsurface = vec3<f32>(0.3, 0.5, 0.7) * input.rho * 0.5;
  
  // Entanglement emissive
  let emissive = vec3<f32>(entanglement * 0.1, entanglement * 0.05, entanglement * 0.2);
  
  let finalColor = baseColor + subsurface + emissive;
  
  return vec4<f32>(finalColor, 1.0);
}
`;
  }
}
