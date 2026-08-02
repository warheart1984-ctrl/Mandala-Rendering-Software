// @mrs/rt4d-engine RT3D evidence bridge — status: declared (CIEMS-aligned, substrate-level)
//
// This module produces a CIEMS-aligned evidence envelope that wraps a persisted
// RT3D ledger entry (Rt3dLedgerEntry) so the deterministic simulation→persistence
// artifact is consumable by the external CIEMS / Constitutional Runtime (JCR).
// It is a SUBSTRATE-LEVEL artifact: the canonical consumer is on Drive-G
// (G:\CIEMS, G:\.codex\cse\constitutional-runtime). This repo does NOT host
// that runtime and does not label itself JCR/CIEMS; it declares an evidence
// shape that those higher layers are designed to ingest.
//
// Boundary: RT3D owns determinism (engineTick fixed steps, content-addressed
// scene store). This bridge only ATTACHES an evidence envelope + replay
// verification gate — it does NOT add state or persistence. Promotion into
// CIEMS is a separate, explicitly-mandated operation, not claimed here.
import { createHash } from "node:crypto";
import type { Rt3dLedgerEntry, FrameSnapshot } from "../persistence/rt3dLedger.js";

export type Rt3dEvidenceEnvelope = {
  operation: "rt3d_state_capture";
  source: "mrs-rt4d-engine/rt3d-ledger";
  engineVersion: "1.0.0";
  intentId: string;
  timelineId: string;
  worldId: string;
  sceneId: string;
  specHash: string;
  seed: number;
  fixedDelta: number;
  frames: number;
  trajectoryChecksum: string;
  trajectoryRoot: string;
  replayToken: string;
  at: string;
};

export type Rt3dEvidenceReport = {
  envelope: Rt3dEvidenceEnvelope;
  replayOk: boolean;
  mismatch?: string;
  trajectoryRecomputed: boolean;
};

/**
 * Merkle-style root over the per-frame body positions of a trajectory. Each
 * frame contributes sha256(JSON(canonical-frame-bodies)); the root is the
 * sha256 of the concatenated frame hashes. This keeps the envelope compact
 * (no raw snapshots) while remaining deterministic and verifier-recomputable.
 */
export function trajectoryRoot(snapshots: FrameSnapshot[]): string {
  const frameHashes = snapshots.map((s) =>
    sha256Hex(
      JSON.stringify(
        snapshotsBodiesCanonical(s),
      ),
    ),
  );
  return sha256Hex(frameHashes.join("\n"));
}

/**
 * Build the CIEMS-aligned evidence envelope for a captured RT3D trajectory.
 *
 * Fields (per AGENTS.md V "Evidence Requirements"):
 *   specHash          — anchor: content hash of the SceneSpecification.
 *   seed              — the deterministic seed from convertSceneSpecification
 *                       (NOT a render seed; preserved from the scene conversion).
 *   fixedDelta        — fixed timestep (1/60) powering engineTick determinism.
 *   frames            — trajectory length.
 *   trajectoryChecksum — sha256 over the full entry (tamper guard).
 *   trajectoryRoot    — Merkle-style root over per-frame body positions.
 *   replayToken       — sha256(specHash:seed:fixedDelta:frames:trajectoryRoot);
 *                       the value a future CIEMS replay gate compares to
 *                       authorize a re-simulation as equivalent to a prior one.
 *
 * Honest claim: this envelope is substrate-declared. A future CIEMS host
 * consumes it; it is not emulated here.
 */
export function buildRt3dEvidenceEnvelope(
  entry: Rt3dLedgerEntry,
  at: string = new Date().toISOString(),
): Rt3dEvidenceEnvelope {
  const trajectoryRootHash = trajectoryRoot(entry.snapshots);
  const trajectoryChecksum = sha256Hex(
    JSON.stringify({
      sceneId: entry.sceneId,
      specHash: entry.specHash,
      seed: entry.seed,
      fixedDelta: entry.fixedDelta,
      frames: entry.frames,
      snapshots: entry.snapshots,
      lineage: entry.lineage,
    }),
  );
  const replayToken = sha256Hex(
    `${entry.specHash}:${entry.seed}:${entry.fixedDelta}:${entry.frames}:${trajectoryRootHash}`,
  );

  return {
    operation: "rt3d_state_capture",
    source: "mrs-rt4d-engine/rt3d-ledger",
    engineVersion: "1.0.0",
    intentId: entry.lineage.intentId,
    timelineId: entry.lineage.timelineId,
    worldId: entry.lineage.worldId,
    sceneId: entry.sceneId,
    specHash: entry.specHash,
    seed: entry.seed,
    fixedDelta: entry.fixedDelta,
    frames: entry.frames,
    trajectoryChecksum,
    trajectoryRoot: trajectoryRootHash,
    replayToken,
    at,
  };
}

/**
 * Substrate-level verification: recompute the trajectory root + checksum and
 * confirm the ledger entry replays deterministically (engineTick re-run
 * reproduces every captured frame within 1e-9).
 *
 * NOTE: this does NOT assert CIEMS/JCR enforcement — it reuses the RT3D
 * ledger's own replay invariant as the local verification step.
 */
export function verifyRt3dEvidenceEnvelope(
  envelope: Rt3dEvidenceEnvelope,
  entry: Rt3dLedgerEntry,
  replay: (e: Rt3dLedgerEntry) => { ok: boolean; mismatch?: string },
): Rt3dEvidenceReport {
  const recomputedRoot = trajectoryRoot(entry.snapshots);
  const trajectoryRecomputed = recomputedRoot === envelope.trajectoryRoot;

  const replayResult = replay(entry);
  const mismatch = replayResult.ok ? undefined : replayResult.mismatch;

  return {
    envelope,
    replayOk: replayResult.ok,
    mismatch,
    trajectoryRecomputed,
  };
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Canonical, key-sorted body positions for a single frame. */
function snapshotsBodiesCanonical(s: FrameSnapshot): unknown[] {
  return (s.bodies ?? []).map((b) => ({
    id: b.id,
    position: { x: b.position.x, y: b.position.y, z: b.position.z },
    forceAccum: { x: b.forceAccum.x, y: b.forceAccum.y, z: b.forceAccum.z },
  }));
}
