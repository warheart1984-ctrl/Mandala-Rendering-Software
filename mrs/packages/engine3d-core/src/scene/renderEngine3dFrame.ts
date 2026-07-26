/**
 * Optional Engine3D frame → RT4D render path (headless receipt).
 *
 * Status: **partial**
 *   - Deterministic null/headless receipt hash: **enforced** (tests)
 *   - Full PathTracer4D from arbitrary bridge meshes: **declared**
 *     (triangle meshes are not RT4D primitives; sphere approximations only)
 *
 * This does NOT replace Genblaze prompt→archetype `render-still.mjs`.
 */

import { hashCanonical } from "./hash.js";
import type { Engine3DBridgeScene, SceneBridgeEvidence } from "./types.js";

export const ENGINE3D_FRAME_RECEIPT_MODE = "null-headless" as const;

export interface Engine3DFrameRenderRequest {
  scene: Engine3DBridgeScene;
  evidence: SceneBridgeEvidence;
  /** Reserved for future path-trace width/height; ignored in headless mode. */
  width?: number;
  height?: number;
  samples?: number;
}

export interface Engine3DFrameRenderReceipt {
  mode: typeof ENGINE3D_FRAME_RECEIPT_MODE;
  schemaVersion: "engine3d-frame-receipt/1.0";
  sceneHash: string;
  evidenceHash: string;
  receiptHash: string;
  primitiveCount: number;
  /** Status label for consumers — not a PNG. */
  imageStatus: "not_rendered_headless";
}

/**
 * Deterministic headless "render" for CI: hashes scene + evidence into a receipt.
 * Does not invoke GPU or PathTracer4D.
 */
export function renderEngine3dFrame(
  request: Engine3DFrameRenderRequest,
): Engine3DFrameRenderReceipt {
  const { scene, evidence } = request;
  const evidenceHash = hashCanonical({
    frameIndex: evidence.frameIndex,
    seed: evidence.seed,
    worldHash: evidence.worldHash,
    primitiveCount: evidence.primitiveCount,
    cameraHash: evidence.cameraHash,
    latticeHash: evidence.latticeHash,
    sceneHash: evidence.sceneHash,
  });
  const receiptBody: Omit<Engine3DFrameRenderReceipt, "receiptHash"> = {
    schemaVersion: "engine3d-frame-receipt/1.0",
    mode: ENGINE3D_FRAME_RECEIPT_MODE,
    sceneHash: evidence.sceneHash,
    evidenceHash,
    primitiveCount: scene.primitives.length,
    imageStatus: "not_rendered_headless",
  };
  return {
    ...receiptBody,
    receiptHash: hashCanonical(receiptBody),
  };
}
