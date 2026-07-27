/**
 * Declared memory budgets for high-resolution targets.
 * Status: **skeleton** — validation helper only; not a runtime allocator.
 */

export interface MemoryBudget {
  maxFrameBytes: number;
  maxGeometryBytes: number;
  maxTextureBytes: number;
}

export class MemoryModel8k {
  static forPreview(width: number, height: number): MemoryBudget {
    return {
      maxFrameBytes: width * height * 4,
      maxGeometryBytes: 64 * 1024 * 1024,
      maxTextureBytes: 128 * 1024 * 1024,
    };
  }

  /** Constitutional 8K RGBA frame ceiling (declared target). */
  static for8k(): MemoryBudget {
    return {
      maxFrameBytes: 7680 * 4320 * 4,
      maxGeometryBytes: 512 * 1024 * 1024,
      maxTextureBytes: 1024 * 1024 * 1024,
    };
  }

  static for4k(): MemoryBudget {
    return {
      maxFrameBytes: 3840 * 2160 * 4,
      maxGeometryBytes: 256 * 1024 * 1024,
      maxTextureBytes: 512 * 1024 * 1024,
    };
  }

  static validateFrame(bytesUsed: number, budget: MemoryBudget): void {
    if (bytesUsed > budget.maxFrameBytes) {
      throw new Error(
        `Frame memory exceeded: ${bytesUsed} > ${budget.maxFrameBytes}`,
      );
    }
  }
}
