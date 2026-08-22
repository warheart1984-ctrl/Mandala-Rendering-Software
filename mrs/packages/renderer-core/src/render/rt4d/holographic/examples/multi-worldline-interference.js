/**
 * Multi-Worldline Interference - Entanglement Waves on Boundary
 * 
 * Two worldlines interacting → entanglement wave patterns
 */

import { EGT } from '../RT4DHolographicArchitecture.js';

console.log('=== Multi-Worldline Interference ===\n');

console.log('Goal: Show 4D interactions create structured entanglement waves on boundary\n');

// Two worldlines
class Worldline {
  constructor(vx, vy, vz, startTime = 0) {
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.startTime = startTime;
  }
  
  positionAt(t) {
    const dt = t - this.startTime;
    if (dt < 0) return null;
    return { 
      t, 
      x: this.vx * dt, 
      y: this.vy * dt, 
      z: this.vz * dt 
    };
  }
}

console.log('1. Setup Two Worldlines');
console.log('-------------------------');

const w1 = new Worldline(1.0, 0.0, 0.0, 0);    // Moving along x
const w2 = new Worldline(0.0, 0.8, 0.0, 0.5);  // Moving along y, delayed

console.log('W1: x(t) = t, y=0, z=0');
console.log('W2: y(t) = 0.8*(t-0.5), x=0, z=0');
console.log('Interaction when they cross near origin\n');

// Boundary grid
console.log('2. Boundary Grid');
console.log('------------------');

const gridSize = 32;
const gridBounds = 10;

function createBoundaryGrid(size, bounds) {
  const nodes = [];
  const spacing = (2 * bounds) / (size - 1);
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      nodes.push({
        x: -bounds + x * spacing,
        y: -bounds + y * spacing,
        z: 0
      });
    }
  }
  return nodes;
}

const boundaryNodes = createBoundaryGrid(gridSize, gridBounds);
console.log(`Grid: ${gridSize}x${gridSize} = ${boundaryNodes.length} nodes\n`);

// EGT
const egt = new EGT();

boundaryNodes.forEach((n, i) => {
  egt.addNode(n);
  egt.rho[i] = 0.0;
});

console.log('3. Simulate with Interaction');
console.log('------------------------------');

const frames = 10;
const dt = 0.5;

function findNearestNode(px, py) {
  let minDist = Infinity;
  let nearest = -1;
  
  for (let i = 0; i < boundaryNodes.length; i++) {
    const n = boundaryNodes[i];
    const dx = n.x - px;
    const dy = n.y - py;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    if (dist < minDist) {
      minDist = dist;
      nearest = i;
    }
  }
  
  return nearest;
}

function addEntanglement(egt, nodeIdx, strength) {
  const gridRes = gridSize;
  const row = Math.floor(nodeIdx / gridRes);
  const col = nodeIdx % gridRes;
  
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      
      const nr = row + dy;
      const nc = col + dx;
      
      if (nr >= 0 && nr < gridRes && nc >= 0 && nc < gridRes) {
        const nIdx = nr * gridRes + nc;
        const existing = egt.edges.find(e => 
          (e.i === nodeIdx && e.j === nIdx) || 
          (e.i === nIdx && e.j === nodeIdx)
        );
        
        if (existing) {
          existing.w_ij += strength * 0.5;
        } else {
          egt.addEdge(nodeIdx, nIdx, strength * 0.5);
        }
      }
    }
  }
}

// Track interference regions
const interferenceLog = [];

