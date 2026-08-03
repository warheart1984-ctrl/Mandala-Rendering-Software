// @mrs/rt4d-engine durable scene store — status: partial
//
// Content-addressed SceneSpec persistence on DynamoDB so ECS task replacement is
// invisible to callers: sceneId → DDB → canonical SceneSpec → hash verify →
// restore into the current task's in-memory cache → render.
//
// Identity model (two hashes — this is NOT redundant):
//   - identityHash:   hash of the ORIGINAL creation spec. Permanently binds the
//                     content-addressed sceneId (sceneId = rt4d-scene-<16hex>).
//   - sceneSpecHash:  hash of the CURRENT (possibly patched) spec via
//                     canonicalSceneJson. Changes after an id-stable patch; used
//                     for corruption detection and optimistic concurrency.
//
// This preserves P4 (repeated identical creation → same sceneId) while honoring
// the engine's id-stable PATCH contract (restoreScene keeps the original sceneId).
//
// Fail-closed: when SCENE_DURABILITY_REQUIRED=true, a create must not return live
// unless persisted, a corrupt hash never reaches the renderer, and a missing
// table configuration fails startup or the request explicitly.
//
// Without SCENE_TABLE (local dev / unit tests) every operation is a no-op unless
// SCENE_DURABILITY_REQUIRED=true.
import { createHash } from "node:crypto";
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient as DocClient,
} from "@aws-sdk/lib-dynamodb";
import { canonicalSceneJson, type SceneRecord, type SceneSpec } from "./store.js";

export type DurableSceneStatus = "active" | "superseded" | "invalid";

export interface DurableSceneRecord {
  sceneId: string;
  /** Permanently binds the content-addressed creation identity. */
  identityHash: string;
  /** Hash of the CURRENT spec. Changes after an id-stable patch. */
  sceneSpecHash: string;
  sceneSpec: SceneSpec;
  promptHash?: string;
  engineVersion: string;
  createdAt: string;
  updatedAt: string;
  replayToken: string;
  status: DurableSceneStatus;
}

export interface PersistSceneMetadata {
  promptHash?: string;
}

export class DurableSceneIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurableSceneIntegrityError";
  }
}

export class DurableSceneConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurableSceneConflictError";
  }
}

export function computeSceneSpecHash(spec: SceneSpec): string {
  return sha256(canonicalSceneJson(spec));
}

export function expectedSceneId(identityHash: string): string {
  return `rt4d-scene-${identityHash.slice(0, 16)}`;
}

export function computeReplayToken(sceneId: string, sceneSpecHash: string): string {
  return sha256(`rt4d-scene-replay:v1:${sceneId}:${sceneSpecHash}`);
}

export interface DurableSceneStoreOptions {
  tableName?: string;
  durabilityRequired?: boolean;
  engineVersion?: string;
  documentClient?: DocClient;
}

export class DurableSceneStore {
  private readonly tableName: string | undefined;
  private readonly durabilityRequired: boolean;
  private readonly engineVersion: string;
  private readonly documentClient: DocClient | undefined;

  constructor(options: DurableSceneStoreOptions = {}) {
    this.tableName = options.tableName ?? (process.env.SCENE_TABLE?.trim() || undefined);
    this.durabilityRequired =
      options.durabilityRequired ??
      process.env.SCENE_DURABILITY_REQUIRED?.toLowerCase() === "true";
    this.engineVersion =
      options.engineVersion ?? (process.env.RT4D_ENGINE_VERSION?.trim() || "unknown");
    this.documentClient =
      options.documentClient ??
      (this.tableName
        ? DynamoDBDocumentClient.from(new DynamoDBClient({}), {
            marshallOptions: { removeUndefinedValues: true },
          })
        : undefined);
  }

  public assertReady(): void {
    if (this.durabilityRequired) {
      this.assertConfigured();
    }
  }

  public isEnabled(): boolean {
    return Boolean(this.tableName && this.documentClient);
  }

  /**
   * Stores the initially-created content-addressed scene. Idempotent: an existing
   * item is accepted only when identityHash AND sceneSpecHash match exactly,
   * otherwise a conflict is raised (P2/P10 — never downgrade to memory-only).
   */
  public async putCreatedScene(
    scene: SceneRecord,
    metadata: PersistSceneMetadata = {},
  ): Promise<DurableSceneRecord | undefined> {
    if (!this.isEnabled()) {
      if (this.durabilityRequired) this.assertConfigured();
      return undefined;
    }
    this.assertConfigured();

    const sceneSpecHash = computeSceneSpecHash(scene.spec);
    const identityHash = sceneSpecHash;
    if (scene.sceneId !== expectedSceneId(identityHash)) {
      throw new DurableSceneIntegrityError(
        `Scene identity mismatch: received ${scene.sceneId}, expected ${expectedSceneId(identityHash)}.`,
      );
    }

    const item: DurableSceneRecord = {
      sceneId: scene.sceneId,
      identityHash,
      sceneSpecHash,
      sceneSpec: structuredClone(scene.spec),
      promptHash: metadata.promptHash,
      engineVersion: this.engineVersion,
      createdAt: scene.createdAt,
      updatedAt: scene.updatedAt,
      replayToken: computeReplayToken(scene.sceneId, sceneSpecHash),
      status: "active",
    };

    try {
      await this.send(
        new PutCommand({
          TableName: this.tableName!,
          Item: item,
          ConditionExpression: "attribute_not_exists(sceneId)",
        }),
      );
      return item;
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      const existing = await this.loadScene(scene.sceneId, { includeNonActive: true });
      if (
        existing &&
        existing.identityHash === identityHash &&
        existing.sceneSpecHash === sceneSpecHash &&
        existing.status === "active"
      ) {
        return existing;
      }
      throw new DurableSceneConflictError(
        `Scene ${scene.sceneId} already exists with different durable content.`,
      );
    }
  }

