/**
 * RT4D + Holographic Module Architecture
 * 
 * Code-level architecture matching specification
 * 
 * Status: enforced
 */

import { EntanglementGraphTensor } from './EntanglementGraphTensor.js';
import { ProjectionTensor } from './ProjectionTensor.js';

class BulkSpacetimeEngine {
  constructor(options = {}) {
    this.c = options.c ?? 1.0;
    this.g_mu_nu = this.createMinkowskiMetric();
    this.fields = [];
    this.worldlines = [];
    this.currentState = null;
    this.time = 0.0;
  }

  createMinkowskiMetric() {
    return [
      [-this.c * this.c, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
  }

  stepBulk(dt) {
    this.time += dt;
    
    // Update fields
    for (const field of this.fields) {
      if (field.evolve) {
        field.evolve(dt);
      }
    }
    
    // Update worldlines
    for (const worldline of this.worldlines) {
      if (worldline.evolve) {
        worldline.evolve(dt);
      }
    }
    
    this.currentState = this.sampleBulkRegion({ all: true });
  }

  sampleBulkRegion(region) {
    return {
      fields: this.fields,
      worldlines: this.worldlines,
      time: this.time,
      metric: this.g_mu_nu
    };
  }

  addField(field) {
    this.fields.push(field);
  }

  addWorldline(worldline) {
    this.worldlines.push(worldline);
  }
}

class BoundaryProjection {
  constructor(options = {}) {
    this.c = options.c ?? 1.0;
    this.n_mu = [-this.c, 0, 0, 0]; // Timelike normal
    this.g_mu_nu = this.createMinkowskiMetric();
    this.h_mu_nu = this.computeProjectionTensor();
  }

  createMinkowskiMetric() {
    return [
      [-this.c * this.c, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
  }

  computeProjectionTensor() {
    const h = [];
    for (let mu = 0; mu < 4; mu++) {
      h[mu] = [];
      for (let nu = 0; nu < 4; nu++) {
        let g = this.g_mu_nu[mu][nu];
        let nTerm = this.n_mu[mu] * this.n_mu[nu];
        h[mu][nu] = g + nTerm;
      }
    }
    return h;
  }

  projectPoint(x_mu) {
    const [t, x, y, z] = x_mu;
    // Project using h_mu_nu
    // For static observer: kills time component
    return { x, y, z };
  }

  projectField(field4D) {
    return field4D.map(field => ({
      ...field,
      position3D: this.projectPoint(field.position)
    }));
  }
}

class Node {
  constructor(id, position) {
    this.id = id;
    this.position = { x: position.x, y: position.y, z: position.z };
  }
}

class Edge {
  constructor(i, j, w_ij) {
    this.i = i;
    this.j = j;
    this.w_ij = Math.max(0, Math.min(1, w_ij));
  }
}

class CausalLink {
  constructor(from, to, strength) {
    this.from = from;
    this.to = to;
    this.strength = Math.max(0, Math.min(1, strength));
  }
}

class EGT {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.rho = []; // info density per node
    this.K = [];   // curvature per node
    this.C = [];   // causal links
  }

  addNode(position) {
    const node = new Node(this.nodes.length, position);
    this.nodes.push(node);
    this.rho.push(0.0);
    this.K.push(0.0);
    return node;
  }

  addEdge(i, j, w_ij) {
    const edge = new Edge(i, j, w_ij);
    this.edges.push(edge);
    return edge;
  }

  addCausalLink(from, to, strength) {
    const link = new CausalLink(from, to, strength);
    this.C.push(link);
    return link;
  }

  computeEntanglementDensity(nodeId) {
    let epsilon = 0.0;
    for (const edge of this.edges) {
      if (edge.i === nodeId || edge.j === nodeId) {
        epsilon += edge.w_ij;
      }
    }
    return epsilon;
  }

  computeEntanglementGradient(nodeId) {
    const node = this.nodes[nodeId];
    let grad = { x: 0, y: 0, z: 0 };
    
    for (const edge of this.edges) {
      let otherId = null;
      if (edge.i === nodeId) otherId = edge.j;
      if (edge.j === nodeId) otherId = edge.i;
      
      if (otherId !== null) {
        const otherNode = this.nodes[otherId];
        const dx = otherNode.position.x - node.position.x;
        const dy = otherNode.position.y - node.position.y;
        const dz = otherNode.position.z - node.position.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 1e-12;
        
        const epsilonDiff = this.computeEntanglementDensity(otherId) - 
                            this.computeEntanglementDensity(nodeId);
        
        grad.x += epsilonDiff * dx / (dist * dist);
        grad.y += epsilonDiff * dy / (dist * dist);
        grad.z += epsilonDiff * dz / (dist * dist);
      }
    }
    
    return grad;
  }

  computeEntanglementLaplacian(nodeId) {
    let laplacian = 0.0;
    const nodeEpsilon = this.computeEntanglementDensity(nodeId);
    
    for (const edge of this.edges) {
      if (edge.i === nodeId) {
        const otherEpsilon = this.computeEntanglementDensity(edge.j);
        laplacian += otherEpsilon - nodeEpsilon;
      }
      if (edge.j === nodeId) {
        const otherEpsilon = this.computeEntanglementDensity(edge.i);
        laplacian += otherEpsilon - nodeEpsilon;
      }
    }
    
    return laplacian;
  }

  computeCurvature(nodeId, alpha = 0.5, beta = 0.3) {
    const gradient = this.computeEntanglementGradient(nodeId);
    const gradientMagnitude = Math.sqrt(
      gradient.x*gradient.x + gradient.y*gradient.y + gradient.z*gradient.z
    );
    
    const laplacian = this.computeEntanglementLaplacian(nodeId);
    
    const K = alpha * gradientMagnitude + beta * Math.abs(laplacian);
    this.K[nodeId] = K;
    
    return K;
  }

  computeRegionEntropy(regionNodes, f = (w) => w) {
    let S = 0.0;
    for (const edge of this.edges) {
      const inRegionI = regionNodes.includes(edge.i);
      const inRegionJ = regionNodes.includes(edge.j);
      if (inRegionI !== inRegionJ) {
        S += f(edge.w_ij);
      }
    }
    return S;
  }
}

class HolographicEncoder {
  constructor(options = {}) {
    this.projection = new BoundaryProjection(options);
    this.egt = new EGT();
    this.boundaryMesh = null;
  }

  buildEGT(bulk, boundaryMesh) {
    this.boundaryMesh = boundaryMesh;
    this.egt = new EGT();
    
    // Project bulk fields to boundary
    for (const field of bulk.fields) {
      const pos3D = this.projection.projectPoint(field.position);
      const node = this.egt.addNode(pos3D);
      this.egt.rho[node.id] = field.energy || 0.1;
    }
    
    // Build entanglement edges
    for (let i = 0; i < bulk.fields.length; i++) {
      for (let j = i + 1; j < bulk.fields.length; j++) {
        const fieldI = bulk.fields[i];
        const fieldJ = bulk.fields[j];
        
        const interaction = this.computeInteraction(fieldI, fieldJ);
        if (interaction > 0.01) {
          this.egt.addEdge(i, j, interaction);
          
          // Causal link
          if (fieldI.position.w < fieldJ.position.w) {
            this.egt.addCausalLink(i, j, interaction);
          }
        }
      }
    }
    
    // Compute curvature
    for (let i = 0; i < this.egt.nodes.length; i++) {
      this.egt.computeCurvature(i);
    }
    
    return this.egt;
  }

  updateEGT(egt, bulk) {
    // Update existing EGT with new bulk state
    return this.buildEGT(bulk, this.boundaryMesh);
  }

  computeInteraction(fieldI, fieldJ) {
    const dx = fieldI.position.x - fieldJ.position.x;
    const dy = fieldI.position.y - fieldJ.position.y;
    const dz = fieldI.position.z - fieldJ.position.z;
    const dw = fieldI.position.w - fieldJ.position.w;
    
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const spatialWeight = Math.exp(-dist * 0.5);
    const temporalWeight = Math.exp(-Math.abs(dw) * 0.1);
    
    return spatialWeight * temporalWeight;
  }
}

class EntanglementRenderer {
  constructor(options = {}) {
    this.mode = options.mode ?? 'composite';
    this.warpScale = options.warpScale ?? 0.1;
  }

  renderBoundary(egt, boundaryMesh, mode) {
    this.mode = mode ?? this.mode;
    
    switch (this.mode) {
      case 'ENTANGLEMENT':
        return this.renderEntanglementHeatmap(egt);
      case 'CAUSAL':
        return this.renderCausalFlowField(egt);
      case 'GEOMETRY':
        return this.renderEmergentGeometry(egt);
      case 'COMPOSITE':
      default:
        return this.renderComposite(egt);
    }
  }

  renderEntanglementHeatmap(egt) {
    return {
      type: 'entanglement_heatmap',
      nodes: egt.nodes.map((node, i) => ({
        position: node.position,
        rho: egt.rho[i],
        entanglement: egt.edges
          .filter(e => e.i === i || e.j === i)
          .reduce((sum, e) => sum + e.w_ij, 0)
      }))
    };
  }

  renderCausalFlowField(egt) {
    return {
      type: 'causal_flow',
      links: egt.C.map(link => ({
        from: egt.nodes[link.from].position,
        to: egt.nodes[link.to].position,
        strength: link.strength
      }))
    };
  }

  renderEmergentGeometry(egt) {
    return {
      type: 'emergent_geometry',
      nodes: egt.nodes.map((node, i) => ({
        position: node.position,
        warpedPosition: {
          x: node.position.x,
          y: node.position.y,
          z: node.position.z + egt.K[i] * this.warpScale
        },
        curvature: egt.K[i]
      }))
    };
  }

  renderComposite(egt) {
    return {
      type: 'composite',
      entanglement: this.renderEntanglementHeatmap(egt),
      causal: this.renderCausalFlowField(egt),
      geometry: this.renderEmergentGeometry(egt)
    };
  }
}

// Main loop
class RT4DHolographicSystem {
  constructor(options = {}) {
    this.bulkEngine = new BulkSpacetimeEngine(options);
    this.projection = new BoundaryProjection(options);
    this.encoder = new HolographicEncoder(options);
    this.renderer = new EntanglementRenderer(options);
    
    this.egt = new EGT();
    this.boundaryMesh = null;
    this.viewMode = 'COMBINED';
    this.renderMode = 'COMPOSITE';
    
    this.running = false;
  }

  start() {
    this.running = true;
    this.mainLoop();
  }

  mainLoop() {
    const dt = 0.016; // 60 FPS
    
    while (this.running) {
      this.step(dt);
    }
  }

  step(dt) {
    // 1. Step bulk
    this.bulkEngine.stepBulk(dt);
    
    // 2. Update EGT
    this.egt = this.encoder.updateEGT(this.egt, this.bulkEngine.currentState);
    
    // 3. Render based on view mode
    switch (this.viewMode) {
      case 'BULK':
        this.renderBulk();
        break;
      case 'BOUNDARY':
        this.renderer.renderBoundary(this.egt, this.boundaryMesh, this.renderMode);
        break;
      case 'COMBINED':
        this.renderBulk();
        this.renderer.renderBoundary(this.egt, this.boundaryMesh, this.renderMode);
        break;
    }
  }

  renderBulk() {
    // Render 4D bulk spacetime
    return this.bulkEngine.currentState;
  }

  setViewMode(mode) {
    this.viewMode = mode;
  }

  setRenderMode(mode) {
    this.renderMode = mode;
  }
}

export {
  BulkSpacetimeEngine,
  BoundaryProjection,
  Node,
  Edge,
  CausalLink,
  EGT,
  HolographicEncoder,
  EntanglementRenderer,
  RT4DHolographicSystem
};