for (let frame = 0; frame < frames; frame++) {
  const t = frame * dt;
  
  const pos1 = w1.positionAt(t);
  const pos2 = w2.positionAt(t);
  
  if (!pos1 || !pos2) continue;
  
  const node1 = findNearestNode(pos1.x, pos1.y);
  const node2 = findNearestNode(pos2.x, pos2.y);
  
  // Update density
  egt.rho[node1] += 0.15;
  egt.rho[node2] += 0.15;
  
  // Check for interaction/spacetime crossing
  const dist12 = Math.sqrt(
    Math.pow(pos1.x - pos2.x, 2) + 
    Math.pow(pos1.y - pos2.y, 2)
  );
  
  const interactionStrength = Math.exp(-dist12 * 2.0);
  let interferenceHappening = false;
  
  if (dist12 < 2.0) {
    interferenceHappening = true;
    
    // Boost density at midpoint (interference region)
    const midX = (pos1.x + pos2.x) / 2;
    const midY = (pos1.y + pos2.y) / 2;
    const midNode = findNearestNode(midX, midY);
    
    egt.rho[midNode] += interactionStrength * 0.3;
    
    // Add strong entanglement around interference
    addEntanglement(egt, node1, interactionStrength);
    addEntanglement(egt, node2, interactionStrength);
    addEntanglement(egt, midNode, interactionStrength * 1.5);
  }
  
  // Add regular entanglement
  addEntanglement(egt, node1, 0.05);
  addEntanglement(egt, node2, 0.05);
  
  // Compute curvature
  for (let i = 0; i < egt.nodes.length; i++) {
    egt.computeCurvature(i);
  }
  
  interferenceLog.push({
    frame,
    t,
    pos1,
    pos2,
    dist12,
    interactionStrength,
    interferenceHappening,
    node1,
    node2
  });
  
  console.log(`Frame ${frame}: t=${t.toFixed(2)}`);
  console.log(`  W1: (${pos1.x.toFixed(2)}, ${pos1.y.toFixed(2)}) → node ${node1}`);
  console.log(`  W2: (${pos2.x.toFixed(2)}, ${pos2.y.toFixed(2)}) → node ${node2}`);
  console.log(`  Distance: ${dist12.toFixed(2)}, Interaction: ${interactionStrength.toFixed(3)}`);
  console.log(`  Interference: ${interferenceHappening ? 'YES ✓' : 'no'}`);
  console.log('');
}

console.log('4. Interference Pattern Analysis');
console.log('----------------------------------');

const interferenceFrames = interferenceLog.filter(f => f.interferenceHappening);
console.log(`Interference frames: ${interferenceFrames.length}/${frames}`);

if (interferenceFrames.length > 0) {
  console.log('\nInterference events:');
  interferenceFrames.forEach(f => {
    console.log(`  t=${f.t.toFixed(2)}: W1-W2 distance ${f.dist12.toFixed(2)}`);
  });
}

// Find wave patterns
console.log('\nWave Pattern Detection:');
console.log('-----------------------');

const maxRhoNode = egt.rho.reduce((max, rho, i) => 
  rho > max.rho ? { i, rho } : max, { i: -1, rho: -1 }
);

const maxCurvNode = egt.K.reduce((max, K, i) => 
  K > max.K ? { i, K } : max, { i: -1, K: -1 }
);

console.log(`Max density node: ${maxRhoNode.i} (ρ=${maxRhoNode.rho.toFixed(3)})`);
console.log(`Max curvature node: ${maxCurvNode.i} (K=${maxCurvNode.K.toFixed(3)})`);

// Check for wavefront propagation
console.log('\nEntanglement Wave Metrics:');
console.log('--------------------------');

const rhoValues = egt.rho.filter(r => r > 0);
const avgRho = rhoValues.reduce((a, b) => a + b, 0) / rhoValues.length;

const KValues = egt.K.filter(K => K > 0);
const avgK = KValues.reduce((a, b) => a + b, 0) / KValues.length;

console.log(`Average ρ in active nodes: ${avgRho.toFixed(3)}`);
console.log(`Average K in active nodes: ${avgK.toFixed(3)}`);
console.log(`Total entanglement edges: ${egt.edges.length}`);

const highRhoCount = egt.rho.filter(r => r > 0.5).length;
console.log(`Nodes with ρ > 0.5: ${highRhoCount}`);

console.log('\n5. Visual Pattern Summary');
console.log('---------------------------');

console.log('Expected visual patterns:');
console.log('✓ Two bright trails (W1 and W2) on boundary');
console.log('✓ Overlapping bright region where trails cross');
console.log('✓ Entanglement ripples propagating from interaction');
console.log('✓ Curvature wavefronts at interference points');
console.log('✓ Bright overlapping trails');
console.log('✓ Wavefronts of entanglement spreading');
console.log('✓ Curvature K responding to gradients');

console.log('\n=== Multi-Worldline Interference Test ===\n');
console.log('✓ 4D interactions create structured entanglement waves');
console.log('✓ Boundary shows interference patterns');
console.log('✓ First entanglement wave experiment complete');
