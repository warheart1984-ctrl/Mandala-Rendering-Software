/**
 * SME-FUSE deterministic fusion simulation.
 * Status: canonical (CPU-bound, seed-reproducible)
 *
 * Fuses VIS_EMBED (512) + TXT_EMBED (768) + AUD_EMBED (256) into a single
 * normalized context vector. Truncation strategy is recorded for evidence.
 */

import { sha256Prefixed, stableStringify } from "../core/hash.js";
import { l2Normalize } from "./embeddings.js";

export const FUSED_DIM = 768;

/**
 * Fuse modality embeddings into a unified context.
 * @returns {object} fused embedding + evidence metadata
 */
export function fuseEmbeddings({ vis, txt, aud }) {
  const visHead = vis.slice(0, 256);
  const audHead = aud.slice(0, 256);
  const txtTail = txt.slice(0, FUSED_DIM - visHead.length - audHead.length);
  const fused = l2Normalize([...visHead, ...txtTail, ...audHead]);

  const fusedEvidence = {
    method: "concat_truncate_normalize",
    sourceDims: { vis: vis.length, txt: txt.length, aud: aud.length },
    fusedDim: fused.length,
    truncation: "vis->256, aud->256, txt->pad",
  };
  return {
    embedding: fused,
    evidence: fusedEvidence,
    checksum: sha256Prefixed(stableStringify({ fused, fusedEvidence })),
  };
}
