import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SME_SURFACE_PAINTER_ID,
  StableDiffusionCppSurfacePainter,
  applySurfacePaintResultToSkinLayer,
  surfacePaintRequestDigest,
  validateSurfacePaintRequest,
  type SurfacePaintAuthorityGrant,
  type SurfacePaintRequest,
} from "../src/ai-surface.js";
import { sha256Hex } from "../src/canonical.js";
import { validateSkinLayer } from "../src/rigs.js";
import type { SkinLayer } from "../src/types.js";

const TOPOLOGY = "a".repeat(64);
const UV = "b".repeat(64);
const PLACEHOLDER = "c".repeat(64);
const PNG = new Uint8Array(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zq9sAAAAASUVORK5CYII=",
  "base64",
));

function grant(): SurfacePaintAuthorityGrant {
  return {
    schemaVersion: "sovereign-surface-paint-grant/1.0",
    grantId: "grant://jon/anthro-skin-v1",
    authorityRef: "authority://creator/jon",
    rightsRef: "rights://original-anthro-character",
    rigId: "anthro-standard-v1",
    sculptDocumentId: "anthro-sculpt-v1",
    topologyDigest: TOPOLOGY,
    uvDigest: UV,
    allowedChannels: ["baseColor", "celShade", "normalDetail", "roughness", "fur", "marking"],
    allowedModelIds: ["anything-v5-q4_0.gguf", "dreamshaper-8-q4_0.gguf"],
    maxSteps: 24,
    maxWidth: 1024,
    maxHeight: 1024,
    surfaceOnly: true,
    anatomyMutationAllowed: false,
    topologyMutationAllowed: false,
    geometryDisplacementAllowed: false,
  };
}

function request(): SurfacePaintRequest {
  return {
    schemaVersion: "sovereign-surface-paint-request/1.0",
    requestId: "surface-paint://anthro/base-color/1990",
    grant: grant(),
    channel: "baseColor",
    modelId: "anything-v5-q4_0.gguf",
    prompt: "clean anime fox fur, orange and cream, UV texture, no lighting",
    negativePrompt: "body shape, anatomy change, extra limbs, text, shadow",
    guideImage: {
      assetRef: "asset://anthro/uv-layout-guide.png",
      digest: sha256Hex(PNG),
      mimeType: "image/png",
      purpose: "uv-layout-guide",
    },
    projectionMode: "uv-space-img2img",
    seed: 1990,
    steps: 16,
    width: 512,
    height: 512,
    cfgScale: 7,
    denoisingStrength: 0.45,
    sampler: "Euler a",
    surfaceOnly: true,
    anatomyMutationAllowed: false,
    topologyMutationAllowed: false,
    geometryDisplacementAllowed: false,
  };
}

function skin(): SkinLayer {
  const reference = {
    assetRef: "asset://anthro/placeholder.png",
    digest: PLACEHOLDER,
    mimeType: "image/png",
    colorSpace: "srgb",
  } as const;
  return {
    schemaVersion: "sovereign-skin-layer/1.0",
    id: "anthro-whole-body-skin-v1",
    version: "1.0.0",
    bodyCoverage: "whole-body",
    rigId: "anthro-standard-v1",
    sculptDocumentId: "anthro-sculpt-v1",
    topologyDigest: TOPOLOGY,
    uvDigest: UV,
    materialRegions: [{ id: "body", sculptRegionId: "body", materialId: "anime-body" }],
    textureChannels: {
      baseColor: reference,
      celShade: { ...reference, assetRef: "asset://anthro/cel.png" },
      normalDetail: { ...reference, assetRef: "asset://anthro/normal.png", colorSpace: "linear" },
      roughness: { ...reference, assetRef: "asset://anthro/roughness.png", colorSpace: "linear" },
    },
    generationProvenance: {
      method: "operator-authored",
      generatorId: "fixture",
      generatorVersion: "1.0.0",
      authorityRef: "authority://creator/jon",
      rightsRef: "rights://original-anthro-character",
      inputDigests: [TOPOLOGY, UV],
    },
    surfaceOnly: true,
    anatomyMutationAllowed: false,
  };
}

describe("governed AI surface boundary", () => {
  it("accepts a deterministic UV-space request and hashes it canonically", () => {
    const value = request();
    assert.equal(validateSurfacePaintRequest(value).ok, true);
    assert.equal(surfacePaintRequestDigest(value), surfacePaintRequestDigest(request()));
  });

  it("rejects models, channels, limits, and mutations outside the grant", () => {
    const unsafe = {
      ...request(),
      channel: "displacement",
      modelId: "unapproved-model.gguf",
      steps: 99,
      anatomyMutationAllowed: true,
    } as unknown as SurfacePaintRequest;
    const codes = validateSurfacePaintRequest(unsafe).issues.map((entry) => entry.code);
    assert.ok(codes.includes("channel-not-authorized"));
    assert.ok(codes.includes("model-not-authorized"));
    assert.ok(codes.includes("steps"));
    assert.ok(codes.includes("request-policy"));
  });

  it("sends only image-to-image pixels to the local SD-GGUF service", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};
    const fakeFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ images: [Buffer.from(PNG).toString("base64")] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const painter = new StableDiffusionCppSurfacePainter({ fetch: fakeFetch });
    const result = await painter.generate(request(), PNG);
    assert.equal(capturedUrl, "http://127.0.0.1:13306/sdapi/v1/img2img");
    assert.equal(Array.isArray(capturedBody.init_images), true);
    assert.equal("vertices" in capturedBody, false);
    assert.equal("mesh" in capturedBody, false);
    assert.equal(result.evidence.outputDigest, sha256Hex(PNG));
    assert.equal(result.evidence.generatorId, SME_SURFACE_PAINTER_ID);
    assert.equal(result.evidence.anatomyMutationAllowed, false);
  });

  it("refuses an unsealed guide before contacting the model", async () => {
    let called = false;
    const fakeFetch: typeof fetch = async () => {
      called = true;
      throw new Error("should not be called");
    };
    const painter = new StableDiffusionCppSurfacePainter({ fetch: fakeFetch });
    const differentPng = new Uint8Array([...PNG, 0]);
    await assert.rejects(() => painter.generate(request(), differentPng), /guide digest/);
    assert.equal(called, false);
  });

  it("binds the generated texture while preserving all anatomy digests", async () => {
    const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
      images: [Buffer.from(PNG).toString("base64")],
    }), { status: 200, headers: { "content-type": "application/json" } });
    const result = await new StableDiffusionCppSurfacePainter({ fetch: fakeFetch }).generate(request(), PNG);
    const original = skin();
    const updated = applySurfacePaintResultToSkinLayer(original, result, "asset://anthro/generated/base-color.png");
    assert.equal(validateSkinLayer(updated).ok, true);
    assert.equal(updated.rigId, original.rigId);
    assert.equal(updated.sculptDocumentId, original.sculptDocumentId);
    assert.equal(updated.topologyDigest, original.topologyDigest);
    assert.equal(updated.uvDigest, original.uvDigest);
    assert.equal(updated.textureChannels.baseColor.digest, sha256Hex(PNG));
    assert.equal(updated.generationProvenance.generatorId, SME_SURFACE_PAINTER_ID);
    assert.equal(updated.anatomyMutationAllowed, false);
  });

  it("keeps remote endpoints opt-in to protect unpublished character art", () => {
    assert.throws(
      () => new StableDiffusionCppSurfacePainter({ baseUrl: "https://example.com" }),
      /allowRemote:true/,
    );
  });
});
