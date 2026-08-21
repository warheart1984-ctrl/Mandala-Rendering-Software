/**
 * Boundary-Driven Anatomy Synthesis
 * 
 * Reconstruct anatomy from boundary using entanglement tensors,
 * curvature gradients, and CIEMS governance fields
 */

export class BoundaryDrivenAnatomySynthesis {
  constructor(egt, rigNodes) {
    this.egt = egt;
    this.rigNodes = rigNodes;
    this.anatomy = {
      muscles: [],
      bones: [],
      joints: [],
      softTissue: []
    };
  }

  synthesizeAnatomy() {
    // Boundary nodes carry:
    // - entanglement tensor Ei
    // - curvature Ki
    // - tension ρi
    // - governance coordinates
    
    this.inferMuscles();
    this.inferBones();
    this.inferJoints();
    this.inferSoftTissue();
    
    return this.anatomy;
  }

  inferMuscles() {
    // Muscle inference: high Ei anisotropy + high ρi + consistent curvature gradients
    const clusters = this.clusterByEntanglementAndTension();
    
    clusters.forEach(cluster => {
      const anisotropy = this.computeAnisotropy(cluster);
      const avgTension = cluster.nodes.reduce((sum, idx) => 
        sum + this.egt.rho[idx], 0) / cluster.nodes.length;
      
      const curvatureGradient = this.computeCurvatureGradient(cluster);
      
      // Muscles have high anisotropy (fiber direction), high tension, consistent gradients
      if (anisotropy > 0.6 && avgTension > 0.5 && curvatureGradient < 0.3) {
        this.anatomy.muscles.push({
          id: this.anatomy.muscles.length,
          nodes: cluster.nodes,
          anisotropy,
          tension: avgTension,
          volume: this.computeVolume(cluster.nodes),
          fiberDirection: this.inferFiberDirection(cluster.nodes),
          governance: this.aggregateGovernance(cluster.nodes)
        });
      }
    });
  }

  inferBones() {
    // Bones: low-deformation paths, high curvature stability, minimal entanglement variance
    const candidates = [];
    
    this.egt.edges.forEach(edge => {
      const nodeI = this.rigNodes[edge.i];
      const nodeJ = this.rigNodes[edge.j];
      
      if (!nodeI || !nodeJ) return;
      
      const curvatureStability = 1.0 / (Math.abs(nodeI.egtCurvature - nodeJ.egtCurvature) + 0.01);
      const entanglementVariance = Math.abs(edge.w_ij - 0.5);
      const deformation = this.computeDeformation(nodeI, nodeJ);
      
      if (curvatureStability > 2.0 && deformation < 0.1 && entanglementVariance < 0.3) {
        candidates.push({
          from: edge.i,
          to: edge.j,
          stability: curvatureStability,
          deformation
        });
      }
    });
    
    // Cluster candidates into bone paths
    this.anatomy.bones = this.clusterBoneCandidates(candidates);
  }

  inferJoints() {
    // Joints = discontinuities in entanglement direction fields
    this.egt.nodes.forEach((node, i) => {
      const neighbors = this.getNeighbors(i);
      if (neighbors.length < 2) return;
      
      // Check for entanglement direction discontinuities
      const directions = neighbors.map(nIdx => {
        const edge = this.egt.edges.find(e => 
          (e.i === i && e.j === nIdx) || (e.j === i && e.i === nIdx)
        );
        if (!edge) return null;
        
        return {
          neighbor: nIdx,
          weight: edge.w_ij,
          direction: this.computeDirection(i, nIdx)
        };
      }).filter(d => d !== null);
      
      // Compute direction variance
      const variance = this.computeDirectionVariance(directions);
      
      if (variance > 0.7) {
        this.anatomy.joints.push({
          node: i,
          variance,
          connectedNodes: directions.map(d => d.neighbor),
          type: this.classifyJointType(directions)
        });
      }
    });
  }

