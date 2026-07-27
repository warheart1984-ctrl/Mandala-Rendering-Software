/**
 * In-process render-farm job splitter (skeleton).
 * Status: **skeleton** — no network protocol; local dispatch only.
 * Spec: ENGINE3D_RENDER_FARM_SPEC / NETWORK_PROTOCOL (declared).
 */

export interface RenderNodeInfo {
  id: string;
  address: string;
  status: "idle" | "busy" | "offline";
  capabilities?: {
    maxResolution: "1080p" | "4K" | "8K";
    gpuCount: number;
  };
}

export interface SequenceJob {
  sequenceId: string;
  frameStart: number;
  frameEnd: number;
}

export class RenderFarmController {
  private nodes: RenderNodeInfo[] = [];
  private jobs: SequenceJob[] = [];

  registerNode(node: RenderNodeInfo): void {
    this.nodes.push({ ...node });
  }

  submitSequence(sequenceId: string, totalFrames: number, chunkSize: number): SequenceJob[] {
    if (totalFrames < 1) throw new Error("totalFrames must be ≥ 1");
    if (chunkSize < 1) throw new Error("chunkSize must be ≥ 1");
    this.jobs = [];
    for (let start = 0; start < totalFrames; start += chunkSize) {
      const end = Math.min(start + chunkSize - 1, totalFrames - 1);
      this.jobs.push({ sequenceId, frameStart: start, frameEnd: end });
    }
    return [...this.jobs];
  }

  listJobs(): SequenceJob[] {
    return [...this.jobs];
  }

  pickIdleNode(): RenderNodeInfo | undefined {
    return this.nodes.find((n) => n.status === "idle");
  }

  /**
   * Sequential local dispatch. Does not claim multi-host determinism.
   */
  async dispatchJobs(
    run: (job: SequenceJob, node: RenderNodeInfo) => Promise<void> | void,
  ): Promise<void> {
    for (const job of this.jobs) {
      const node = this.pickIdleNode();
      if (!node) throw new Error("No idle nodes available");
      node.status = "busy";
      try {
        await run(job, node);
      } finally {
        node.status = "idle";
      }
    }
  }
}
