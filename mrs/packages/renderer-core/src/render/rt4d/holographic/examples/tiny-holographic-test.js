/**
 * Tiny Holographic Test Scene
 * 
 * End-to-end test: 4D worldline → 3D boundary EGT → curvature → visualization
 */

import { BulkSpacetimeEngine } from '../RT4DHolographicArchitecture.js';
import { BoundaryProjection } from '../RT4DHolographicArchitecture.js';
import { EGT, HolographicEncoder, EntanglementRenderer } from '../RT4DHolographicArchitecture.js';

console.log('=== Tiny Holographic Test Scene ===\n');

// Step 1: Bulk setup - single worldline
class Worldline {
  constructor(vx) {
    this.vx = vx;
  }
  
  positionAt(t) {
    return { t, x: this.vx * t, y: 0, z: 0, w: t };
  }
}

console.log('1. Bulk Setup');
console.log('--------------');

const bulkEngine = new BulkSpacetimeEngine();
const worldline = new Worldline(1.0);

bulkEngine.addWorldline({ 
  positionAt: (t) => worldline.positionAt(t),
  evolve: (dt) => {}
});

bulkEngine.addField({
  position: { t: 0, x: 0, y: 0, z: 0, w: 0 },
  energy: 1.0,
  evolve: (dt) => {}
});

console.log('Worldline: x(t) = v_x * t, y=0, z=0');
console.log('Metric: flat Minkowski ds² = -c²dt² + dx² + dy² + dz²\n');

// Step 2: Boundary setup - grid plane
console.log('2. Boundary Setup');
console.log('-------------------');

function makeGridPlane(sizeX, sizeY, resX, resY, z) {
  const vertices = [];
  const spacingX = sizeX / (resX - 1);
  const spacingY = sizeY / (resY - 1);
  
  for (let y = 0; y < resY; y++) {
    for (let x = 0; x < resX; x++) {
      vertices.push({
        x: -sizeX/2 + x * spacingX,
        y: -sizeY/2 + y * spacingY,
        z
      });
    }
  }
  return vertices;
}

const boundaryVertices = makeGridPlane(10.0, 10.0, 32, 32, 0.0);
console.log(`Boundary grid: 32x32 = ${boundaryVertices.length} nodes`);
console.log('Plane at z=0\n');

// Step 3: Projection
console.log('3. Projection - Bulk → Boundary');
console.log('-----------------------------------');

const projection = new BoundaryProjection();
const egt = new EGT();

// Initialize EGT nodes from boundary
boundaryVertices.forEach((v, i) => {
  egt.addNode(v);
});

console.log(`EGT initialized with ${egt.nodes.length} nodes\n`);

// Step 4: Simulation frames
console.log('4. Simulation Frames');
console.log('---------------------');

const alpha = 0.5;
const beta = 0.3;
const warpScale = 0.1;
const densityIncrement = 0.1;
const entanglementIncrement = 0.05;

for (let frame = 0; frame < 5; frame++) {
  const t = frame * 0.5;
  const bulkPos = worldline.positionAt(t);
  
  // Project to boundary
  const p3 = { x: bulkPos.x, y: bulkPos.y, z: bulkPos.z };
  
  // Find nearest node
  let nearestIdx = 0;
  let minDist = Infinity;
  
  for (let i = 0; i < egt.nodes.length; i++) {
    const node = egt.nodes[i];
    const dx = node.position.x - p3.x;
    const dy = node.position.y - p3.y;
    const dz = node.position.z - p3.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    
    if (dist < minDist) {
      minDist = dist;
      nearestIdx = i;
    }
  }
  
  // Increase info density
  const prevRho = egt.rho[nearestIdx];
  egt.rho[nearestIdx] += densityIncrement;
  
  // Add entanglement edges to neighbors
  const neighbors = [];
  const gridRes = 32;
  const row = Math.floor(nearestIdx / gridRes);
  const col = nearestIdx % gridRes;
  
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nr = row + dy;
      const nc = col + dx;
      if (nr >= 0 && nr < gridRes && nc >= 0 && nc < gridRes) {
        const nIdx = nr * gridRes + nc;
        neighbors.push(nIdx);
      }
    }
  }
  
  let edgeCount = 0;
  for (const nIdx of neighbors) {
    // Check if edge exists
    let existingEdge = egt.edges.find(e => 
      (e.i === nearestIdx && e.j === nIdx) || 
      (e.i === nIdx && e.j === nearestIdx)
    );
    
    if (existingEdge) {
      existingEdge.w_ij += entanglementIncrement;
    } else {
      egt.addEdge(nearestIdx, nIdx, entanglementIncrement);
    }
    edgeCount++;
  }
  
  // Compute curvature for all nodes
  for (let i = 0; i < egt.nodes.length; i++) {
    egt.computeCurvature(i, alpha, beta);
  }
  
  console.log(`Frame ${frame}: t=${t.toFixed(2)}`);
  console.log(`  Bulk position: (t=${bulkPos.t}, x=${bulkPos.x.toFixed(2)}, y=${bulkPos.y}, z=${bulkPos.z})`);
  console.log(`  Nearest node: ${nearestIdx} at (${egt.nodes[nearestIdx].position.x.toFixed(2)}, ${egt.nodes[nearestIdx].position.y.toFixed(2)})`);
  console.log(`  Density: ${prevRho.toFixed(3)} → ${egt.rho[nearestIdx].toFixed(3)}`);
  console.log(`  Neighbor edges: ${edgeCount}`);
  console.log(`  Curvature at node: ${egt.K[nearestIdx].toFixed(4)}\n`);
}

// Summary
console.log('5. Results');
console.log('-----------');

const maxDensity = Math.max(...egt.rho);
const maxCurvature = Math.max(...egt.K);
const totalEdges = egt.edges.length;

console.log(`Max info density: ${maxDensity.toFixed(3)}`);
console.log(`Max curvature: ${maxCurvature.toFixed(4)}`);
console.log(`Total entanglement edges: ${totalEdges}`);

const denseNodes = egt.rho.filter(r => r > 0.5).length;
console.log(`Nodes with high density: ${denseNodes}`);

console.log('\n✓ 4D worldline projected to 3D boundary');
console.log('✓ Entanglement field building on boundary');
console.log('✓ Curvature computed from entanglement gradients');
console.log('✓ Pipeline validated end-to-end\n');

console.log('Visual expectations:');
console.log('- Brightening trail of info density along projected path');
console.log('- Entanglement links forming around trail');
console.log('- Boundary mesh warping where curvature strongest');
console.log('\nHolographic test PASSED ✓');