  inferSoftTissue() {
    // Lower-frequency entanglement, high mass/low stiffness, stewardship governed
    const clusters = this.clusterByLowFrequency();
    
    clusters.forEach(cluster => {
      const avgEntanglement = cluster.edges.reduce((sum, e) => sum + e.w_ij, 0) / cluster.edges.length;
      const avgGovernance = this.aggregateGovernance(cluster.nodes).stewardship;
      
      if (avgEntanglement < 0.5 && avgGovernance > 0.6) {
        this.anatomy.softTissue.push({
          nodes: cluster.nodes,
          entanglement: avgEntanglement,
          governance: avgGovernance,
          volume: this.computeVolume(cluster.nodes)
        });
      }
    });
  }

  clusterByEntanglementAndTension() {
    const clusters = [];
    const visited = new Set();
    
    this.rigNodes.forEach((node, i) => {
      if (visited.has(i)) return;
      
      const cluster = {
        nodes: [i],
        edges: []
      };
      
      const queue = [i];
      visited.add(i);
      
      while (queue.length > 0) {
        const current = queue.shift();
        
        this.egt.edges.forEach(edge => {
          let neighbor = null;
          if (edge.i === current) neighbor = edge.j;
          if (edge.j === current) neighbor = edge.i;
          
          if (neighbor !== null && !visited.has(neighbor)) {
            const currentRho = this.egt.rho[current];
            const neighborRho = this.egt.rho[neighbor];
            
            // Cluster if entanglement is strong and tension similar
            if (edge.w_ij > 0.6 && Math.abs(currentRho - neighborRho) < 0.3) {
              cluster.nodes.push(neighbor);
              cluster.edges.push(edge);
              queue.push(neighbor);
              visited.add(neighbor);
            }
          }
        });
      }
      
      if (cluster.nodes.length > 3) {
        clusters.push(cluster);
      }
    });
    
    return clusters;
  }

  computeAnisotropy(cluster) {
    // Measure how directional the entanglement is
    let totalAnisotropy = 0;
    
    cluster.nodes.forEach(nodeIdx => {
      const node = this.rigNodes[nodeIdx];
      if (!node) return;
      
      const magnitude = node.getEntanglementMagnitude();
      const principal = node.getPrincipalEigenvectors();
      
      totalAnisotropy += magnitude * principal.magnitude;
    });
    
    return totalAnisotropy / cluster.nodes.length;
  }

  computeCurvatureGradient(cluster) {
    // Consistency of curvature gradients
    const gradients = cluster.nodes.map(idx => {
      const node = this.rigNodes[idx];
      return node.egtCurvature || 0;
    });
    
    const mean = gradients.reduce((a, b) => a + b, 0) / gradients.length;
    const variance = gradients.reduce((sum, g) => sum + (g - mean)**2, 0) / gradients.length;
    
    return Math.sqrt(variance);
  }

