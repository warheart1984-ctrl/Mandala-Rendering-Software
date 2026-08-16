/**
 * SME e2e orchestrator — GEN -> VIS -> TXT -> AUD under FMCE governance.
 * Status: canonical
 *
 * Runs the full multimodal pipeline (image generation -> vision encoding ->
 * text reasoning -> audio synthesis/transcription), routing every modality
 * artifact through the FMCE constitutional chain, then verifies deterministic
 * replay by re-running the deterministic pipeline and comparing checksums.
 */

import { generateImage, generateAudio } from "./gen.js";
import { encodeImage } from "./vis.js";
import { reasonText } from "./txt.js";
import { transcribeAudio } from "./aud.js";
import { fuseEmbeddings } from "./fuse.js";
import { govern, createFMCE, FIXED_TIMESTAMP } from "./govern.js";
import { buildConstitutionalTrace } from "./trace.js";
import { sha256Hex } from "../core/hash.js";

const DEFAULT_SEED = 20260816;

function deterministicStageChecksums({ prompt, seed, intentId, worldId, timelineId, timeSeconds }) {
  const image = generateImage({ prompt, seed, intentId });
  const audio = generateAudio({ text: prompt, seed, intentId });
  const vis = encodeImage(image, { seed, intentId });
  const txt = reasonText({ prompt, embedding: vis.embedding, seed, intentId });
  const aud = transcribeAudio(audio, { seed, intentId, spokenText: txt.text });
  const fused = fuseEmbeddings({ vis: vis.embedding, txt: txt.embedding, aud: aud.embedding });
  const signature = sha256Hex(
    [image.checksum, audio.checksum, vis.checksum, txt.checksum, aud.checksum, fused.checksum]
      .sort()
      .join("|")
  );
  return {
    signature,
    artifacts: [image, audio, vis, txt, aud],
    fused,
  };
}

/**
 * Run the full governed pipeline once.
 */
export function runPipeline(input = {}) {
  const intentId = input.intentId || "intent.sme.e2e";
  const worldId = input.worldId || "world.sme.default";
  const timelineId = input.timelineId || "timeline.sme.session";
  const timeSeconds = input.timeSeconds ?? 0;
  const seed = input.seed ?? DEFAULT_SEED;
  const prompt = input.prompt || "Render a governed mandala with cyan petals and a spoken caption.";
  const actor = input.actor || "user:sme-demo";

  const fmce = createFMCE();

  const first = deterministicStageChecksums({ prompt, seed, intentId, worldId, timelineId, timeSeconds });
  const second = deterministicStageChecksums({ prompt, seed, intentId, worldId, timelineId, timeSeconds });

  const replayVerified = first.signature === second.signature;
  const replayEvidenceId = `ev-replay-${sha256Hex(`${intentId}:${seed}:${first.signature}`).slice(0, 12)}`;

  const artifacts = first.artifacts;
  const [image, audio, vis, txt, aud] = artifacts;

  const stages = [
    govern(fmce, {
      stage: "gen_image",
      modality: "image",
      artifact: image,
      intentId,
      worldId,
      timelineId,
      timeSeconds,
      seed,
      domain: "compute",
    }),
    govern(fmce, {
      stage: "gen_audio",
      modality: "audio",
      artifact: audio,
      intentId,
      worldId,
      timelineId,
      timeSeconds,
      seed,
      domain: "compute",
    }),
    govern(fmce, {
      stage: "vis_encode",
      modality: "image",
      artifact: vis,
      intentId,
      worldId,
      timelineId,
      timeSeconds,
      seed,
      domain: "compute",
    }),
    govern(fmce, {
      stage: "txt_reason",
      modality: "text",
      artifact: txt,
      intentId,
      worldId,
      timelineId,
      timeSeconds,
      seed,
      domain: "compute",
    }),
    govern(fmce, {
      stage: "aud_transcribe",
      modality: "audio",
      artifact: aud,
      intentId,
      worldId,
      timelineId,
      timeSeconds,
      seed,
      domain: "compute",
    }),
  ];

  const fusion = {
    method: first.fused.evidence.method,
    sourceDims: first.fused.evidence.sourceDims,
    fusedDim: first.fused.evidence.fusedDim,
    checksum: first.fused.checksum,
  };

  const replayResult = {
    verified: replayVerified,
    replayEvidenceId,
    invariantChecks: [
      { name: "artifact_checksum_match", passed: replayVerified },
      { name: "fusion_checksum_match", passed: replayVerified },
    ],
    checks: 2,
    diff: replayVerified ? null : "checksum mismatch",
  };

  const trace = buildConstitutionalTrace({
    intentId,
    worldId,
    timelineId,
    actor,
    goal: prompt,
    seed,
    stages,
    artifacts,
    fusion,
    replayResult,
  });

  return {
    trace,
    stages,
    artifacts,
    fusion,
    replayResult,
    fmceContinuity: fmce.getContinuityChain(),
    pipelineSignature: first.signature,
    validatedAt: FIXED_TIMESTAMP,
  };
}
