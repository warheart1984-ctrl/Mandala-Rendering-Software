/**
 * Entanglement Field Renderer (EFR)
 *
 * NOT SoT. The streaming holographic renderer is
 * mandala/holography/entanglement-renderer.mjs
 *
 * Status: leftover sketch — do not treat "enforced" as GPU proof.
 */

export class EntanglementRenderer {
  constructor(options = {}) {
    this.renderMode = options.renderMode ?? 'composite';
    this.warpScale = options.warpScale ?? 0.1;
    this.flowSpeed = options.flowSpeed ?? 1.0;
    this.flowFreq = options.flowFreq ?? 5.0;
    
    this.time = 0;
  }

  /**
   * Render boundary EGT
   */
  renderBoundary(egt, boundaryMesh, mode = this.renderMode) {
    this.renderMode = mode;
    
    switch (mode) {
      case 'entanglement':
        return this.renderEntanglementHeatmap(egt, boundaryMesh);
      case 'causal':
        return this.renderCausalFlowField(egt, boundaryMesh);
      case 'geometry':
        return this.renderEmergentGeometry(egt, boundaryMesh);
      case 'composite':
      default:
        return this.renderComposite(egt, boundaryMesh);
    }
  }

  /**
   * Render entanglement heatmap
   * 
   * Color = entanglement strength
   * Brightness = density
   * Smooth gradients = curvature
   */
  renderEntanglementHeatmap(egt, boundaryMesh) {
    const vertices = [];
    const colors = [];
    const normals = [];
    
    for (const node of egt.nodes) {
      vertices.push(node.position.x, node.position.y, node.position.z);
      
      // Map entanglement to color
      const entanglement = Math.min(1, node.entanglementSum);
      const density = Math.min(1, node.rho);
      
      // Blue → Red gradient for entanglement
      const r = entanglement;
      const g = 0.0;
      const b = 1.0 - entanglement;
      
      // Brightness from density
      const intensity = Math.min(1, density * 2);
      
      colors.push(r * intensity, g * intensity, b * intensity);
      normals.push(0, 0, 1); // Placeholder
    }
    
    return {
      type: 'entanglement_heatmap',
      vertices,
      colors,
      normals,
      edgeCount: egt.edges.length,
      nodeCount: egt.nodes.length
    };
  }

  /**
   * Render causal flow field
   * 
   * Arrows/pulses along directed edges
   * Shows how "time" flows on boundary
   */
  renderCausalFlowField(egt, boundaryMesh) {
    const flows = [];
    
    for (const link of egt.causalLinks) {
      const from = egt.nodes[link.from];
      const to = egt.nodes[link.to];
      
      // Flow line
      flows.push({
        start: from.position,
        end: to.position,
        strength: link.strength,
        color: this.getCausalColor(link.strength)
      });
    }
    
    // Animate pulses
    const animatedFlows = flows.map(flow => ({
      ...flow,
      pulse: this.computePulse(flow.start, flow.end)
    }));
    
    return {
      type: 'causal_flow',
      flows: animatedFlows,
      nodeCount: egt.nodes.length,
      linkCount: egt.causalLinks.length
    };
  }

  /**
   * Render emergent geometry
   * 
   * Warp boundary mesh using curvature
   * Visualizes bulk curvature from boundary entanglement
   */
  renderEmergentGeometry(egt, boundaryMesh) {
    const warpedVertices = [];
    
    for (const node of egt.nodes) {
      const warpAmount = node.K * this.warpScale;
      
      // Warp along normal direction
      // Simplified: warp in z direction
      const warpedPos = {
        x: node.position.x,
        y: node.position.y,
        z: node.position.z + warpAmount
      };
      
      warpedVertices.push(warpedPos.x, warpedPos.y, warpedPos.z);
    }
    
    return {
      type: 'emergent_geometry',
      vertices: warpedVertices,
      originalVertices: boundaryMesh?.vertices || [],
      curvature: egt.curvature,
      warpScale: this.warpScale
    };
  }

  /**
   * Render composite view
   */
  renderComposite(egt, boundaryMesh) {
    return {
      type: 'composite',
      entanglement: this.renderEntanglementHeatmap(egt, boundaryMesh),
      causal: this.renderCausalFlowField(egt, boundaryMesh),
      geometry: this.renderEmergentGeometry(egt, boundaryMesh)
    };
  }

  /**
   * Get causal color
   */
  getCausalColor(strength) {
    return {
      r: strength,
      g: 0.5,
      b: 1.0 - strength
    };
  }

  /**
   * Compute pulse animation
   */
  computePulse(start, end) {
    const dot = start.x * end.x + start.y * end.y + start.z * end.z;
    const pulse = Math.sin(dot * this.flowFreq + this.time * this.flowSpeed);
    return Math.max(0, pulse);
  }