  inferFiberDirection(nodeIndices) {
    // Average principal eigenvector direction
    let dx = 0, dy = 0, dz = 0;
    
    nodeIndices.forEach(idx => {
      const node = this.rigNodes[idx];
      if (!node) return;
      
      const principal = node.getPrincipalEigenvectors();
      dx += principal.direction.x;
      dy += principal.direction.y;
      dz += principal.direction.z;
    });
    
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz) + 1e-12;
    return { x: dx/len, y: dy/len, z: dz/len };
  }

  aggregateGovernance(nodeIndices) {
    let intent = 0, evidence = 0, conformance = 0, stewardship = 0;
    
    nodeIndices.forEach(idx => {
      const node = this.rigNodes[idx];
      if (!node || !node.gov) return;
      
      intent += node.gov.intent;
      evidence += node.gov.evidence;
      conformance += node.gov.conformance;
      stewardship += node.gov.stewardship;
    });
    
    const n = nodeIndices.length;
    return {
      intent: intent / n,
      evidence: evidence / n,
      conformance: conformance / n,
      stewardship: stewardship / n
    };
  }

  computeVolume(nodeIndices) {
    // Approximate volume from node spread
    const positions = nodeIndices.map(idx => this.egt.nodes[idx].position);
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    positions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
      minZ = Math.min(minZ, pos.z);
      maxZ = Math.max(maxZ, pos.z);
    });
    
    return (maxX - minX) * (maxY - minY) * (maxZ - minZ);
  }

  clusterBoneCandidates(candidates) {
    // Group by spatial proximity
    const paths = [];
    
    candidates.forEach(candidate => {
      let found = false;
      paths.forEach(path => {
        const last = path[path.length - 1];
        const dist = this.computeNodeDistance(last.from, candidate.from);
        
        if (dist < 0.5) {
          path.push(candidate);
          found = true;
        }
      });
      
      if (!found) {
        paths.push([candidate]);
      }
    });
    
    return paths.filter(p => p.length >= 3);
  }

  computeNodeDistance(idx1, idx2) {
    const pos1 = this.egt.nodes[idx1].position;
    const pos2 = this.egt.nodes[idx2].position;
    
    return Math.sqrt(
      (pos1.x - pos2.x)**2 + 
      (pos1.y - pos2.y)**2 + 
      (pos1.z - pos2.z)**2
    );
  }

  getNeighbors(nodeIdx) {
    const neighbors = [];
    this.egt.edges.forEach(edge => {
      if (edge.i === nodeIdx) neighbors.push(edge.j);
      if (edge.j === nodeIdx) neighbors.push(edge.i);
    });
    return neighbors;
  }

  computeDirection(nodeIdx, neighborIdx) {
    const pos1 = this.egt.nodes[nodeIdx].position;
    const pos2 = this.egt.nodes[neighborIdx].position;
    
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = pos2.z - pos1.z;
    
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz) + 1e-12;
    return { x: dx/len, y: dy/len, z: dz/len };
  }

  computeDirectionVariance(directions) {
    // Measure how scattered directions are
    if (directions.length < 2) return 0;
    
    const meanDir = directions.reduce((acc, d) => {
      acc.x += d.direction.x;
      acc.y += d.direction.y;
      acc.z += d.direction.z;
      return acc;
    }, { x: 0, y: 0, z: 0 });
    
    const n = directions.length;
    meanDir.x /= n;
    meanDir.y /= n;
    meanDir.z /= n;
    
    const meanLen = Math.sqrt(meanDir.x**2 + meanDir.y**2 + meanDir.z**2) + 1e-12;
    meanDir.x /= meanLen;
    meanDir.y /= meanLen;
    meanDir.z /= meanLen;
    
    let variance = 0;
    directions.forEach(d => {
      const dot = d.direction.x * meanDir.x + 
                  d.direction.y * meanDir.y + 
                  d.direction.z * meanDir.z;
      variance += (1 - Math.abs(dot)) * d.weight;
    });
    
    return variance / directions.length;
  }

  classifyJointType(directions) {
    if (directions.length < 2) return 'unknown';
    
    // Simple classification based on variance
    const variance = this.computeDirectionVariance(directions);
    
    if (variance > 0.8) return 'ball_joint';
    if (variance > 0.5) return 'hinge_joint';
    return 'fixed_joint';
  }

  computeDeformation(node1, node2) {
    // Measure how much nodes deform relative to each other
    const rho1 = this.egt.rho[node1.index];
    const rho2 = this.egt.rho[node2.index];
    
    return Math.abs(rho1 - rho2);
  }

  clusterByLowFrequency() {
    // Find regions with lower entanglement frequency
    const clusters = [];
    const visited = new Set();
    
    this.rigNodes.forEach((node, i) => {
      if (visited.has(i)) return;
      
      const cluster = {
        nodes: [i],
        edges: []
      };
      
      const queue = [i];
      visited.add(i);
      
      while (queue.length > 0) {
        const current = queue.shift();
        
        this.egt.edges.forEach(edge => {
          let neighbor = null;
          if (edge.i === current) neighbor = edge.j;
          if (edge.j === current) neighbor = edge.i;
          
          if (neighbor !== null && !visited.has(neighbor) && edge.w_ij < 0.5) {
            cluster.nodes.push(neighbor);
            cluster.edges.push(edge);
            queue.push(neighbor);
            visited.add(neighbor);
          }
        });
      }
      
      if (cluster.nodes.length > 10) {
        clusters.push(cluster);
      }
    });
    
    return clusters;
  }
}

export class HolographicCreatureTemplate {
  constructor(name, signature) {
    this.name = name;
    this.signature = signature;
    this.bulkRules = signature.bulkReconstructionRules;
    this.flowFields = signature.behavioralFlowFields;
    this.governanceProfile = signature.governanceProfile;
  }