  /**
   * Persists an id-stable patch with optimistic concurrency: expectedPreviousHash
   * is the sceneSpecHash read BEFORE the patch. A concurrent writer cannot
   * silently overwrite (P6).
   */
  public async updateScene(
    scene: SceneRecord,
    expectedPreviousHash: string,
    metadata: PersistSceneMetadata = {},
  ): Promise<DurableSceneRecord | undefined> {
    if (!this.isEnabled()) {
      if (this.durabilityRequired) this.assertConfigured();
      return undefined;
    }
    this.assertConfigured();

    const sceneSpecHash = computeSceneSpecHash(scene.spec);
    const replayToken = computeReplayToken(scene.sceneId, sceneSpecHash);

    try {
      const response = await this.send(
        new UpdateCommand({
          TableName: this.tableName!,
          Key: { sceneId: scene.sceneId },
          UpdateExpression: [
            "SET sceneSpec = :sceneSpec",
            "sceneSpecHash = :sceneSpecHash",
            "updatedAt = :updatedAt",
            "engineVersion = :engineVersion",
            "replayToken = :replayToken",
            "promptHash = if_not_exists(promptHash, :promptHash)",
          ].join(", "),
          ConditionExpression: "sceneSpecHash = :expectedPreviousHash AND #status = :active",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":sceneSpec": structuredClone(scene.spec),
            ":sceneSpecHash": sceneSpecHash,
            ":expectedPreviousHash": expectedPreviousHash,
            ":updatedAt": scene.updatedAt,
            ":engineVersion": this.engineVersion,
            ":replayToken": replayToken,
            ":promptHash": metadata.promptHash ?? "unknown",
            ":active": "active",
          },
          ReturnValues: "ALL_NEW",
        }),
      );
      this.assertValidRecordShape(response.Attributes);
      return response.Attributes;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new DurableSceneConflictError(
          `Scene ${scene.sceneId} changed concurrently or is no longer active.`,
        );
      }
      throw error;
    }
  }

  /** Consistent read + full verification. Never returns a corrupt record. */
  public async loadScene(
    sceneId: string,
    options: { includeNonActive?: boolean } = {},
  ): Promise<DurableSceneRecord | undefined> {
    if (!this.isEnabled()) {
      if (this.durabilityRequired) this.assertConfigured();
      return undefined;
    }
    this.assertConfigured();

    const response = await this.send(
      new GetCommand({ TableName: this.tableName!, Key: { sceneId }, ConsistentRead: true }),
    );
    if (!response.Item) return undefined;

    this.assertValidRecordShape(response.Item);
    const record = response.Item;

    if (!options.includeNonActive && record.status !== "active") return undefined;

    const actualSpecHash = computeSceneSpecHash(record.sceneSpec);
    if (actualSpecHash !== record.sceneSpecHash) {
      throw new DurableSceneIntegrityError(`SceneSpec hash mismatch for ${sceneId}.`);
    }
    if (expectedSceneId(record.identityHash) !== record.sceneId) {
      throw new DurableSceneIntegrityError(`Identity hash does not bind sceneId ${sceneId}.`);
    }
    const expectedReplayToken = computeReplayToken(record.sceneId, record.sceneSpecHash);
    if (record.replayToken !== expectedReplayToken) {
      throw new DurableSceneIntegrityError(`Replay token mismatch for ${sceneId}.`);
    }

    return { ...record, sceneSpec: structuredClone(record.sceneSpec) };
  }

  private assertConfigured(): void {
    if (!this.tableName || !this.documentClient) {
      throw new Error(
        "Durable scene persistence is required but SCENE_TABLE is not configured.",
      );
    }
  }

  private send(command: { input: unknown }): Promise<any> {
    if (!this.documentClient) throw new Error("Durable scene persistence is not configured.");
    return this.documentClient.send(command as never);
  }

  private assertValidRecordShape(value: unknown): asserts value is DurableSceneRecord {
    if (!value || typeof value !== "object") {
      throw new DurableSceneIntegrityError("Durable scene record is not an object.");
    }
    const record = value as Partial<DurableSceneRecord>;
    if (
      typeof record.sceneId !== "string" ||
      typeof record.identityHash !== "string" ||
      typeof record.sceneSpecHash !== "string" ||
      !record.sceneSpec ||
      typeof record.sceneSpec !== "object" ||
      typeof record.engineVersion !== "string" ||
      typeof record.createdAt !== "string" ||
      typeof record.updatedAt !== "string" ||
      typeof record.replayToken !== "string" ||
      !["active", "superseded", "invalid"].includes(record.status ?? "")
    ) {
      throw new DurableSceneIntegrityError(
        `Malformed durable scene record for ${record.sceneId ?? "unknown scene"}.`,
      );
    }
  }
}

export const durableSceneStore = new DurableSceneStore();

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