  /**
   * Update time for animation
   */
  updateTime(dt) {
    this.time += dt;
  }

  /**
   * Generate WebGPU shader for entanglement rendering
   */
  generateEntanglementShader() {
    return `
// Entanglement Field Renderer Shader
// Visualizes EGT as holographic screen

struct NodeData {
  position: vec3<f32>,
  rho: f32,           // Information density
  entanglementSum: f32,
  K: f32,             // Curvature
};

struct EdgeData {
  i: u32,
  j: u32,
  weight: f32,
};

@group(0) @binding(0) var<storage, read> nodes: array<NodeData>;
@group(0) @binding(1) var<storage, read> edges: array<EdgeData>;
@group(0) @binding(2) var<uniform> params: RenderParams;

struct RenderParams {
  time: f32,
  warpScale: f32,
  flowSpeed: f32,
  flowFreq: f32,
  mode: u32, // 0=entanglement, 1=causal, 2=geometry
};

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= arrayLength(&nodes)) { return; }
  
  let node = nodes[idx];
  
  // Entanglement heatmap
  let entanglement = clamp(node.entanglementSum, 0.0, 1.0);
  let density = clamp(node.rho, 0.0, 1.0);
  
  let baseColor = vec3<f32>(entanglement, 0.0, 1.0 - entanglement);
  let intensity = density * 2.0;
  let finalColor = baseColor * intensity;
  
  // Curvature warp
  let warpAmount = node.K * params.warpScale;
  let warpedPos = vec4<f32>(node.position + vec3<f32>(0,0,warpAmount), 1.0);
  
  // Causal flow pulse
  let pulse = sin(dot(node.position, vec3<f32>(1.0,1.0,1.0)) * params.flowFreq + params.time * params.flowSpeed);
  let emissive = vec3<f32>(pulse, pulse * 0.5, 0.0);
  
  // Output
}
`;
  }

  /**
   * Generate vertex shader for warped geometry
   */
  generateWarpedGeometryShader() {
    return `
// Warped Geometry Vertex Shader
// Applies curvature-based displacement

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) K: f32, // Curvature
};

struct VertexOutput {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) curvature: f32,
};

@group(0) @binding(0) var<uniform> params: RenderParams;

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  
  // Warp position by curvature
  let warpAmount = input.K * params.warpScale;
  let warpedPos = input.position + normalize(input.normal) * warpAmount;
  
  output.worldPos = warpedPos;
  output.curvature = input.K;
  output.clipPos = vec4<f32>(warpedPos, 1.0); // Simplified
  
  return output;
}
`;
  }

  /**
   * Generate fragment shader for entanglement coloring
   */
  generateEntanglementFragmentShader() {
    return `
// Entanglement Fragment Shader
// Colors by entanglement and density

struct FragmentInput {
  @location(0) worldPos: vec3<f32>,
  @location(1) curvature: f32,
};

@group(0) @binding(0) var<uniform> params: RenderParams;
@group(0) @binding(1) var nodeData: NodeData; // Per-instance

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
  let entanglement = clamp(nodeData.entanglementSum, 0.0, 1.0);
  let density = clamp(nodeData.rho, 0.0, 1.0);
  
  // Base entanglement color
  let baseColor = vec3<f32>(entanglement, 0.0, 1.0 - entanglement);
  let intensity = density * 2.0;
  
  // Curvature affects brightness
  let curvatureBoost = 1.0 + abs(nodeData.K) * 0.5;
  
  // Causal flow pulse
  let pulse = sin(dot(input.worldPos, vec3<f32>(1.0,1.0,1.0)) * params.flowFreq + params.time * params.flowSpeed);
  let emissive = vec3<f32>(pulse, pulse * 0.5, 0.0) * params.flowSpeed;
  
  let finalColor = baseColor * intensity * curvatureBoost + emissive;
  
  return vec4<f32>(finalColor, 1.0);
}
`;
  }

  /**
   * Export render data for WebGPU
   */
  exportRenderData(egt) {
    return {
      nodeCount: egt.nodes.length,
      edgeCount: egt.edges.length,
      nodes: egt.nodes.map(n => ({
        position: n.position,
        rho: n.rho,
        entanglementSum: n.entanglementSum,
        K: n.K
      })),
      edges: egt.edges.map(e => ({
        i: e.i,
        j: e.j,
        weight: e.weight
      })),
      causalLinks: egt.causalLinks.map(c => ({
        from: c.from,
        to: c.to,
        strength: c.strength
      }))
    };
  }
}

/**
 * Factory functions
 */
export function createEntanglementRenderer(options) {
  return new EntanglementRenderer(options);
}

export function renderHolographicBoundary(egt, mode = 'composite') {
  const renderer = new EntanglementRenderer({ renderMode: mode });
  return renderer.renderBoundary(egt, null, mode);
}
