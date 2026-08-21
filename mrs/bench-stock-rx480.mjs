/**
 * RX 480 Stock Behavior Benchmark
 * Tests baseline performance WITHOUT optimizations:
 * - No forced P-states (stock dynamic clocks)
 * - No persistent command buffers
 * - No bindless descriptors
 * - No async compute
 * - No timeline semaphores
 * - Standard Mesa scheduling
 */

import { createVulkanRhi } from './packages/renderer-core/src/render/rhi/VulkanRhi.js';

console.log('=== RX 480 Stock Behavior Benchmark ===\n');
console.log('Testing WITHOUT optimizations:');
console.log('  ✗ No forced P-states (dynamic clocks)');
console.log('  ✗ No persistent command buffers');
console.log('  ✗ No bindless descriptors');
console.log('  ✗ No async compute');
console.log('  ✗ No timeline semaphores');
console.log('  ✗ Standard Mesa scheduling\n');

const rhi = createVulkanRhi({
  width: 1920,
  height: 1080,
  enableAsyncCompute: false,
  enableBindless: false,
  enableTimelineSemaphores: false,
  maxFramesInFlight: 1, // Single buffer, no reuse
});

async function benchmark() {
  // 1. Device info
  console.log('1. Device Information');
  console.log('─'.repeat(60));
  const devices = await rhi.getDevices();
  await rhi.selectDevice(0);
  const info = rhi.getDeviceInfo();
  
  console.log(`GPU: ${info.deviceName}`);
  console.log(`VRAM: ${(info.vramSize / 1024 / 1024 / 1024).toFixed(1)} GB`);
  console.log(`API Version: ${info.apiVersion}`);
  console.log(`Has async compute: ${info.hasAsyncCompute} (NOT USED)`);
  console.log(`Has bindless: ${info.hasBindless} (NOT USED)`);
  console.log(`Has timeline semaphores: ${info.hasTimelineSemaphores} (NOT USED)\n`);

  // 2. Small kernel benchmark
  console.log('2. Small Workgroup Kernel Benchmark');
  console.log('─'.repeat(60));
  
  const smallKernel = `
    @group(0) @binding(0) var<storage, read_write> data: array<f32>;
    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
      let i = gid.x;
      if (i < arrayLength(&data)) {
        data[i] = f32(i) * 2.0;
      }
    }
  `;
  
  const buffer = await rhi.createBuffer({
    size: 1024 * 1024, // 1MB
    usage: 'storage',
    label: 'small-kernel-buffer',
  });
  
  const shader = await rhi.createShaderModule({
    code: { wgsl: smallKernel },
    label: 'small-kernel',
  });
  
  const pipeline = await rhi.createComputePipeline({
    label: 'small-pipeline',
    shaderModuleId: shader.id,
    workgroupSize: 64,
  });
  
  // Warmup
  await rhi.dispatchKernel({
    pipelineId: pipeline.id,
    workgroupCount: [16, 1, 1],
    bindings: { 0: buffer.id },
  });
  
  // Benchmark small
  const iterations = 100;
  const smallTimes = [];
  
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await rhi.dispatchKernel({
      pipelineId: pipeline.id,
      workgroupCount: [16, 1, 1], // 1024 threads
      bindings: { 0: buffer.id },
    });
    const t1 = performance.now();
    smallTimes.push(t1 - t0);
  }
  
  const smallAvg = smallTimes.reduce((a, b) => a + b, 0) / iterations;
  const smallMin = Math.min(...smallTimes);
  const smallMax = Math.max(...smallTimes);
  
  console.log(`Workgroups: 16 x 1 x 1 (1024 threads)`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Avg dispatch: ${smallAvg.toFixed(2)} ms`);
  console.log(`Min dispatch: ${smallMin.toFixed(2)} ms`);
  console.log(`Max dispatch: ${smallMax.toFixed(2)} ms`);
  console.log(`Std dev: ${Math.sqrt(smallTimes.reduce((a, b) => a + Math.pow(b - smallAvg, 2), 0) / iterations).toFixed(2)} ms\n`);

  // 3. Medium kernel benchmark
  console.log('3. Medium Workload Benchmark');
  console.log('─'.repeat(60));
  
  const mediumKernel = `
    @group(0) @binding(0) var<storage, read_write> data: array<f32>;
    @compute @workgroup_size(256)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
      let i = gid.x;
      var sum = 0.0;
      for (var j = 0u; j < 64u; j++) {
        sum += f32((i + j) % 256u);
      }
      if (i < arrayLength(&data)) {
        data[i] = sum;
      }
    }
  `;
  
  const mediumBuffer = await rhi.createBuffer({
    size: 4 * 1024 * 1024, // 4MB
    usage: 'storage',
    label: 'medium-kernel-buffer',
  });
  
  const mediumShader = await rhi.createShaderModule({
    code: { wgsl: mediumKernel },
    label: 'medium-kernel',
  });
  
  const mediumPipeline = await rhi.createComputePipeline({
    label: 'medium-pipeline',
    shaderModuleId: mediumShader.id,
    workgroupSize: 256,
  });
  
  const mediumTimes = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await rhi.dispatchKernel({
      pipelineId: mediumPipeline.id,
      workgroupCount: [64, 1, 1], // 16,384 threads
      bindings: { 0: mediumBuffer.id },
    });
    const t1 = performance.now();
    mediumTimes.push(t1 - t0);
  }
  
  const mediumAvg = mediumTimes.reduce((a, b) => a + b, 0) / iterations;
  const mediumMin = Math.min(...mediumTimes);
  const mediumMax = Math.max(...mediumTimes);
  
  console.log(`Workgroups: 64 x 1 x 1 (16,384 threads)`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Avg dispatch: ${mediumAvg.toFixed(2)} ms`);
  console.log(`Min dispatch: ${mediumMin.toFixed(2)} ms`);
  console.log(`Max dispatch: ${mediumMax.toFixed(2)} ms`);
  console.log(`Std dev: ${Math.sqrt(mediumTimes.reduce((a, b) => a + Math.pow(b - mediumAvg, 2), 0) / iterations).toFixed(2)} ms\n`);

  // 4. Heavy kernel benchmark
  console.log('4. Heavy Compute Shader Benchmark');
  console.log('─'.repeat(60));
  
  const heavyKernel = `
    @group(0) @binding(0) var<storage, read_write> data: array<f32>;
    @compute @workgroup_size(256)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
      let i = gid.x;
      var acc = 0.0;
      for (var j = 0u; j < 1024u; j++) {
        let x = f32((i * 123 + j * 456) & 0xFFFFu);
        acc += sin(x * 0.001);
        acc += cos(x * 0.002);
        acc += sqrt(x * 0.0001 + 1.0);
      }
      if (i < arrayLength(&data)) {
        data[i] = acc;
      }
    }
  `;
  
  const heavyBuffer = await rhi.createBuffer({
    size: 16 * 1024 * 1024, // 16MB
    usage: 'storage',
    label: 'heavy-kernel-buffer',
  });
  
  const heavyShader = await rhi.createShaderModule({
    code: { wgsl: heavyKernel },
    label: 'heavy-kernel',
  });
  
  const heavyPipeline = await rhi.createComputePipeline({
    label: 'heavy-pipeline',
    shaderModuleId: heavyShader.id,
    workgroupSize: 256,
  });
  
  const heavyTimes = [];
  const heavyIterations = 50; // Fewer iterations due to longer runtime
  
  for (let i = 0; i < heavyIterations; i++) {
    const t0 = performance.now();
    await rhi.dispatchKernel({
      pipelineId: heavyPipeline.id,
      workgroupCount: [128, 1, 1], // 32,768 threads
      bindings: { 0: heavyBuffer.id },
    });
    const t1 = performance.now();
    heavyTimes.push(t1 - t0);
  }
  
  const heavyAvg = heavyTimes.reduce((a, b) => a + b, 0) / heavyIterations;
  const heavyMin = Math.min(...heavyTimes);
  const heavyMax = Math.max(...heavyTimes);
  
  console.log(`Workgroups: 128 x 1 x 1 (32,768 threads)`);
  console.log(`Iterations: ${heavyIterations}`);
  console.log(`Avg dispatch: ${heavyAvg.toFixed(2)} ms`);
  console.log(`Min dispatch: ${heavyMin.toFixed(2)} ms`);
  console.log(`Max dispatch: ${heavyMax.toFixed(2)} ms`);
  console.log(`Std dev: ${Math.sqrt(heavyTimes.reduce((a, b) => a + Math.pow(b - heavyAvg, 2), 0) / heavyIterations).toFixed(2)} ms\n`);

  // 5. Memory bandwidth test
  console.log('5. Memory Bandwidth Estimation');
  console.log('─'.repeat(60));
  
  const bandwidthKernel = `
    @group(0) @binding(0) var<storage, read> src: array<f32>;
    @group(0) @binding(1) var<storage, read_write> dst: array<f32>;
    @compute @workgroup_size(256)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
      let i = gid.x;
      if (i < arrayLength(&src)) {
        dst[i] = src[i] * 2.0 + 1.0;
      }
    }
  `;
  
  const bwSize = 256 * 1024 * 1024; // 256MB
  const bwBuffer1 = await rhi.createBuffer({
    size: bwSize,
    usage: 'storage',
    label: 'bw-src',
  });
  
  const bwBuffer2 = await rhi.createBuffer({
    size: bwSize,
    usage: 'storage',
    label: 'bw-dst',
  });
  
  const bwShader = await rhi.createShaderModule({
    code: { wgsl: bandwidthKernel },
    label: 'bandwidth-kernel',
  });
  
  const bwPipeline = await rhi.createComputePipeline({
    label: 'bandwidth-pipeline',
    shaderModuleId: bwShader.id,
    workgroupSize: 256,
  });
  
  // Upload test data
  const testData = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) testData[i] = i * 1.5;
  await rhi.uploadBuffer(bwBuffer1.id, testData.buffer, 0);
  
  const bwTimes = [];
  const bwIterations = 20;
  
  for (let i = 0; i < bwIterations; i++) {
    const t0 = performance.now();
    await rhi.dispatchKernel({
      pipelineId: bwPipeline.id,
      workgroupCount: [1024, 1, 1], // 262,144 threads
      bindings: { 0: bwBuffer1.id, 1: bwBuffer2.id },
    });
    const t1 = performance.now();
    bwTimes.push(t1 - t0);
  }
  
  const bwAvg = bwTimes.reduce((a, b) => a + b, 0) / bwIterations;
  const bytesProcessed = bwSize * 2; // Read + write
  const bandwidthGBps = (bytesProcessed / 1024 / 1024 / 1024) / (bwAvg / 1000);
  
  console.log(`Data size: ${(bwSize / 1024 / 1024).toFixed(0)} MB (read + write)`);
  console.log(`Iterations: ${bwIterations}`);
  console.log(`Avg time: ${bwAvg.toFixed(2)} ms`);
  console.log(`Estimated bandwidth: ${bandwidthGBps.toFixed(2)} GB/s\n`);

  // 6. Summary
  console.log('═'.repeat(60));
  console.log('STOCK BEHAVIOR SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Small kernel (1K threads):     ${smallAvg.toFixed(2)} ms`);
  console.log(`Medium kernel (16K threads):   ${mediumAvg.toFixed(2)} ms`);
  console.log(`Heavy kernel (32K threads):    ${heavyAvg.toFixed(2)} ms`);
  console.log(`Memory bandwidth:              ${bandwidthGBps.toFixed(2)} GB/s`);
  console.log('');
  console.log('Comparison to your optimized results:');
  console.log(`Optimized dispatch: 2.85 ms (with all 7 levers)`);
  console.log(`Stock dispatch:     ${smallAvg.toFixed(2)} ms (no optimizations)`);
  console.log(`Speedup:            ${(smallAvg / 2.85).toFixed(1)}x`);
  console.log('');
  console.log('Expected RX 480 stock range:');
  console.log(`  Small: 6-12 ms  | Your result: ${smallAvg.toFixed(2)} ms`);
  console.log(`  Medium: 15-25 ms | Your result: ${mediumAvg.toFixed(2)} ms`);
  console.log(`  Heavy: 30-50 ms | Your result: ${heavyAvg.toFixed(2)} ms`);
  console.log('');
  console.log('Stock behavior benchmark complete!');
}

benchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
