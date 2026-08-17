import { BVHTree, PrimitiveRef, Provenance } from "./bvh-spec.ts";
import { Ray, RaysPacket, RayResult, PacketResult } from "./bvh-traversal-simd.ts";

export interface BVHSplitDecisionRecord {
  nodeIndex: number;
  axis: 0 | 1 | 2;
  position: number;
  cost: number;
  chosen: boolean;
}

export interface BuildEvidence {
  provenance: Provenance;
  config: unknown;
  splits: BVHSplitDecisionRecord[];
}

export interface TraversalNodeVisit {
  nodeIndex: number;
  mask?: number;
}

export interface TraversalEvidence {
  provenance: Provenance;
  rayCount: number;
  nodeVisits: TraversalNodeVisit[];
}

export function recordBuildStart(primitives: PrimitiveRef[], config: unknown, provenance: Provenance): BuildEvidence {
  return { provenance, config, splits: [] };
}

export function recordSplitDecision(evidence: BuildEvidence, split: BVHSplitDecisionRecord): void {
  evidence.splits.push(split);
}

export function recordBuildEnd(evidence: BuildEvidence, tree: BVHTree): void {}

export function recordTraversalStart(rays: Ray | RaysPacket, tree: BVHTree): TraversalEvidence {
  const rayCount = Array.isArray((rays as RaysPacket).rays) ? (rays as RaysPacket).rays.length : 1;
  return { provenance: tree.provenance, rayCount, nodeVisits: [] };
}

export function recordNodeVisit(evidence: TraversalEvidence, visit: TraversalNodeVisit): void {
  evidence.nodeVisits.push(visit);
}

export function recordTraversalEnd(evidence: TraversalEvidence, result: RayResult | PacketResult): void {}
