// @mrs/rt4d-engine durable scene store tests — status: partial
//
// Covers the P4/P5/P6/P7/P10 contract of DurableSceneStore without touching AWS:
//   - pure identity helpers (deterministic, content-addressed)
//   - DI-backed DynamoDB behavior (idempotent create, conflicts, corrupt-reject,
//     optimistic concurrency, non-active exclusion, fail-closed)
//   - engine routes rehydrating a scene from the store after memory loss
//     (simulated by clearSceneCache) — task replacement is invisible to callers
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DurableSceneStore,
  computeReplayToken,
  computeSceneSpecHash,
  expectedSceneId,
} from "../src/durable-scene-store.ts";
import { clearSceneCache, createEngineServer } from "../src/index.ts";
import { patchScene, upsertScene } from "../src/store.ts";

const SPEC = {
  surface: "trefoil-4d",
  resolution: 12,
  rotations: [],
  projection: { type: "perspective", distance4d: 4, distance3d: 4 },
  camera: { fovX: 52, fovY: 52, fovZ: 8, fovW: 8, lensRadius: 0 },
};

function conditionalError() {
  return new ConditionalCheckFailedException({
    message: "The conditional request failed.",
    $metadata: {},
  });
}

/**
 * In-memory stand-in for DynamoDBDocumentClient. Faithful enough for the
 * store's command shapes (Put/Get/Update) and its condition expressions.
 */
class FakeDocumentClient {
  constructor() {
    this.items = new Map();
  }

  async send(command) {
    if (command.constructor.name === "PutCommand") {
      const item = command.input.Item;
      if (command.input.ConditionExpression?.includes("attribute_not_exists")) {
        if (this.items.has(item.sceneId)) throw conditionalError();
      }
      this.items.set(item.sceneId, structuredClone(item));
      return {};
    }

    if (command.constructor.name === "GetCommand") {
      const item = this.items.get(command.input.Key.sceneId);
      return { Item: item ? structuredClone(item) : undefined };
    }

    if (command.constructor.name === "UpdateCommand") {
      const key = command.input.Key.sceneId;
      const existing = this.items.get(key);
      const vals = command.input.ExpressionAttributeValues;
      const cond = command.input.ConditionExpression ?? "";
      if (cond.includes(":expectedPreviousHash")) {
        if (
          !existing ||
          existing.sceneSpecHash !== vals[":expectedPreviousHash"] ||
          existing.status !== vals[":active"]
        ) {
          throw conditionalError();
        }
      }
      const updated = {
        ...existing,
        sceneSpec: structuredClone(vals[":sceneSpec"]),
        sceneSpecHash: vals[":sceneSpecHash"],
        updatedAt: vals[":updatedAt"],
        engineVersion: vals[":engineVersion"],
        replayToken: vals[":replayToken"],
      };
      if (existing && existing.promptHash === undefined) {
        updated.promptHash = vals[":promptHash"];
      }
      this.items.set(key, updated);
      return { Attributes: structuredClone(updated) };
    }

    throw new Error(`unexpected command ${command.constructor.name}`);
  }
}

function makeStore(client = new FakeDocumentClient()) {
  const store = new DurableSceneStore({
    tableName: "test-scenes",
    durabilityRequired: false,
    engineVersion: "0.2.0-test",
    documentClient: client,
  });
  return { store, client };
}

function makeSpec(variant) {
  return { ...SPEC, resolution: 8, camera: { ...SPEC.camera, fovX: 52 + variant } };
}

describe("durable-scene-store identity helpers", () => {
  it("computeSceneSpecHash is deterministic and content-sensitive", () => {
    const a = computeSceneSpecHash(makeSpec(0));
    assert.equal(a, computeSceneSpecHash(makeSpec(0)));
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, computeSceneSpecHash(makeSpec(1)));
  });

  it("expectedSceneId prefixes a fixed rt4d-scene- identity", () => {
    const sceneId = expectedSceneId("0123456789abcdef0123456789abcdef");
    assert.equal(sceneId, "rt4d-scene-0123456789abcdef");
  });

  it("computeReplayToken binds sceneId + current spec hash", () => {
    const id = "rt4d-scene-abcdef";
    const h1 = computeSceneSpecHash(makeSpec(0));
    const h2 = computeSceneSpecHash(makeSpec(1));
    assert.equal(computeReplayToken(id, h1), computeReplayToken(id, h1));
    assert.notEqual(computeReplayToken(id, h1), computeReplayToken(id, h2));
    assert.match(computeReplayToken(id, h1), /^[0-9a-f]{64}$/);
  });
});