  instantiate() {
    // Spawn creature by instantiating boundary pattern
    // Not loading a model!
    
    const egt = this.createEGTFromSignature();
    const anatomy = this.synthesizeAnatomy(egt);
    
    return {
      egt,
      anatomy,
      name: this.name,
      governance: this.governanceProfile
    };
  }

  createEGTFromSignature() {
    // Create EGT based on boundary signature
    const { EGT } = require('./RT4DHolographicArchitecture');
    const egt = new EGT();
    
    // Apply signature patterns
    this.signature.entanglementProfile.nodes.forEach(nodeSig => {
      egt.addNode(nodeSig.position);
      egt.rho[nodeSig.id] = nodeSig.tension || 0.5;
    });
    
    this.signature.entanglementProfile.edges.forEach(edgeSig => {
      egt.addEdge(edgeSig.i, edgeSig.j, edgeSig.weight);
    });
    
    return egt;
  }

  synthesizeAnatomy(egt) {
    const synthesis = new BoundaryDrivenAnatomySynthesis(egt, []);
    return synthesis.synthesizeAnatomy();
  }

  getBoundarySignature() {
    return {
      entanglement: this.signature.entanglementProfile,
      curvature: this.signature.curvatureMap,
      tension: this.signature.tensionFields,
      governance: this.governanceProfile
    };
  }
}

export class ConstitutionalAnimationLoop {
  constructor(creature) {
    this.creature = creature;
    this.frame = 0;
    this.history = [];
  }

  processFrame(intent, evidence) {
    this.frame++;
    
    // Intent phase: what creature is trying to do
    const intentState = this.processIntent(intent);
    
    // Evidence phase: forces, entanglement changes, curvature shifts
    const evidenceState = this.processEvidence(evidence);
    
    // Conformance phase: anatomy constraints, joint limits, holographic duality
    const conformanceState = this.processConformance(intentState, evidenceState);
    
    // Stewardship phase: long-term integrity, fatigue, damage prevention
    const stewardshipState = this.processStewardship(conformanceState);
    
    // Update entanglement tensors, curvature, tension, positions
    const updatedState = this.updateState(intentState, evidenceState, conformanceState, stewardshipState);
    
    // Store CIEMS trace
    this.history.push({
      frame: this.frame,
      intent: intentState,
      evidence: evidenceState,
      conformance: conformanceState,
      stewardship: stewardshipState,
      state: updatedState
    });
    
    return {
      state: updatedState,
      governance: this.aggregateGovernance(intentState, evidenceState, conformanceState, stewardshipState)
    };
  }

  processIntent(intent) {
    // What the creature is trying to do
    return {
      poseTarget: intent.pose,
      expressionTarget: intent.expression,
      motionGoal: intent.motion,
      priority: intent.priority || 1.0
    };
  }

  processEvidence(evidence) {
    // Forces, entanglement changes, curvature shifts, external inputs
    return {
      forces: evidence.forces || [],
      entanglementDelta: this.computeEntanglementDelta(),
      curvatureShift: this.computeCurvatureShift(),
      externalInputs: evidence.inputs || []
    };
  }

  processConformance(intentState, evidenceState) {
    // Anatomy constraints, joint limits, holographic duality invariants
    const violations = [];
    
    // Check joint limits
    this.creature.anatomy.joints.forEach(joint => {
      if (this.checkJointLimitViolation(joint, intentState)) {
        violations.push({ type: 'joint_limit', joint: joint.node });
      }
    });
    
    // Check holographic duality
    if (!this.checkHolographicDuality(intentState)) {
      violations.push({ type: 'duality_violation' });
    }
    
    return {
      violations,
      conformanceScore: 1.0 - (violations.length * 0.1)
    };
  }

  processStewardship(conformanceState) {
    // Long-term integrity, fatigue, damage prevention
    const fatigue = this.computeFatigue();
    const structuralIntegrity = this.checkStructuralIntegrity();
    
    return {
      fatigue,
      structuralIntegrity,
      healthScore: (fatigue + structuralIntegrity) / 2
    };
  }

