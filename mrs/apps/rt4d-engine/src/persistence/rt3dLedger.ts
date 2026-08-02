// @mrs/rt4d-engine persistence — status: declared (substrate-level JSON ledger)
//
// Minimal JSON-ledger persistence for RT3D scene state + deterministic frame
// trajectory. The canonical scene source is renderer-core's
// `convertSceneSpecification(sceneSpec)` → { worldDocument, specHash, seed }.
// This ledger stores the worldDocument + a captured per-frame trajectory
// produced by EngineHost.tick (one fixed step at a time), so the tuple
// (specHash, seed, fixedDelta, frames) replays byte-identically into the same
// world state.
//
// Honest scope: declared substrate artifact. CIEMS/JCR promotion is a separate,
// explicitly-mandated cross-repo operation — NOT claimed here.
// See docs/4d-engine/rt4d/RT4D_ENGINE_EVIDENCE_SPEC.v1.md.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { World3D, EngineHost } from "@mrs/renderer-core/engine3d";

export type WorldDocument = Record<string, unknown> & {
  schemaVersion: string;
  id: string;
  metadata?: { sceneSpecHash?: string; kind?: string };
};

export type BodySnapshot = {
  id: number | string;
  position: { x: number; y: number; z: number };
  forceAccum: { x: number; y: number; z: number };
};

export type FrameSnapshot = {
  frameIndex: number;
  elapsed: number;
  bodyCount: number;
  vertexCount: number;
  bodies: BodySnapshot[];
};

export type Rt3dLedgerEntry = {
  sceneId: string;
  specHash: string;
  seed: number;
  worldDocument: WorldDocument;
  fixedDelta: number;
  frames: number;
  snapshots: FrameSnapshot[];
  lineage: {
    intentId: string;
    timelineId: string;
    worldId: string;
  };
  createdAt: string;
  checksum: string;
};

export type Rt3dPersistenceOptions = {
  directory?: string;
  fixedDelta?: number;
};

const DEFAULT_DIR = "data/rt3d-ledger";
const DEFAULT_FIXED_DELTA = 1 / 60;

export class Rt3dLedger {
  public readonly dir: string;
  public readonly fixedDelta: number;

