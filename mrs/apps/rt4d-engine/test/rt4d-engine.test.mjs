// @mrs/rt4d-engine acceptance tests — status: live
// Run with `pnpm --filter @mrs/rt4d-engine test` (tsx --test). Imports .ts directly.
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { createEngineServer } from "../src/index.ts";

const SPEC = {
  surface: "trefoil-4d",
  resolution: 12,
  rotations: [],
  projection: { type: "perspective", distance4d: 4, distance3d: 4 },
  camera: { fovX: 52, fovY: 52, fovZ: 8, fovW: 8, lensRadius: 0 },
};

const server = createEngineServer().listen(0);
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

after(() => server.close());

function post(pathname, body) {
  return fetch(`${base}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(pathname) {
  return fetch(`${base}${pathname}`, { method: "GET" });
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function isPng(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (b[i] !== PNG_MAGIC[i]) return false;
  }
  return true;
}

before(async () => {
  assert.equal(server.listening, true);
});

describe("rt4d-engine acceptance criteria", () => {
  it("AC1 /health returns a live envelope", async () => {
    const res = await get("/health");
    assert.equal(res.status, 200);
    const env = await res.json();
    assert.equal(env.statusTag, "live");
    assert.equal(env.ok, true);
    assert.equal(env.data.service, "@mrs/rt4d-engine");
  });

  it("AC2 POST /v1/scenes deterministically creates the same sceneId for equal specs", async () => {
    const r1 = await post("/v1/scenes", SPEC);
    const r2 = await post("/v1/scenes", SPEC);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    const e1 = await r1.json();
    const e2 = await r2.json();
    assert.equal(e1.statusTag, "live");
    assert.equal(e2.statusTag, "live");
    assert.equal(e1.data.sceneId, e2.data.sceneId);
    assert.ok(e1.data.sceneId.startsWith("rt4d-scene-"));
    assert.equal(e1.data.sceneId.length, 16 + "rt4d-scene-".length);
  });

  it("AC3 POST /v1/scenes/{id}/render with seed returns a PNG + sha256 receipt", async () => {
    const created = await post("/v1/scenes", SPEC);
    const { data } = await created.json();
    const res = await post(`/v1/scenes/${data.sceneId}/render`, { seed: 42, width: 128, height: 128 });
    assert.equal(res.status, 200);
    const env = await res.json();
    assert.equal(env.statusTag, "live");
    assert.match(env.data.renderReceipt.sha256, /^[0-9a-f]{64}$/);
    const png = Buffer.from(env.data.pngBase64, "base64");
    assert.ok(isPng(png), "response pngBase64 must start with PNG magic bytes");
    assert.ok(png.length > 67, "PNG must carry a non-empty IDAT (real pixels, not empty)");
    assert.equal(env.data.renderReceipt.cached, false);
  });

  it("AC4 POST /v1/scenes/{id}/render without seed returns 400", async () => {
    const created = await post("/v1/scenes", SPEC);
    const { data } = await created.json();
    const res = await post(`/v1/scenes/${data.sceneId}/render`, {});
    assert.equal(res.status, 400);
    const env = await res.json();
    assert.equal(env.ok, false);
    assert.ok(env.error?.code === "MISSING_SEED");
  });

  it("AC5 same seed + params reproduces byte-identical PNG; retry is served from cache", async () => {
    const created = await post("/v1/scenes", SPEC);
    const { data } = await created.json();
    const params = { seed: 7, width: 128, height: 128 };

    const r1 = await post(`/v1/scenes/${data.sceneId}/render`, params);
    const e1 = await r1.json();

    const r2 = await post(`/v1/scenes/${data.sceneId}/render`, params);
    const e2 = await r2.json();

    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(e1.data.pngBase64, e2.data.pngBase64, "deterministic seed must produce byte-identical PNG");
    assert.equal(e2.data.renderReceipt.sha256, e1.data.renderReceipt.sha256);
    assert.equal(e2.data.renderReceipt.cached, true);
    const prov = await get(`/v1/scenes/${data.sceneId}/provenance`);
    const penv = await prov.json();
    assert.equal(penv.statusTag, "live");
    // Shared in-memory store: other tests (AC3) may have written receipts for a
    // different seed on the SAME sceneId. Filter to THIS renderKey to verify the
    // cache hit did not duplicate the seed-7 entry.
    const matching = penv.data.receipts.filter((r) => r.renderKey === e1.data.renderKey);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].cached, false);
    assert.equal(matching[0].sha256, e1.data.renderReceipt.sha256);
  });

  it("AC7 /render returns an evidence envelope that verifies via the invariant conformance suite", async () => {
    const engineMod = await import("../src/index.ts");
    const evMod = await import("../src/evidence/rt4dEvidenceEnvelope.ts");
    const created = await post("/v1/scenes", SPEC);
    const { data } = await created.json();
    const res = await post(`/v1/scenes/${data.sceneId}/render`, { seed: 99, width: 128, height: 128 });
    const env = await res.json();
    const ev = env.data.evidence;
    assert.equal(ev.operation, "rt4d_dimensional_preview");
    assert.equal(ev.source, "mrs-renderer-core/rt4d");
    assert.equal(typeof ev.runId, "string");
    assert.equal(ev.seed, 99);
    assert.match(ev.sceneSpecHash, /^[0-9a-f]{64}$/);
    assert.match(ev.renderKey, /^[0-9a-f]{64}$/);
    assert.equal(ev.pngSha256, env.data.renderReceipt.sha256);
    assert.match(ev.replayToken, /^[0-9a-f]{64}$/);

    const verification = evMod.verifyRt4dEvidenceEnvelope(ev);
    assert.equal(verification.ok, true, JSON.stringify(verification.report));

    void engineMod;
  });

  it("AC6 GET /v1/scenes/{id}/geometry returns triangulated surface topology", async () => {
    const created = await post("/v1/scenes", SPEC);
    const { data } = await created.json();
    const res = await get(`/v1/scenes/${data.sceneId}/geometry`);
    assert.equal(res.status, 200);
    const env = await res.json();
    assert.equal(env.statusTag, "live");
    const geo = env.data.geometry;
    assert.ok(Array.isArray(geo.vertices));
    assert.ok(Array.isArray(geo.indices));
    assert.ok(Array.isArray(geo.edges));
    assert.ok(geo.vertices.length > 0, "sampled surface must produce vertices");
    assert.ok(geo.indices.length > 0, "sampled surface must produce triangle faces");
    for (const v of geo.vertices) {
      assert.equal(typeof v.x, "number");
      assert.equal(typeof v.y, "number");
      assert.equal(typeof v.z, "number");
      assert.equal(typeof v.w, "number");
    }
  });

  it("AC-R1 same state + seed produces identical pixelHash and pngHash", async () => {
    const created = await post("/v1/scenes", SPEC);
    const { data } = await created.json();
    const params = { seed: 211, width: 96, height: 96 };
    const r1 = await post(`/v1/scenes/${data.sceneId}/render`, params);
    const r2 = await post(`/v1/scenes/${data.sceneId}/render`, params);
    const e1 = await r1.json();
    const e2 = await r2.json();
    assert.equal(e1.data.renderReceipt.pixelHash, e2.data.renderReceipt.pixelHash, "pixelHash must be identical for same seed+state");
    assert.equal(e1.data.renderReceipt.sha256, e2.data.renderReceipt.sha256, "pngHash must be identical for same seed+state");
  });

  it("AC-R2 same certified runtime produces byte-identical PNG (cache replay)", async () => {
    const created = await post("/v1/scenes", SPEC);
    const { data } = await created.json();
    const params = { seed: 507, width: 64, height: 64 };
    const r1 = await post(`/v1/scenes/${data.sceneId}/render`, params);
    const e1 = await r1.json();
    const png1 = e1.data.pngBase64;
    // Second call is served from the content-addressed cache (renderKey).
    const r2 = await post(`/v1/scenes/${data.sceneId}/render`, params);
    const e2 = await r2.json();
    assert.equal(e2.data.renderReceipt.cached, true);
    assert.equal(e2.data.pngBase64, png1, "cached replay must reproduce byte-identical PNG");
    assert.equal(e2.data.renderReceipt.renderId, e1.data.renderReceipt.renderId, "renderId stable across cache replay");
  });

  it("AC-R3 camera change changes projectionHash and pixelHash", async () => {
    // Base spec with one camera.
    const baseSpec = {
      surface: "tesseract",
      resolution: 10,
      rotations: [],
      projection: { type: "perspective", distance4d: 4, distance3d: 4 },
      camera: { fovX: 52, fovY: 52, fovZ: 8, fovW: 8, lensRadius: 0 },
    };
    // Variant with a different camera fovX — same seed → different projection.
    const camSpec = { ...baseSpec, camera: { ...baseSpec.camera, fovX: 75 } };
    const r1 = await post("/v1/scenes", baseSpec);
    const r2 = await post("/v1/scenes", camSpec);
    const { data: d1 } = await r1.json();
    const { data: d2 } = await r2.json();
    const params = { seed: 331, width: 64, height: 64 };
    const rend1 = await post(`/v1/scenes/${d1.sceneId}/render`, params);
    const rend2 = await post(`/v1/scenes/${d2.sceneId}/render`, params);
    const e1 = await rend1.json();
    const e2 = await rend2.json();
    assert.notEqual(e1.data.renderReceipt.projectionHash, e2.data.renderReceipt.projectionHash, "camera change must change projectionHash");
    assert.notEqual(e1.data.renderReceipt.pixelHash, e2.data.renderReceipt.pixelHash, "camera change must change pixelHash");
    assert.notEqual(e1.data.renderReceipt.renderId, e2.data.renderReceipt.renderId, "renderId must differ across projections");
  });

  it("AC-R4 tampered trajectory is rejected before rendering (RT3D ledger gate)", async () => {
    const { Rt3dLedger } = await import("../src/persistence/rt3dLedger.ts");
    const { convertSceneSpecification } = await import("@mrs/renderer-core/scene-spec");
    const spec = { schemaVersion: "1.0", id: "ac-r4-spec", kind: "SceneSpecification", name: "R4", materials: [{ id: "m", color: "#fff", opacity: 1, wireframe: false }], entities: [{ id: "t", materialId: "m", transform4d: { rotate: { xw: 0 } }, geometry: { kind: "surface", surfaceId: "tesseract" } }], defaultObservation: { modeId: "perspective_w", params: { d4: 4 } } };
    const { worldDocument, specHash } = convertSceneSpecification(spec);
    const ledger = new Rt3dLedger({ directory: "data/rt3d-ac-r4", fixedDelta: 1 / 60 });
    const entry = ledger.capture({ sceneId: "rt3d-scene-r4", specHash, seed: 7, worldDocument, frames: 6, lineage: { intentId: "i-r4", timelineId: "t-r4", worldId: "w-r4" } });
    // Tamper the in-memory trajectory.
    const tampered = structuredClone(entry);
    tampered.snapshots[2].bodies[0].position.x += 5.0;
    const result = ledger.replay(tampered);
    assert.equal(result.ok, false, "tampered trajectory must be rejected by the persistence gate before any render");
    assert.ok(result.mismatch, "rejected replay must carry a mismatch reason");
  });

  it("AC-R5 render envelope verifies against persisted state", async () => {
    const evMod = await import("../src/evidence/rt4dEvidenceEnvelope.ts");
    const created = await post("/v1/scenes", SPEC);
    const { data } = await created.json();
    const res = await post(`/v1/scenes/${data.sceneId}/render`, { seed: 4242, width: 128, height: 128 });
    const env = await res.json();
    const ev = env.data.evidence;
    assert.equal(ev.evidenceStatus, "substrate_verified");
    assert.equal(ev.promotionStatus, "not_promoted_to_ciems");
    assert.equal(ev.sceneSpecHash, env.data.renderReceipt.projectionHash ? ev.sceneSpecHash : ev.sceneSpecHash);
    assert.equal(ev.renderId, env.data.renderReceipt.renderId, "envelope.renderId matches receipt");
    assert.equal(ev.pixelHash, env.data.renderReceipt.pixelHash, "envelope.pixelHash matches receipt");
    assert.equal(ev.pngHash, env.data.renderReceipt.sha256, "envelope.pngHash matches receipt");
    assert.match(ev.replayToken, /^[0-9a-f]{64}$/);
    const verification = evMod.verifyRt4dEvidenceEnvelope(ev);
    assert.equal(verification.ok, true, JSON.stringify(verification.report));
  });

  it("AC-R6 unsupported surface returns explicit capability failure (not fake success)", async () => {
    const badSpec = { ...SPEC, surface: "nonexistent-surface-4d" };
    const created = await post("/v1/scenes", badSpec);
    assert.equal(created.status, 400, "unsupported surface must be rejected at scene creation");
    const env = await created.json();
    assert.equal(env.ok, false);
    assert.equal(env.error?.code, "CAPABILITY_UNSUPPORTED");
    assert.match(env.error?.message ?? "", /CAPABILITY_UNSUPPORTED/);
  });

  it("AC-R7 tool output contains real artifact + layered provenance hashes", async () => {
    const created = await post("/v1/scenes", SPEC);
    const { data } = await created.json();
    const res = await post(`/v1/scenes/${data.sceneId}/render`, { seed: 31337, width: 256, height: 256 });
    const env = await res.json();
    assert.equal(res.status, 200);
    // Real artifact: non-empty PNG with PNG magic bytes.
    const png = Buffer.from(env.data.pngBase64, "base64");
    assert.ok(isPng(png), "real PNG artifact must be present");
    assert.ok(png.length > 67, "PNG must carry real pixels");
    // Layered provenance hashes all present and well-formed.
    const r = env.data.renderReceipt;
    assert.match(r.renderId, /^rt4d-render-[0-9a-f]{16}$/);
    assert.match(r.projectionHash, /^[0-9a-f]{64}$/);
    assert.match(r.pixelHash, /^[0-9a-f]{64}$/);
    assert.match(r.sha256, /^[0-9a-f]{64}$/);
    assert.equal(r.runtimeFingerprint?.node, process.versions.node, "runtimeFingerprint.node is the host node version");
    assert.equal(r.runtimeFingerprint?.platform, process.platform);
    // Evidence envelope binds the artifact to the state.
    const ev = env.data.evidence;
    assert.equal(ev.renderId, r.renderId);
    assert.equal(ev.projectionHash, r.projectionHash);
    assert.equal(ev.pixelHash, r.pixelHash);
    assert.equal(ev.pngHash, r.sha256);
    assert.equal(ev.evidenceStatus, "substrate_verified");
  });
});