describe("DurableSceneStore against a mock table", () => {
  it("putCreatedScene writes identity + replay token + active status", async () => {
    const { store } = makeStore();
    const scene = upsertScene(makeSpec(0));
    const record = await store.putCreatedScene(scene);
    assert.ok(record);
    assert.equal(record.sceneId, scene.sceneId);
    assert.equal(record.sceneId, expectedSceneId(record.identityHash));
    assert.equal(record.identityHash, record.sceneSpecHash);
    assert.equal(record.status, "active");
    assert.equal(record.engineVersion, "0.2.0-test");
    assert.equal(record.replayToken, computeReplayToken(record.sceneId, record.sceneSpecHash));
  });

  it("putCreatedScene is idempotent for an identical re-create (P4)", async () => {
    const { store } = makeStore();
    const first = await store.putCreatedScene(upsertScene(makeSpec(0)));
    const second = await store.putCreatedScene(upsertScene(makeSpec(0)));
    assert.ok(first && second);
    assert.equal(second.sceneId, first.sceneId);
    assert.equal(second.sceneSpecHash, first.sceneSpecHash);
    assert.equal(second.createdAt, first.createdAt);
  });

  it("putCreatedScene conflicts when the same sceneId holds different content", async () => {
    const { store } = makeStore();
    const scene = upsertScene(makeSpec(0));
    const originalHash = scene.sceneHash; // capture BEFORE patchScene mutates the record
    await store.putCreatedScene(scene);
    // Patch durably: identityHash stays bound to the original creation spec,
    // but sceneSpecHash now reflects the patched content.
    const patched = patchScene(scene.sceneId, { resolution: 9 });
    await store.updateScene(patched, originalHash);
    // Re-creating the ORIGINAL spec lands on the same sceneId whose durable
    // content is now the patch → identity matches, spec hash does not → conflict.
    await assert.rejects(
      store.putCreatedScene(upsertScene(makeSpec(0))),
      (err) => err.name === "DurableSceneConflictError",
    );
  });

  it("putCreatedScene rejects a spec that does not bind its own sceneId", async () => {
    const { store } = makeStore();
    const scene = upsertScene(makeSpec(0));
    const detached = { ...scene, sceneId: "rt4d-scene-0000000000000000" };
    await assert.rejects(
      store.putCreatedScene(detached),
      (err) => err.name === "DurableSceneIntegrityError",
    );
  });

  it("loadScene rejects a corrupt sceneSpec (hash mismatch)", async () => {
    const { store, client } = makeStore();
    const scene = upsertScene(makeSpec(0));
    await store.putCreatedScene(scene);
    client.items.get(scene.sceneId).sceneSpec.camera.fovX = 999;
    await assert.rejects(
      store.loadScene(scene.sceneId),
      (err) => err.name === "DurableSceneIntegrityError",
    );
  });

  it("loadScene rejects a tampered identityHash", async () => {
    const { store, client } = makeStore();
    const scene = upsertScene(makeSpec(0));
    await store.putCreatedScene(scene);
    client.items.get(scene.sceneId).identityHash = "f".repeat(64);
    await assert.rejects(
      store.loadScene(scene.sceneId),
      (err) => err.name === "DurableSceneIntegrityError",
    );
  });

  it("loadScene rejects a tampered replayToken", async () => {
    const { store, client } = makeStore();
    const scene = upsertScene(makeSpec(0));
    await store.putCreatedScene(scene);
    client.items.get(scene.sceneId).replayToken = "f".repeat(64);
    await assert.rejects(
      store.loadScene(scene.sceneId),
      (err) => err.name === "DurableSceneIntegrityError",
    );
  });

  it("loadScene hides non-active records unless explicitly requested", async () => {
    const { store, client } = makeStore();
    const scene = upsertScene(makeSpec(0));
    await store.putCreatedScene(scene);
    client.items.get(scene.sceneId).status = "invalid";
    assert.equal(await store.loadScene(scene.sceneId), undefined);
    assert.equal((await store.loadScene(scene.sceneId, { includeNonActive: true }))?.status, "invalid");
  });

  it("updateScene persists an id-stable patch and rotates the replay token", async () => {
    const { store } = makeStore();
    const scene = upsertScene(makeSpec(0));
    const before = await store.putCreatedScene(scene);
    const patched = patchScene(scene.sceneId, { resolution: 9 });
    const updated = await store.updateScene(patched, before.sceneSpecHash);
    assert.ok(updated);
    assert.equal(updated.sceneId, before.sceneId, "sceneId must stay stable across patch");
    assert.notEqual(updated.sceneSpecHash, before.sceneSpecHash);
    assert.notEqual(updated.replayToken, before.replayToken);
    assert.equal(updated.replayToken, computeReplayToken(updated.sceneId, updated.sceneSpecHash));
  });

  it("updateScene conflicts on a stale expected hash (P6 — no silent overwrite)", async () => {
    const { store } = makeStore();
    const scene = upsertScene(makeSpec(0));
    await store.putCreatedScene(scene);
    const patched = patchScene(scene.sceneId, { resolution: 9 });
    await assert.rejects(
      store.updateScene(patched, "0".repeat(64)),
      (err) => err.name === "DurableSceneConflictError",
    );
  });

  it("updateScene conflicts when the record is no longer active", async () => {
    const { store, client } = makeStore();
    const scene = upsertScene(makeSpec(0));
    const before = await store.putCreatedScene(scene);
    client.items.get(scene.sceneId).status = "superseded";
    const patched = patchScene(scene.sceneId, { resolution: 9 });
    await assert.rejects(
      store.updateScene(patched, before.sceneSpecHash),
      (err) => err.name === "DurableSceneConflictError",
    );
  });
});

