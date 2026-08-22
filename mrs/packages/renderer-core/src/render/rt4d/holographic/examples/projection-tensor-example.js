/**
 * Projection Tensor Example
 * 
 * Demonstrates 4D → 3D projection using h_μν = g_μν + n_μ n_ν
 */

import { createStaticProjectionTensor, createMovingProjectionTensor } from '../ProjectionTensor.js';

console.log('=== 4D → 3D Projection Tensor ===\n');

console.log('Mathematical Framework:');
console.log('  Metric: ds² = g_μν dx^μ dx^ν');
console.log('  g_μν = diag(-c², 1, 1, 1)');
console.log('  Projection tensor: h_μν = g_μν + n_μ n_ν');
console.log('  Projection: V_proj^μ = h^ν_μ V_ν\n');

// Create static projection tensor
const staticProj = createStaticProjectionTensor(1.0);

console.log('1. Static Observer Projection');
console.log('------------------------------');
console.log('Normal: n^μ = (1, 0, 0, 0)');
console.log('Normal: n_μ = (-1, 0, 0, 0)\n');

const operatorSummary = staticProj.createOperatorSummary();
console.log('Projection Tensor h_μν:');
console.log(JSON.stringify(operatorSummary.projectionTensor, null, 2));

console.log('\nInduced 3D Metric:');
console.log(JSON.stringify(operatorSummary.inducedMetric, null, 2));

// Test projections
const testVectors = [
  { t: 5.0, x: 1.0, y: 2.0, z: 3.0 },
  { w: 2.0, x: 10.0, y: 20.0, z: 30.0 },
  { t: -3.0, x: 0.5, y: -1.5, z: 2.5 }
];

console.log('\n2. Vector Projections');
console.log('--------------------');

testVectors.forEach((vec, i) => {
  const result = staticProj.projectVector(vec);
  
  console.log(`\nVector ${i+1}:`);
  console.log(`  Input:  (t=${vec.t || vec.w}, x=${vec.x}, y=${vec.y}, z=${vec.z})`);
  console.log(`  Output: (x=${result.projected.x}, y=${result.projected.y}, z=${result.projected.z})`);
  console.log(`  Time killed: ${vec.t || vec.w} → 0 (preserved in normal direction)`);
});

console.log('\n3. Moving Observer Projection');
console.log('------------------------------');

// Create moving observer
const movingProj = createMovingProjectionTensor(
  { x: 0.6, y: 0, z: 0 },
  1.0
);

console.log('Observer velocity: v = 0.6c');
console.log(`Gamma: ${movingProj.normal.gamma.toFixed(4)}\n`);

testVectors.forEach((vec, i) => {
  const result = movingProj.projectVector(vec);
  
  console.log(`Vector ${i+1}:`);
  console.log(`  Input:  (t=${vec.t || vec.w}, x=${vec.x}, y=${vec.y}, z=${vec.z})`);
  console.log(`  Output: (x=${result.projected.x.toFixed(4)}, y=${result.projected.y.toFixed(4)}, z=${result.projected.z.toFixed(4)})`);
});

console.log('\n4. Field Projection');
console.log('------------------');

const field4D = [
  { t: 1, x: 1, y: 0, z: 0 },
  { t: 2, x: 2, y: 1, z: 0 },
  { t: 3, x: 3, y: 2, z: 1 },
  { t: 4, x: 4, y: 3, z: 2 }
];

const fieldResult = staticProj.projectField(field4D);

console.log(`Projected ${field4D.length} points:`);
fieldResult.boundaryField.forEach((pt, i) => {
  console.log(`  ${i+1}. 4D: (${field4D[i].t},${field4D[i].x},${field4D[i].y},${field4D[i].z}) → 3D: (${pt.x},${pt.y},${pt.z})`);
});

console.log('\nInduced Metric Properties:');
console.log(`  Determinant: ${fieldResult.inducedMetric.determinant}`);
console.log(`  Is Flat: ${fieldResult.inducedMetric.isFlat}`);

console.log('\n=== Key Insights ===\n');
console.log('✓ Projection derived from spacetime structure');
console.log('✓ Time component killed by projection tensor');
console.log('✓ 3D metric induced from 4D via h_ij = g_ij - g0i g0j / g00');
console.log('✓ For static observer: h_ij = δ_ij (flat space)');
console.log('✓ Moving observer introduces Lorentz transformation');
console.log('✓ Causal structure preserved in induced metric');
