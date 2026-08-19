export type IntentId = string;

export interface Provenance {
  intentId: IntentId;
  createdAt: string;
  version: string;
}

export interface AABB {
  min: [number, number, number];
  max: [number, number, number];
}

export interface PrimitiveRef {
  id: string;
  meshId: string;
  indexOffset: number;
  aabb: AABB;
  assetProvenanceId?: string;
}

export type NodeIndex = number;

export interface BVHNode {
  bounds: AABB;
  children: NodeIndex[];
  primitiveRange?: { start: number; count: number };
  isLeaf: boolean;
  level: number;
}

export interface BVHTree {
  nodes: BVHNode[];
  rootIndex: NodeIndex;
  provenance: Provenance;
  configHash: string;
}
