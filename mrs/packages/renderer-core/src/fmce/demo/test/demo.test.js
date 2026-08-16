/**
 * SME e2e demo tests — GEN -> VIS -> TXT -> AUD under FMCE governance.
 * Verifies chain order, authorization, determinism, evidence, and replay.
 */

import { runPipeline } from "../orchestrator.js";
import { generateImage, generateAudio } from "../gen.js";
import { encodeImage } from "../vis.js";
import { reasonText } from "../txt.js";
import { transcribeAudio } from "../aud.js";
import { fuseEmbeddings } from "../fuse.js";

const BASE = { seed: 20260816, intentId: "intent.test.e2e" };

describe("SME e2e demo pipeline", () => {
  test("pipeline runs GEN -> VIS -> TXT -> AUD stages in order", () => {
    const { stages } = runPipeline(BASE);
    expect(stages.map((s) => s.stage)).toEqual([
      "gen_image",
      "gen_audio",
      "vis_encode",
      "txt_reason",
      "aud_transcribe",
    ]);
  });

  test("every stage is authorized with evidence", () => {
    const { stages } = runPipeline(BASE);
    for (const s of stages) {
      expect(s.decision).toBe("authorize");
      expect(s.authorityToken).toMatch(/^auth_/);
      expect(s.evidence.evidenceId).toMatch(/^ev-/);
      expect(s.evidence.checksum).toMatch(/^sha256:/);
      expect(s.v12Result.finalStatus).toBe("PASS");
    }
  });

  test("replay verification passes with deterministic signature", () => {
    const { replayResult, pipelineSignature } = runPipeline(BASE);
    expect(replayResult.verified).toBe(true);
    expect(replayResult.diff).toBeNull();
    expect(replayResult.replayEvidenceId).toMatch(/^ev-replay-/);
    expect(pipelineSignature).toMatch(/^[0-9a-f]{64}$/);
  });

  test("same seed produces identical pipeline signature (determinism)", () => {
    const a = runPipeline(BASE);
    const b = runPipeline(BASE);
    expect(b.pipelineSignature).toBe(a.pipelineSignature);
    expect(b.trace.traceId).toBe(a.trace.traceId);
    expect(JSON.stringify(b.trace)).toBe(JSON.stringify(a.trace));
  });

  test("different seed produces different signature", () => {
    const a = runPipeline(BASE);
    const b = runPipeline({ ...BASE, seed: 424242 });
    expect(b.pipelineSignature).not.toBe(a.pipelineSignature);
  });

  test("artifacts carry dims per SME-SPEC (VIS 512, TXT 768, AUD 256, fused 768)", () => {
    const { prompt, seed, intentId } = BASE;
    const image = generateImage({ prompt, seed, intentId });
    const audio = generateAudio({ text: prompt, seed, intentId });
    const vis = encodeImage(image, { seed, intentId });
    const txt = reasonText({ prompt, embedding: vis.embedding, seed, intentId });
    const aud = transcribeAudio(audio, { seed, intentId, spokenText: txt.text });
    expect(vis.embedding.length).toBe(512);
    expect(txt.embedding.length).toBe(768);
    expect(aud.embedding.length).toBe(256);

    const fused = fuseEmbeddings({ vis: vis.embedding, txt: txt.embedding, aud: aud.embedding });
    expect(fused.embedding.length).toBe(768);

    const norm = Math.sqrt(fused.embedding.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  test("audio transcription yields timecodes and a transcript", () => {
    const { prompt, seed, intentId } = BASE;
    const audio = generateAudio({ text: prompt, seed, intentId });
    const image = generateImage({ prompt, seed, intentId });
    const vis = encodeImage(image, { seed, intentId });
    const txt = reasonText({ prompt, embedding: vis.embedding, seed, intentId });
    const aud = transcribeAudio(audio, { seed, intentId, spokenText: txt.text });
    expect(aud.transcript.length).toBeGreaterThan(0);
    expect(aud.timecodes.length).toBeGreaterThan(0);
    for (const tc of aud.timecodes) {
      expect(tc.start).toBeGreaterThanOrEqual(0);
      expect(tc.end).toBeGreaterThan(tc.start);
      expect(tc.confidence).toBeGreaterThanOrEqual(0);
    }
  });

  test("constitutional trace contains full CIEMS chain (Appendix C shape)", () => {
    const { trace } = runPipeline(BASE);
    const ct = trace.constitutionalTrace;
    for (const key of ["authority", "validation", "decision", "evidence", "fusion", "verification", "replay", "audit"]) {
      expect(ct[key]).toBeDefined();
    }
    expect(ct.authority.granted).toBe(true);
    expect(ct.authority.policyResults.length).toBeGreaterThan(0);
    expect(ct.evidence.bundleId).toMatch(/^bundle-/);
    expect(ct.evidence.artifacts.length).toBe(5);
    expect(ct.verification.replayVerified).toBe(true);
    expect(ct.replay.result).toBe("match");
    expect(ct.audit.immutable).toBe(true);
    expect(ct.evidence.rootHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("evidence artifacts include modelVersion and checksums", () => {
    const { trace } = runPipeline(BASE);
    const artifacts = trace.constitutionalTrace.evidence.artifacts;
    for (const a of artifacts) {
      expect(a.checksum).toMatch(/^sha256:/);
      expect(a.modelVersion).toMatch(/^sme-/);
    }
  });

  test("deterministic modules are bit-identical across runs", () => {
    const { prompt, seed, intentId } = BASE;
    const a = generateImage({ prompt, seed, intentId });
    const b = generateImage({ prompt, seed, intentId });
    expect(b.checksum).toBe(a.checksum);
    expect(Array.from(b.pixels)).toEqual(Array.from(a.pixels));
  });
});
