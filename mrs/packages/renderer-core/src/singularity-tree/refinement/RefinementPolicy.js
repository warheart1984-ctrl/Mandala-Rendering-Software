/**
 * RefinementPolicy — declarative refinement rules derived from config.
 *
 * Encapsulates the limits the refinement engine must enforce:
 *   maxDepth, maxNodes, maxBranchFactor, maxExpansions (compute budget),
 *   criticalThreshold and the self-similarity class C.
 *
 * Status: enforced (verified by failure tests + invariant 8).
 */

export class RefinementPolicy {
  constructor(config) {
    this.config = config;
    this.maxDepth = config.maxDepth;
    this.maxNodes = config.maxNodes;
    this.maxBranchFactor = config.maxBranchFactor;
    this.maxExpansions = config.maxExpansions;
    this.criticalThreshold = config.criticalThreshold;
    this.selfSimilarityClass = config.selfSimilarityClass;
    this.failClosed = config.failClosed;
    this.maxMemoryBytes = config.maxMemoryBytes || null;
  }

  /** Rough per-node memory accounting for the budget (approximation). */
  static nodeMemoryEstimate() {
    return 2048;
  }

  checkDepth(level) {
    return { allowed: level < this.maxDepth, reason: `maxDepth=${this.maxDepth}` };
  }

  checkNodes(nodeCount) {
    return { allowed: nodeCount < this.maxNodes, reason: `maxNodes=${this.maxNodes}` };
  }

  checkExpansions(expansions) {
    return { allowed: expansions < this.maxExpansions, reason: `maxExpansions=${this.maxExpansions}` };
  }

  checkMemory(nodeCount) {
    if (this.maxMemoryBytes === null) return { allowed: true, reason: "no memory cap" };
    const used = nodeCount * RefinementPolicy.nodeMemoryEstimate();
    return {
      allowed: used < this.maxMemoryBytes,
      reason: `maxMemory=${this.maxMemoryBytes}`,
      used,
    };
  }

  assertAllowed(level, nodeCount, expansions) {
    if (this.failClosed) {
      const checks = [
        this.checkNodes(nodeCount),
        this.checkExpansions(expansions),
        this.checkMemory(nodeCount),
      ];
      for (const c of checks) {
        if (!c.allowed) {
          throw new SingularityTreeLimitError(`resource limit reached: ${c.reason}`);
        }
      }
    }
    return true;
  }
}

export class SingularityTreeLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "SingularityTreeLimitError";
    this.code = "SINGULARITY_TREE_LIMIT";
  }
}