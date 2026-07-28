/**
 * ReplayService — re-drive a target from recorded provenance frames.
 */

import { hashFrameProvenance } from "./ProvenanceRecorder.js";

export class ReplayService {
  static replay(frames, target) {
    if (!frames || !target?.applyFrame) return;
    for (const frame of frames) {
      target.applyFrame(frame);
    }
  }

  /**
   * Lightweight lineage receipt for a replay run (Drive-G-1: enforced fields only).
   * Does not claim full CECP/CHEA certification.
   */
  static createLineageReceipt(frames, options = {}) {
    const list = Array.isArray(frames) ? frames : [];
    const frameHashes = list.map((f) => f?.provenanceHash || hashFrameProvenance(f));
    const worldIds = [...new Set(list.map((f) => f?.worldId).filter((v) => v != null))];
    const timelineIds = [...new Set(list.map((f) => f?.timelineId).filter((v) => v != null))];
    return {
      kind: "replay-lineage-receipt",
      version: 1,
      frameCount: list.length,
      frameHashes,
      worldIds,
      timelineIds,
      targetId: options.targetId ?? null,
      intentId: options.intentId ?? list[0]?.intentId ?? null,
      evidenceRefs: options.evidenceRefs ?? [],
    };
  }

  static replayWithReceipt(frames, target, options = {}) {
    ReplayService.replay(frames, target);
    return ReplayService.createLineageReceipt(frames, options);
  }
}
