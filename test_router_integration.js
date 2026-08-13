import { route } from "./sovereign-x/router/index.js";

console.log('Router module loaded OK');

// Test 1: CPU print SoT still works
route('cpu.rt4d.print', {}).then(r => {
  console.log('Test 1 - CPU print:', r.ok, r.backend, r.capabilityClass, r.authority);
});

// Test 2: Unknown capability
route('gpu.unknown.something', {}).then(r => {
  console.log('Test 2 - Unknown cap:', r.ok, r.message);
});

// Test 3: GPU capability with memory telemetry (compute-heavy)
route('gpu.compute.amd.hip', {
  memoryTelemetry: {
    allocationLatencyNs: 5000,
    copyBandwidthGBps: 5.0,
    copyLatencyNs: 50000,
    memoryCapacityBytes: 4 * 1024**3,
    workingSetBytes: 128 * 1024,
    localityScore: 0.2,
    deviceUtilizationPercent: 85,
    queueDepth: 2,
    numaNode: 0
  }
}).then(r => {
  console.log('Test 3 - GPU with telemetry:', r.ok, r.backend, r.workloadClass, r.recommendedPlacement);
});

// Test 4: GPU capability without telemetry (falls back to balanced/balanced)
route('gpu.compute.amd.hip', {}).then(r => {
  console.log('Test 4 - GPU no telemetry:', r.ok, r.backend, r.workloadClass, r.recommendedPlacement);
});

// Test 5: latency-sensitive with data on host
route('gpu.compute.amd.hip', {
  memoryTelemetry: {
    allocationLatencyNs: 1000,
    copyBandwidthGBps: 5.0,
    copyLatencyNs: 5000,
    memoryCapacityBytes: 4 * 1024**3,
    workingSetBytes: 128 * 1024,
    localityScore: 0.8,
    deviceUtilizationPercent: 10,
    queueDepth: 0,
    numaNode: 0
  }
}).then(r => {
  console.log('Test 5 - latency-sensitive:', r.ok, r.backend, r.workloadClass, r.recommendedPlacement);
});

// Test 6: bandwidth-heavy
route('gpu.compute.amd.hip', {
  memoryTelemetry: {
    allocationLatencyNs: 5000,
    copyBandwidthGBps: 50.0,
    copyLatencyNs: 10000,
    memoryCapacityBytes: 4 * 1024**3,
    workingSetBytes: 512 * 1024,
    localityScore: 0.1,
    deviceUtilizationPercent: 30,
    queueDepth: 8,
    numaNode: 0
  }
}).then(r => {
  console.log('Test 6 - bandwidth-heavy:', r.ok, r.backend, r.workloadClass, r.recommendedPlacement);
});

// Test 7: memory-heavy
route('gpu.compute.amd.hip', {
  memoryTelemetry: {
    allocationLatencyNs: 5000,
    copyBandwidthGBps: 5.0,
    copyLatencyNs: 50000,
    memoryCapacityBytes: 4 * 1024**3,
    workingSetBytes: 2 * 1024**3,  // 50% of capacity
    localityScore: 0.1,
    deviceUtilizationPercent: 15,
    queueDepth: 1,
    numaNode: 0
  }
}).then(r => {
  console.log('Test 7 - memory-heavy:', r.ok, r.backend, r.workloadClass, r.recommendedPlacement);
});