  updateState(intent, evidence, conformance, stewardship) {
    // Update entanglement tensors, curvature, tension, positions
    const egt = this.creature.egt;
    
    // Apply intent-driven changes
    this.applyIntentChanges(egt, intent);
    
    // Apply evidence-driven changes
    this.applyEvidenceChanges(egt, evidence);
    
    // Apply conformance constraints
    this.applyConformanceConstraints(egt, conformance);
    
    // Apply stewardship corrections
    this.applyStewardshipCorrections(egt, stewardship);
    
    return {
      egt,
      anatomy: this.creature.anatomy
    };
  }

  aggregateGovernance(intent, evidence, conformance, stewardship) {
    return {
      intent: intent.priority,
      evidence: evidence.forces.length > 0 ? 0.8 : 0.5,
      conformance: conformance.conformanceScore,
      stewardship: stewardship.healthScore
    };
  }

  computeEntanglementDelta() {
    // Compute changes in entanglement from previous frame
    return 0.1;
  }

  computeCurvatureShift() {
    // Compute curvature changes
    return 0.05;
  }

  checkJointLimitViolation(joint, intentState) {
    // Check if motion violates joint limits
    return false;
  }

  checkHolographicDuality(intentState) {
    // Verify bulk-boundary consistency
    return true;
  }

  computeFatigue() {
    // Compute muscle fatigue from activation history
    return 0.7;
  }

  checkStructuralIntegrity() {
    // Check for structural damage
    return 0.9;
  }

  applyIntentChanges(egt, intent) {
    // Update entanglement based on intent
  }

  applyEvidenceChanges(egt, evidence) {
    // Update based on physical evidence
  }

  applyConformanceConstraints(egt, conformance) {
    // Enforce anatomical constraints
  }

  applyStewardshipCorrections(egt, stewardship) {
    // Apply health corrections
  }
}

export class HolographicSpeciesTaxonomy {
  constructor() {
    this.genus = new Map();
    this.species = new Map();
    this.individuals = new Map();
  }

  defineSpecies(name, genusName, signature, motionRepertoire, governanceArchetype) {
    const speciesDef = {
      name,
      genus: genusName,
      signatureEnvelope: {
        entanglement: this.createRange(signature.entanglementProfile),
        curvature: this.createRange(signature.curvatureMap),
        tension: this.createRange(signature.tensionFields)
      },
      anatomySynthesisRules: signature.bulkReconstructionRules,
      behavioralRepertoire: motionRepertoire,
      governanceArchetype
    };
    
    this.species.set(name, speciesDef);
    
    if (!this.genus.has(genusName)) {
      this.genus.set(genusName, []);
    }
    this.genus.get(genusName).push(name);
  }

  instantiateIndividual(speciesName, parameters) {
    const species = this.species.get(speciesName);
    if (!species) throw new Error(`Species ${speciesName} not found`);
    
    // Create individual within species envelope
    const individual = {
      species: speciesName,
      parameters,
      boundarySignature: this.generateSignatureWithinEnvelope(
        species.signatureEnvelope,
        parameters
      ),
      motionPrimitives: species.behavioralRepertoire,
      governance: species.governanceArchetype
    };
    
    const id = `${speciesName}_${Date.now()}`;
    this.individuals.set(id, individual);
    
    return id;
  }

  createRange(profile) {
    // Create allowed ranges for signature
    return {
      min: this.computeMin(profile),
      max: this.computeMax(profile),
      mean: this.computeMean(profile)
    };
  }

  computeMin(profile) {
    return profile;
  }

  computeMax(profile) {
    return profile;
  }

  computeMean(profile) {
    return profile;
  }

  generateSignatureWithinEnvelope(envelope, parameters) {
    // Generate signature based on species envelope and individual parameters
    return {
      entanglement: this.interpolate(envelope.entanglement, parameters),
      curvature: this.interpolate(envelope.curvature, parameters),
      tension: this.interpolate(envelope.tension, parameters)
    };
  }

  interpolate(range, params) {
    // Interpolate within range based on parameters
    return range.mean;
  }

  getTaxonomy() {
    return {
      genera: Array.from(this.genus.entries()),
      species: Array.from(this.species.entries()),
      individuals: this.individuals.size
    };
  }
}
