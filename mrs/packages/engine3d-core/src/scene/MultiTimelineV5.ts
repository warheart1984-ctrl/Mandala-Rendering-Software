import type { FederatedWorldV4 } from "./FederatedWorldV4.js";

export interface TimelineBranchV5 {
  readonly id: string;
  readonly parentBranchId?: string;
  readonly frameStart: number;
  readonly frameEnd: number;
  readonly seedOffset?: number;
  readonly description?: string;
}

export interface MultiTimelineV5 {
  readonly schemaVersion: "multi-timeline/5.0";
  readonly capabilities: {
    readonly multiTimelineRendering: true;
  };
  readonly branches: readonly TimelineBranchV5[];
}

export interface MultiCameraV5 {
  readonly schemaVersion: "multi-camera/5.1";
  readonly capabilities: {
    readonly multiCameraRendering: true;
  };
  readonly cameraIds: readonly string[];
}

export interface FederatedRenderPlanV5 {
  readonly id: string;
  readonly schemaVersion: "federated-render-plan/5.0";
  readonly federation: FederatedWorldV4;
  readonly timeline: MultiTimelineV5;
  readonly cameras: MultiCameraV5;
}

export function validateMultiTimelineV5(timeline: MultiTimelineV5): string[] {
  const issues: string[] = [];
  if (timeline.schemaVersion !== "multi-timeline/5.0") issues.push("invalid-timeline-schema-version");
  if (timeline.capabilities.multiTimelineRendering !== true) issues.push("missing-multiTimelineRendering-capability");
  if (!timeline.branches.length) issues.push("missing-timeline-branches");
  const ids = new Set<string>();
  for (const [index, branch] of timeline.branches.entries()) {
    if (!branch.id) issues.push(`branches.${index}.missing-id`);
    if (ids.has(branch.id)) issues.push(`branches.${index}.duplicate-id`);
    ids.add(branch.id);
    if (!Number.isInteger(branch.frameStart) || !Number.isInteger(branch.frameEnd) || branch.frameEnd < branch.frameStart) {
      issues.push(`branches.${index}.invalid-frame-range`);
    }
    if (branch.seedOffset != null && !Number.isInteger(branch.seedOffset)) issues.push(`branches.${index}.invalid-seedOffset`);
  }
  for (const [index, branch] of timeline.branches.entries()) {
    if (branch.parentBranchId && !ids.has(branch.parentBranchId)) issues.push(`branches.${index}.unknown-parentBranchId`);
  }
  return issues;
}

export function validateMultiCameraV5(cameras: MultiCameraV5): string[] {
  const issues: string[] = [];
  if (cameras.schemaVersion !== "multi-camera/5.1") issues.push("invalid-camera-schema-version");
  if (cameras.capabilities.multiCameraRendering !== true) issues.push("missing-multiCameraRendering-capability");
  if (!cameras.cameraIds.length) issues.push("missing-camera-ids");
  const ids = new Set<string>();
  for (const [index, cameraId] of cameras.cameraIds.entries()) {
    if (!cameraId) issues.push(`cameraIds.${index}.missing-id`);
    if (ids.has(cameraId)) issues.push(`cameraIds.${index}.duplicate-id`);
    ids.add(cameraId);
  }
  return issues;
}

export function validateFederatedRenderPlanV5(plan: FederatedRenderPlanV5): string[] {
  const issues: string[] = [];
  if (plan.schemaVersion !== "federated-render-plan/5.0") issues.push("invalid-plan-schema-version");
  issues.push(...validateMultiTimelineV5(plan.timeline));
  issues.push(...validateMultiCameraV5(plan.cameras));
  const availableCameraIds = new Set(plan.federation.worlds.flatMap((entry) => entry.world.cameras.map((camera) => camera.id)));
  for (const [index, cameraId] of plan.cameras.cameraIds.entries()) {
    if (!availableCameraIds.has(cameraId)) issues.push(`cameraIds.${index}.unknown-camera`);
  }
  return issues;
}
