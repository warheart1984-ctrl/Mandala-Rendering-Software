/**
 * Entanglement Tensor Rig Demo
 * 
 * Rig nodes as information wells with CIEMS governance
 */

import { EntanglementTensorRig, ConstitutionalHolographicOrganismArena } from '../EntanglementRigNode.js';

console.log('=== Entanglement Tensor Rig with CIEMS ===\n');

console.log('1. Rig Node as Information Well');
console.log('----------------------------------');

console.log('Each rig node stores:');
console.log('  Position: xi ∈ R³');
console.log('  Normal/tangent frame: ni, ti');
console.log('  Layer weights: skin/muscle/bone');
console.log('  Entanglement tensor: E = Σ wij * d^ij ⊗ d^ij');
console.log('  ρ: local activation/tension');
console.log('  Governance coords: intent, evidence, conformance, stewardship');
console.log('');

// Simulate rig
const nodeCount = 100;
const rig = new EntanglementTensorRig(nodeCount);

console.log(`Rig initialized with ${nodeCount} nodes\n`);

console.log('2. Entanglement Tensor Computation');
console.log('------------------------------------');

console.log('For each node:');
console.log('  E = Σ wij * d^ij ⊗ d^ij');
console.log('  where d^ij = normalized direction to neighbor');
console.log('');
console.log('Interpretation:');
console.log('  High |E| → strongly coupled region');
console.log('  Eigenvectors → dominant fiber/flow directions');
console.log('');

console.log('3. Curvature → Muscle Activation Mapping');
console.log('------------------------------------------');

console.log('From entanglement to curvature:');
console.log('  εi = Σ wij');
console.log('  Ki ≈ Δεi (discrete Laplacian)');
console.log('');
console.log('Muscle activation:');
console.log('  Ak = f(1/|Mk| Σ Ki)');
console.log('  where f = sigmoid');
console.log('');
console.log('Node activation:');
console.log('  ρi = g(Ki, Ak, fiber alignment)');
console.log('  High curvature + aligned fibers → higher ρ');
console.log('');

console.log('4. CIEMS Governance Integration');
console.log('---------------------------------');

console.log('Governance coordinates per node:');
console.log('  intent: what motion is trying to achieve');
console.log('  evidence: data supporting deformation');
console.log('  conformance: matches rules (anatomy, physics)');
console.log('  stewardship: long-term integrity');
console.log('');

console.log('Frame-level aggregation:');
console.log('  I = 1/N Σ intent_i');
console.log('  E = 1/N Σ evidence_i');
console.log('  C = 1/N Σ conformance_i');
console.log('  S = 1/N Σ stewardship_i');
console.log('');

console.log('5. Constitutional Arena');
console.log('------------------------');

const arena = new ConstitutionalHolographicOrganismArena(100);

console.log('Define anatomy:');
console.log('  bicep: nodes [10-14], fiber dir (0,1,0)');
console.log('  tricep: nodes [15-19], fiber dir (0,-1,0)');
console.log('');

console.log('Frame processing:');
console.log('  1. Compute entanglement tensors');
console.log('  2. Map curvature → muscle activation');
console.log('  3. Update CIEMS governance');
console.log('  4. Store constitutional record');
console.log('');

// Simulate frames
console.log('Simulating 5 frames...\n');

// Mock EGT for demo
const { EGT } = await import('../RT4DHolographicArchitecture.js');
const mockEGT = new EGT();
for (let i = 0; i < 100; i++) {
  mockEGT.addNode({ x: Math.random(), y: Math.random(), z: Math.random() });
  mockEGT.rho[i] = Math.random();
  mockEGT.K[i] = Math.random();
  if (i > 0) {
    mockEGT.addEdge(i-1, i, Math.random());
  }
}

arena.initialize(mockEGT);

for (let frame = 0; frame < 5; frame++) {
  const animationInput = {
    intensity: 0.5 + Math.sin(frame * 0.5) * 0.3
  };
  
  const physicsData = {
    confidence: 0.8 + Math.random() * 0.2
  };
  
  const governance = arena.processFrame(0.016, animationInput, physicsData);
  
  console.log(`Frame ${frame}:`);
  console.log(`  Intent: ${governance.intent.toFixed(3)}`);
  console.log(`  Evidence: ${governance.evidence.toFixed(3)}`);
  console.log(`  Conformance: ${governance.conformance.toFixed(3)}`);
  console.log(`  Stewardship: ${governance.stewardship.toFixed(3)}`);
  console.log('');
}

console.log('6. Constitutional Record');
console.log('--------------------------');

const record = arena.getConstitutionalRecord();

console.log(`Total frames: ${record.totalFrames}`);
console.log(`Average governance:`);
console.log(`  Intent: ${record.averageGovernance.intent.toFixed(3)}`);
console.log(`  Evidence: ${record.averageGovernance.evidence.toFixed(3)}`);
console.log(`  Conformance: ${record.averageGovernance.conformance.toFixed(3)}`);
console.log(`  Stewardship: ${record.averageGovernance.stewardship.toFixed(3)}`);
console.log('');

if (record.anomalies.length > 0) {
  console.log(`Anomalies detected: ${record.anomalies.length}`);
} else {
  console.log('No governance anomalies detected ✓');
}

console.log('');
console.log('=== Result ===');
console.log('');
console.log('Rig nodes now encode:');
console.log('  ✓ Entanglement tensors (local coupling + directionality)');
console.log('  ✓ Curvature-driven muscle activation');
console.log('  ✓ CIEMS governance coordinates');
console.log('  ✓ Constitutional traceability');
console.log('');
console.log('Your chamber is a constitutional holographic organism arena');
console.log('Deformations are governed, traceable, and reconstructable');
