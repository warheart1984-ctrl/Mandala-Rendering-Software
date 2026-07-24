/**
 * Multi-GPU arbitration — Phase C **declared** stub (Drive-G-1).
 * Always returns strategy "single". No live multi-device execution.
 */
export class MultiGpuArbitrator {
  constructor(rhi = null) {
    this.rhi = rhi;
  }

  async decideDevices(rhi, requestedCount) {
    void rhi;
    void requestedCount;
    return { frameId: "", selectedDevices: [], strategy: "single" };
  }

  async planFrame(frameId, requestedCount, hints = {}) {
    void requestedCount;
    return {
      frameId: frameId ?? "",
      selectedDevices: [],
      strategy: "single",
      hints,
    };
  }

  async recordDecision(decision) {
    void decision;
  }
}
