// mrs/mcp/conformance-profile.js

export class ConformanceProfile {
  constructor() {
    this.version = '1.0.0';
    this.checks = [
      // Runtime
      'runtime.nodeVersion',
      'runtime.wasmSupport',
      'runtime.memoryLimit',
      // Environment
      'environment.gpuAvailable',
      'environment.cpuCores',
      'environment.llamaCppBinding',
      'environment.whisperCppBinding',
      'environment.onnxBinding',
      // Browser
      'browser.browserAdapter',
      // Lattice
      'lattice.nodeIdentityValid',
      'lattice.spineReady',
      'lattice.dependencyMapConsistent',
      // Security
      'security.noForbiddenSyscalls',
      'security.noUngovernedFileAccess',
      'security.noUngovernedNetworkAccess',
      // Constitutional
      'constitutional.cklConformant',
      'constitutional.contractsConformant',
      'constitutional.replayable',
      'constitutional.evidenceAvailable',
    ];
  }

  getCheckNames() {
    return this.checks;
  }
}