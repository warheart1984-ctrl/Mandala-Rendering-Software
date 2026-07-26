import type { Engine3DWorldDocument, Transform } from "../world/WorldObject.js";

export interface WorldLinkV4 {
  readonly fromWorldId: string;
  readonly toWorldId: string;
  readonly transform: readonly number[];
  readonly visibilityMask: readonly string[];
}

export interface FederationTimelineFrameV4 {
  readonly frameIndex: number;
  readonly worldStates?: Readonly<Record<string, unknown>>;
  readonly cameraState?: unknown;
  readonly lightingState?: unknown;
}

export interface FederationTimelineV4 {
  readonly type: "linear" | "explicit";
  readonly startFrame?: number;
  readonly endFrame?: number;
  readonly frames?: readonly FederationTimelineFrameV4[];
}

export interface FederatedWorldEntryV4 {
  readonly id: string;
  readonly world: Engine3DWorldDocument;
  readonly transform?: Transform;
  readonly visibilityMask?: readonly string[];
}

export interface FederatedWorldV4 {
  readonly id: string;
  readonly schemaVersion: "federated-world/4.0";
  readonly capabilities: {
    readonly sceneBridgeFederation: true;
  };
  readonly worlds: readonly FederatedWorldEntryV4[];
  readonly links: readonly WorldLinkV4[];
  readonly timeline: FederationTimelineV4;
}

export function validateFederatedWorldV4(federation: FederatedWorldV4): string[] {
  const issues: string[] = [];
  if (federation.schemaVersion !== "federated-world/4.0") issues.push("invalid-schema-version");
  if (federation.capabilities.sceneBridgeFederation !== true) issues.push("missing-sceneBridgeFederation-capability");
  if (!federation.worlds.length) issues.push("missing-worlds");
  const worldIds = new Set<string>();
  for (const [index, entry] of federation.worlds.entries()) {
    if (!entry.id) issues.push(`worlds.${index}.missing-id`);
    if (worldIds.has(entry.id)) issues.push(`worlds.${index}.duplicate-id`);
    worldIds.add(entry.id);
    if (entry.world.id !== entry.id) issues.push(`worlds.${index}.world-id-mismatch`);
  }
  for (const [index, link] of federation.links.entries()) {
    if (!worldIds.has(link.fromWorldId)) issues.push(`links.${index}.unknown-fromWorldId`);
    if (!worldIds.has(link.toWorldId)) issues.push(`links.${index}.unknown-toWorldId`);
    if (link.transform.length !== 16 || link.transform.some((value) => !Number.isFinite(value))) issues.push(`links.${index}.invalid-transform`);
  }
  if (federation.timeline.type === "linear") {
    if (federation.timeline.startFrame == null || federation.timeline.endFrame == null) issues.push("timeline.linear-missing-range");
  }
  return issues;
}
