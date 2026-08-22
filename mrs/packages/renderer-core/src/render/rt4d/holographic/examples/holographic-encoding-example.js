/**
 * Holographic 4D → 3D Encoding Example
 * 
 * Demonstrates the mapping:
 * 4D Spacetime Bulk → 3D Boundary Encoding
 * 
 * Using Minkowski metric: ds² = -c²dt² + dx² + dy² + dz²
 */

import { HolographicEncoder } from '../HolographicEncoder.js';

console.log('=== Holographic 4D → 3D Encoding ===\n');

// Create encoder
const encoder = new HolographicEncoder({ c: 1.0 });

// Example 4D spacetime points (bulk)
const bulkPoints = [
  { x: 1.0, y: 0.0, z: 0.0, w: 0.5 },  // Timelike separation
  { x: 2.0, y: 1.0, z: 0.5, w: 1.0 },  // Spacelike separation
  { x: 0.5, y: 0.5, z: 0.5, w: 0.0 },  // Null-like
  { x: 3.0, y: 2.0, z: 1.0, w: 2.0 }   // General case
];

console.log('Bulk Points (4D Spacetime):');
bulkPoints.forEach((p, i) => {
  console.log(`  ${i+1}. (${p.x}, ${p.y}, ${p.z}, ${p.w})`);
});

console.log('\n--- Holographic Encoding ---\n');

const holographicScreen = encoder.createHolographicScreen(bulkPoints);

holographicScreen.forEach((encoding, i) => {
  console.log(`Point ${i+1}:`);
  console.log(`  Bulk:     (${encoding.bulk.x}, ${encoding.bulk.y}, ${encoding.bulk.z}, ${encoding.bulk.w})`);
  console.log(`  Boundary: (${encoding.boundary.x}, ${encoding.boundary.y}, ${encoding.boundary.z})`);
  console.log(`  Entropy:  ${encoding.information.entropy.toFixed(4)}`);
  console.log(`  Causal:   ${encoding.information.causalWeight.toFixed(4)}`);
  console.log('');
});

// Demonstrate reconstruction
console.log('--- Holographic Reconstruction ---\n');

holographicScreen.forEach((encoding, i) => {
  const boundaryData = {
    boundaryPoint: encoding.boundary,
    entanglementEntropy: encoding.entanglementEntropy,
    causalCorrelation: encoding.causalCorrelation,
    timeCoordinate: encoding.timeCoordinate
  };
  const reconstructed = encoder.reconstructBulkFromBoundary(boundaryData);
  
  console.log(`Point ${i+1} Reconstruction:`);
  console.log(`  Original:     (${encoding.bulk.x}, ${encoding.bulk.y}, ${encoding.bulk.z}, ${encoding.bulk.w})`);
  console.log(`  Reconstructed: (${reconstructed.bulkPoint.x}, ${reconstructed.bulkPoint.y}, ${reconstructed.bulkPoint.z}, ${reconstructed.bulkPoint.w.toFixed(4)})`);
  console.log(`  Error: ${reconstructed.reconstructionError.toFixed(6)}`);
  console.log(`  Consistent: ${reconstructed.isConsistent}`);
  console.log('');
});

console.log('=== Key Insights ===\n');
console.log('✓ 4D bulk geometry encoded as 3D boundary information');
console.log('✓ Time encoded as entanglement entropy (not coordinate)');
console.log('✓ Causal structure preserved as correlation functions');
console.log('✓ Bulk can be reconstructed from boundary');
console.log('✓ Holographic duality implemented');