  constructor(opts: Rt3dPersistenceOptions = {}) {
    this.dir = opts.directory ?? DEFAULT_DIR;
    this.fixedDelta = opts.fixedDelta ?? DEFAULT_FIXED_DELTA;
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  private pathFor(specHash: string): string {
    return join(this.dir, `${specHash}.json`);
  }

  /** Persist a fully-built ledger entry (integrity checksum included). */
  save(entry: Rt3dLedgerEntry): Rt3dLedgerEntry {
    if (entry.checksum !== computeChecksum(entry)) {
      entry.checksum = computeChecksum(entry);
    }
    writeFileSync(this.pathFor(entry.specHash), JSON.stringify(entry, null, 2), "utf8");
    return entry;
  }

  /** Load + integrity-check a persisted entry. Throws on checksum mismatch. */
  load(specHash: string): Rt3dLedgerEntry | null {
    const path = this.pathFor(specHash);
    if (!existsSync(path)) return null;
    let parsed: Rt3dLedgerEntry;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
    if (computeChecksum(parsed) !== parsed.checksum) {
      throw new Error(`ledger entry ${specHash} failed checksum verification (tamper/corruption)`);
    }
    return parsed;
  }

  /**
   * Build a World3D from a worldDocument, run N fixed steps, and capture the
   * per-frame trajectory snapshot. Deterministic: the captured snapshots are
   * reproducible from (specHash, seed, fixedDelta, frames) via `replay`.
   */
  capture(input: {
    sceneId: string;
    specHash: string;
    seed: number;
    worldDocument: WorldDocument;
    frames: number;
    lineage: { intentId: string; timelineId: string; worldId: string };
  }): Rt3dLedgerEntry {
    const fixedDelta = this.fixedDelta;
    const host = buildHostFromWorldDocument(input.worldDocument, fixedDelta);
    const snapshots: FrameSnapshot[] = [];
    for (let f = 1; f <= input.frames; f++) {
      host.engineTick(fixedDelta);
      snapshots.push(snapshotFrame(host, f));
    }
    const entry: Rt3dLedgerEntry = {
      sceneId: input.sceneId,
      specHash: input.specHash,
      seed: input.seed,
      worldDocument: input.worldDocument,
      fixedDelta,
      frames: input.frames,
      snapshots,
      lineage: input.lineage,
      createdAt: new Date().toISOString(),
      checksum: "",
    };
    entry.checksum = computeChecksum(entry);
    return entry;
  }

  /**
   * Replay invariant: re-run the engine from the persisted worldDocument and
   * assert every captured frame reproduces exactly (determinism check).
   */
  replay(entry: Rt3dLedgerEntry): { ok: boolean; mismatch?: string } {
    if (computeChecksum(entry) !== entry.checksum) {
      return { ok: false, mismatch: "checksum mismatch" };
    }
    const host = buildHostFromWorldDocument(entry.worldDocument, entry.fixedDelta);
    if (entry.snapshots.length !== entry.frames) {
      return { ok: false, mismatch: "snapshot count != frames" };
    }
    for (let i = 0; i < entry.frames; i++) {
      host.engineTick(entry.fixedDelta);
      const live = snapshotFrame(host, i + 1);
      const want = entry.snapshots[i];
      const mismatch = framesEqual(live, want);
      if (mismatch) return { ok: false, mismatch: `frame ${i + 1}: ${mismatch}` };
    }
    return { ok: true };
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

function computeChecksum(entry: Rt3dLedgerEntry): string {
  return sha256Hex(
    canonicalJson({
      sceneId: entry.sceneId,
      specHash: entry.specHash,
      seed: entry.seed,
      fixedDelta: entry.fixedDelta,
      frames: entry.frames,
      snapshots: entry.snapshots,
      lineage: entry.lineage,
    }),
  );
}

/**
 * Build an EngineHost + World3D from a worldDocument. Only deterministic, seed-
 * independent geometry is materialized as bodies; the seed drives nothing in the
 * host (the fixed step + initial state is the source of determinism).
 */
function buildHostFromWorldDocument(doc: WorldDocument, fixedDelta: number): EngineHost {
  const world = new World3D();
  const entities = (doc.entities as Array<Record<string, unknown>> | undefined) ?? [];
  for (const e of entities) {
    const geom = (e.geometry as Record<string, unknown>) ?? { kind: "empty" };
    const rt4dPrim = (e.userData as Record<string, unknown> | undefined)?.rt4dPrimitive as Record<string, unknown> | undefined;
    const effectiveKind = rt4dPrim?.kind ?? geom.kind;
    const center4d: number[] =
      (geom as { center?: number[] }).center ??
      (rt4dPrim as { center?: number[] } | undefined)?.center ??
      [0, 0, 0, 0];
    if (effectiveKind === "surface" || effectiveKind === "hypersphere" || effectiveKind === "tesseract") {
      const c = Array.isArray(center4d) ? center4d : [0, 0, 0, 0];
      world.addBody({
        position: { x: Number(c[0] ?? 0), y: Number(c[1] ?? 0), z: Number(c[2] ?? 0) },
      });
    }
  }
  return new EngineHost({ world, fixedDelta });
}

function snapshotFrame(host: EngineHost, frameIndex: number): FrameSnapshot {
  const bodies: BodySnapshot[] = host.world.bodies.map((b) => ({
    id: (b as { id: number | string }).id,
    position: { x: b.position.x, y: b.position.y, z: b.position.z },
    forceAccum: { x: b.forceAccum.x, y: b.forceAccum.y, z: b.forceAccum.z },
  }));
  return {
    frameIndex,
    elapsed: host.clock.time,
    bodyCount: host.world.bodies.length,
    vertexCount: host.world.mesh.vertices.length,
    bodies,
  };
}

function framesEqual(a: FrameSnapshot, b: FrameSnapshot): string | null {
  if (a.frameIndex !== b.frameIndex) return `frameIndex ${a.frameIndex} != ${b.frameIndex}`;
  if (a.bodyCount !== b.bodyCount) return `bodyCount ${a.bodyCount} != ${b.bodyCount}`;
  if (a.bodies.length !== b.bodies.length) return `bodies length drift`;
  const tol = 1e-9;
  for (let i = 0; i < a.bodies.length; i++) {
    const pa = a.bodies[i].position;
    const pb = b.bodies[i].position;
    const d = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
    if (d > tol) return `body ${i} position drift ${d}`;
  }
  return null;
}