describe("DurableSceneStore fail-closed behavior", () => {
  it("assertReady throws when durability is required but SCENE_TABLE is missing", () => {
    const store = new DurableSceneStore({
      tableName: undefined,
      durabilityRequired: true,
    });
    assert.throws(() => store.assertReady(), /SCENE_TABLE/);
  });

  it("operations throw when durability is required but unconfigured", async () => {
    const store = new DurableSceneStore({
      tableName: undefined,
      durabilityRequired: true,
    });
    await assert.rejects(store.putCreatedScene(upsertScene(makeSpec(0))), /SCENE_TABLE/);
    await assert.rejects(store.loadScene("rt4d-scene-abc"), /SCENE_TABLE/);
  });

  it("operations are no-ops without a table and without durability requirement", async () => {
    const store = new DurableSceneStore({ tableName: undefined, durabilityRequired: false });
    assert.equal(await store.putCreatedScene(upsertScene(makeSpec(0))), undefined);
    assert.equal(await store.loadScene("rt4d-scene-abc"), undefined);
    assert.equal(await store.updateScene(upsertScene(makeSpec(0)), "0".repeat(64)), undefined);
  });
});

describe("engine routes survive memory loss via the durable store", () => {
  // Each test gets a FRESH fake table + store + server so durable state cannot
  // leak between scenarios. clearSceneCache() comes from index.ts — the same
  // store module instance the server uses — so it really drops the in-memory
  // cache and forces the DynamoDB rehydration path.
  async function withServer(fn) {
    const { store, client } = makeStore();
    const server = createEngineServer({ durableStore: store }).listen(0);
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;
    const post = (pathname, body) =>
      fetch(`${base}${pathname}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const get = (pathname) => fetch(`${base}${pathname}`, { method: "GET" });
    const patch = (pathname, body) =>
      fetch(`${base}${pathname}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    try {
      await fn({ base, post, get, patch, store, client });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  it("create persists durably and renders from memory first", async () => {
    await withServer(async ({ post }) => {
      const created = await post("/v1/scenes", SPEC);
      assert.equal(created.status, 200);
      const env = await created.json();
      assert.equal(env.data.persistence.durable, true);
      assert.equal(env.data.persistence.source, "dynamodb");

      const res = await post(`/v1/scenes/${env.data.sceneId}/render`, { seed: 11, width: 64, height: 64 });
      assert.equal(res.status, 200);
      const renv = await res.json();
      assert.equal(renv.data.scenePersistence.source, "memory");
      assert.equal(renv.data.scenePersistence.rehydrated, false);
      assert.equal(renv.data.evidence.scenePersistence.source, "memory");
    });
  });

  it("after memory loss the same sceneId resolves and renders from DynamoDB", async () => {
    await withServer(async ({ post, get }) => {
      const created = await post("/v1/scenes", SPEC);
      const { sceneId } = (await created.json()).data;

      // Simulate task replacement, then render FIRST: the render path itself must
      // rehydrate from DynamoDB (a GET beforehand would re-populate the cache and
      // make the render report memory).
      clearSceneCache();
      const res = await post(`/v1/scenes/${sceneId}/render`, { seed: 12, width: 64, height: 64 });
      assert.equal(res.status, 200, "rehydration must make task replacement invisible");
      const renv = await res.json();
      assert.equal(renv.data.scenePersistence.source, "dynamodb");
      assert.equal(renv.data.scenePersistence.rehydrated, true);
      assert.equal(renv.data.evidence.scenePersistence.rehydrated, true);
      assert.match(renv.data.scenePersistence.replayToken, /^[0-9a-f]{64}$/);

      // Separate replacement → resolve-only path.
      clearSceneCache();
      const got = await get(`/v1/scenes/${sceneId}`);
      assert.equal(got.status, 200);
      const genv = await got.json();
      assert.equal(genv.data.persistence.source, "dynamodb");
      assert.equal(genv.data.persistence.rehydrated, true);
    });
  });

  it("a patched scene keeps its sceneId and the patch survives replacement", async () => {
    await withServer(async ({ post, get, patch }) => {
      const created = await post("/v1/scenes", SPEC);
      const { sceneId } = (await created.json()).data;

      clearSceneCache();
      const p = await patch(`/v1/scenes/${sceneId}`, { resolution: 10 });
      assert.equal(p.status, 200);
      const penv = await p.json();
      assert.equal(penv.data.sceneId, sceneId);
      assert.equal(penv.data.persistence.durable, true);

      clearSceneCache();
      const got = await get(`/v1/scenes/${sceneId}`);
      assert.equal(got.status, 200);
      const genv = await got.json();
      assert.equal(genv.data.persistence.rehydrated, true);
      assert.equal(genv.data.spec.resolution, 10, "patched spec must be what is rehydrated");
    });
  });

  it("corrupt durable content returns SCENE_INTEGRITY_ERROR instead of a bad render", async () => {
    await withServer(async ({ post, client }) => {
      const created = await post("/v1/scenes", SPEC);
      const { sceneId } = (await created.json()).data;

      clearSceneCache();
      client.items.get(sceneId).sceneSpec.camera.fovX = 12345; // breaks sceneSpecHash

      const res = await post(`/v1/scenes/${sceneId}/render`, { seed: 13, width: 64, height: 64 });
      assert.equal(res.status, 409);
      const env = await res.json();
      assert.equal(env.error.code, "SCENE_INTEGRITY_ERROR");
    });
  });

  it("unknown sceneId is 404 after memory loss", async () => {
    clearSceneCache();
    await withServer(async ({ get }) => {
      const res = await get("/v1/scenes/rt4d-scene-0000000000000000");
      assert.equal(res.status, 404);
      assert.equal((await res.json()).error.code, "SCENE_NOT_FOUND");
    });
  });
});
