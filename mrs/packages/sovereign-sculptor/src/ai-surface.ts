import { sha256Canonical, sha256Hex } from "./canonical.js";
import {
  APPROVED_SKIN_CHANNELS,
  assertValidWholeBodySkinLayer,
  type ApprovedSkinChannel,
} from "./constitutional.js";
import { assertValidSkinLayer } from "./rigs.js";
import type { SkinLayer, SkinTextureChannels, SkinTextureReference } from "./types.js";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

export const SME_SURFACE_PAINTER_ID = "sme-gen/stable-diffusion.cpp-surface-painter";
export const DEFAULT_MANDALA_IMAGE_BASE_URL = "http://127.0.0.1:13306";

/**
 * A deliberately narrow SME-style authority grant. It can authorize pixels on
 * an existing UV layout, but there is no geometry output in this contract.
 */
export interface SurfacePaintAuthorityGrant {
  readonly schemaVersion: "sovereign-surface-paint-grant/1.0";
  readonly grantId: string;
  readonly authorityRef: string;
  readonly rightsRef: string;
  readonly rigId: string;
  readonly sculptDocumentId: string;
  readonly topologyDigest: string;
  readonly uvDigest: string;
  readonly allowedChannels: readonly ApprovedSkinChannel[];
  readonly allowedModelIds: readonly string[];
  readonly maxSteps: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly surfaceOnly: true;
  readonly anatomyMutationAllowed: false;
  readonly topologyMutationAllowed: false;
  readonly geometryDisplacementAllowed: false;
}

export interface SurfacePaintGuideImage {
  readonly assetRef: string;
  readonly digest: string;
  readonly mimeType: "image/png";
  readonly purpose: "uv-layout-guide";
}

export interface SurfacePaintRequest {
  readonly schemaVersion: "sovereign-surface-paint-request/1.0";
  readonly requestId: string;
  readonly grant: SurfacePaintAuthorityGrant;
  readonly channel: ApprovedSkinChannel;
  readonly modelId: string;
  readonly prompt: string;
  readonly negativePrompt: string;
  readonly guideImage: SurfacePaintGuideImage;
  readonly projectionMode: "uv-space-img2img";
  readonly seed: number;
  readonly steps: number;
  readonly width: number;
  readonly height: number;
  readonly cfgScale: number;
  readonly denoisingStrength: number;
  readonly sampler: string;
  readonly surfaceOnly: true;
  readonly anatomyMutationAllowed: false;
  readonly topologyMutationAllowed: false;
  readonly geometryDisplacementAllowed: false;
}

export interface SurfacePaintValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface SurfacePaintValidationResult {
  readonly ok: boolean;
  readonly issues: readonly SurfacePaintValidationIssue[];
}

export interface SurfacePaintEvidence {
  readonly schemaVersion: "sovereign-surface-paint-evidence/1.0";
  readonly status: "generated-surface-texture";
  readonly requestId: string;
  readonly requestDigest: string;
  readonly grantId: string;
  readonly authorityRef: string;
  readonly rightsRef: string;
  readonly rigId: string;
  readonly sculptDocumentId: string;
  readonly topologyDigest: string;
  readonly uvDigest: string;
  readonly guideImageDigest: string;
  readonly promptDigest: string;
  readonly outputDigest: string;
  readonly outputMimeType: "image/png";
  readonly channel: ApprovedSkinChannel;
  readonly modelId: string;
  readonly generatorId: typeof SME_SURFACE_PAINTER_ID;
  readonly generatorVersion: "1.0.0";
  readonly serviceEndpoint: string;
  readonly seed: number;
  readonly steps: number;
  readonly width: number;
  readonly height: number;
  readonly surfaceOnly: true;
  readonly anatomyMutationAllowed: false;
  readonly topologyMutationAllowed: false;
  readonly geometryDisplacementAllowed: false;
}

export interface SurfacePaintResult {
  readonly outputPng: Uint8Array;
  readonly evidence: SurfacePaintEvidence;
}

export interface StableDiffusionCppSurfacePainterOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  /** Remote endpoints are opt-in because UV guides can contain private artwork. */
  readonly allowRemote?: boolean;
}

function issue(code: string, message: string, path?: string): SurfacePaintValidationIssue {
  return path ? { code, message, path } : { code, message };
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validateGrant(grant: SurfacePaintAuthorityGrant): SurfacePaintValidationIssue[] {
  const issues: SurfacePaintValidationIssue[] = [];
  if (grant.schemaVersion !== "sovereign-surface-paint-grant/1.0") {
    issues.push(issue("grant-schema-version", "unsupported surface paint grant schema", "grant.schemaVersion"));
  }
  for (const [name, value] of Object.entries({
    grantId: grant.grantId,
    authorityRef: grant.authorityRef,
    rightsRef: grant.rightsRef,
    rigId: grant.rigId,
    sculptDocumentId: grant.sculptDocumentId,
  })) {
    if (typeof value !== "string" || !value.trim()) {
      issues.push(issue("grant-identity", `${name} is required`, `grant.${name}`));
    }
  }
  if (!SHA256_PATTERN.test(grant.topologyDigest)) {
    issues.push(issue("grant-topology-digest", "topologyDigest must be lowercase SHA-256", "grant.topologyDigest"));
  }
  if (!SHA256_PATTERN.test(grant.uvDigest)) {
    issues.push(issue("grant-uv-digest", "uvDigest must be lowercase SHA-256", "grant.uvDigest"));
  }
  const uniqueChannels = new Set(grant.allowedChannels);
  if (!grant.allowedChannels.length || uniqueChannels.size !== grant.allowedChannels.length) {
    issues.push(issue("grant-channels", "allowedChannels must be non-empty and unique", "grant.allowedChannels"));
  }
  for (const channel of grant.allowedChannels) {
    if (!APPROVED_SKIN_CHANNELS.includes(channel)) {
      issues.push(issue("grant-channel-forbidden", `channel ${String(channel)} is not surface-only`, "grant.allowedChannels"));
    }
  }
  if (!grant.allowedModelIds.length || grant.allowedModelIds.some((id) => !id.trim())) {
    issues.push(issue("grant-models", "allowedModelIds must contain named models", "grant.allowedModelIds"));
  }
  if (new Set(grant.allowedModelIds).size !== grant.allowedModelIds.length) {
    issues.push(issue("grant-models", "allowedModelIds must be unique", "grant.allowedModelIds"));
  }
  for (const [name, value, limit] of [
    ["maxSteps", grant.maxSteps, 200],
    ["maxWidth", grant.maxWidth, 4096],
    ["maxHeight", grant.maxHeight, 4096],
  ] as const) {
    if (!isPositiveInteger(value) || value > limit) {
      issues.push(issue("grant-limit", `${name} must be an integer from 1 to ${limit}`, `grant.${name}`));
    }
  }
  if (grant.surfaceOnly !== true || grant.anatomyMutationAllowed !== false
    || grant.topologyMutationAllowed !== false || grant.geometryDisplacementAllowed !== false) {
    issues.push(issue("grant-policy", "the grant must be surface-only and forbid anatomy, topology, and displacement changes", "grant"));
  }
  return issues;
}

/** Validate both the authority envelope and the requested local generation. */
export function validateSurfacePaintRequest(request: SurfacePaintRequest): SurfacePaintValidationResult {
  const issues = validateGrant(request.grant);
  if (request.schemaVersion !== "sovereign-surface-paint-request/1.0") {
    issues.push(issue("request-schema-version", "unsupported surface paint request schema", "schemaVersion"));
  }
  if (!request.requestId?.trim()) issues.push(issue("request-id", "requestId is required", "requestId"));
  if (!request.grant.allowedChannels.includes(request.channel)) {
    issues.push(issue("channel-not-authorized", `channel ${String(request.channel)} is outside the authority grant`, "channel"));
  }
  if (!request.grant.allowedModelIds.includes(request.modelId)) {
    issues.push(issue("model-not-authorized", `model ${request.modelId} is outside the authority grant`, "modelId"));
  }
  if (!request.prompt?.trim()) issues.push(issue("prompt", "a surface description is required", "prompt"));
  if (request.projectionMode !== "uv-space-img2img") {
    issues.push(issue("projection-mode", "surface paint must use the locked UV guide", "projectionMode"));
  }
  if (!request.guideImage?.assetRef?.trim() || request.guideImage.mimeType !== "image/png"
    || request.guideImage.purpose !== "uv-layout-guide" || !SHA256_PATTERN.test(request.guideImage.digest)) {
    issues.push(issue("guide-image", "a content-addressed PNG UV-layout guide is required", "guideImage"));
  }
  if (!Number.isSafeInteger(request.seed)) issues.push(issue("seed", "seed must be a safe integer", "seed"));
  if (!isPositiveInteger(request.steps) || request.steps > request.grant.maxSteps) {
    issues.push(issue("steps", "steps exceed the authority grant", "steps"));
  }
  for (const [name, value, maximum] of [
    ["width", request.width, request.grant.maxWidth],
    ["height", request.height, request.grant.maxHeight],
  ] as const) {
    if (!isPositiveInteger(value) || value > maximum || value % 8 !== 0) {
      issues.push(issue("resolution", `${name} must be a multiple of 8 within the authority grant`, name));
    }
  }
  if (!Number.isFinite(request.cfgScale) || request.cfgScale < 0 || request.cfgScale > 50) {
    issues.push(issue("cfg-scale", "cfgScale must be finite from 0 to 50", "cfgScale"));
  }
  if (!Number.isFinite(request.denoisingStrength)
    || request.denoisingStrength < 0 || request.denoisingStrength > 1) {
    issues.push(issue("denoising-strength", "denoisingStrength must be finite from 0 to 1", "denoisingStrength"));
  }
  if (!request.sampler?.trim()) issues.push(issue("sampler", "sampler is required", "sampler"));
  if (request.surfaceOnly !== true || request.anatomyMutationAllowed !== false
    || request.topologyMutationAllowed !== false || request.geometryDisplacementAllowed !== false) {
    issues.push(issue("request-policy", "the request cannot authorize anatomy, topology, or displacement changes", "request"));
  }
  return { ok: issues.length === 0, issues };
}

export function assertValidSurfacePaintRequest(request: SurfacePaintRequest): void {
  const result = validateSurfacePaintRequest(request);
  if (!result.ok) {
    throw new Error(`invalid surface paint request: ${result.issues.map((entry) => entry.code).join(", ")}`);
  }
}

export function surfacePaintRequestDigest(request: SurfacePaintRequest): string {
  assertValidSurfacePaintRequest(request);
  return sha256Canonical(request);
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length > PNG_SIGNATURE.length
    && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function decodeBase64Png(value: string): Uint8Array {
  const encoded = value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
  const bytes = new Uint8Array(Buffer.from(encoded, "base64"));
  if (!isPng(bytes)) throw new Error("stable-diffusion.cpp did not return a PNG surface texture");
  return bytes;
}

function assertLocalEndpoint(url: URL, allowRemote: boolean): void {
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (!loopback && !allowRemote) {
    throw new Error("remote surface-paint endpoints require allowRemote:true because UV guides may contain private artwork");
  }
}

/** Local SD-GGUF adapter that accepts a UV guide and can return pixels only. */
export class StableDiffusionCppSurfacePainter {
  readonly endpoint: URL;
  readonly fetch: typeof fetch;

  constructor(options: StableDiffusionCppSurfacePainterOptions = {}) {
    const baseUrl = new URL(options.baseUrl ?? DEFAULT_MANDALA_IMAGE_BASE_URL);
    assertLocalEndpoint(baseUrl, options.allowRemote ?? false);
    this.endpoint = new URL("/sdapi/v1/img2img", baseUrl);
    this.fetch = options.fetch ?? globalThis.fetch;
    if (!this.fetch) throw new Error("a Fetch implementation is required");
  }

  async generate(request: SurfacePaintRequest, guidePng: Uint8Array): Promise<SurfacePaintResult> {
    assertValidSurfacePaintRequest(request);
    if (!isPng(guidePng)) throw new Error("surface paint guide must be PNG bytes");
    const guideDigest = sha256Hex(guidePng);
    if (guideDigest !== request.guideImage.digest) {
      throw new Error("surface paint guide digest does not match the governed request");
    }

    const response = await this.fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        init_images: [`data:image/png;base64,${Buffer.from(guidePng).toString("base64")}`],
        prompt: request.prompt,
        negative_prompt: request.negativePrompt,
        seed: request.seed,
        steps: request.steps,
        width: request.width,
        height: request.height,
        cfg_scale: request.cfgScale,
        denoising_strength: request.denoisingStrength,
        sampler_name: request.sampler,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`stable-diffusion.cpp surface paint failed (${response.status}): ${body.slice(0, 500)}`);
    }
    const payload = await response.json() as { readonly images?: readonly unknown[] };
    const encoded = payload.images?.[0];
    if (typeof encoded !== "string") throw new Error("stable-diffusion.cpp returned no surface texture");
    const outputPng = decodeBase64Png(encoded);
    const evidence: SurfacePaintEvidence = {
      schemaVersion: "sovereign-surface-paint-evidence/1.0",
      status: "generated-surface-texture",
      requestId: request.requestId,
      requestDigest: surfacePaintRequestDigest(request),
      grantId: request.grant.grantId,
      authorityRef: request.grant.authorityRef,
      rightsRef: request.grant.rightsRef,
      rigId: request.grant.rigId,
      sculptDocumentId: request.grant.sculptDocumentId,
      topologyDigest: request.grant.topologyDigest,
      uvDigest: request.grant.uvDigest,
      guideImageDigest: guideDigest,
      promptDigest: sha256Hex(request.prompt),
      outputDigest: sha256Hex(outputPng),
      outputMimeType: "image/png",
      channel: request.channel,
      modelId: request.modelId,
      generatorId: SME_SURFACE_PAINTER_ID,
      generatorVersion: "1.0.0",
      serviceEndpoint: this.endpoint.toString(),
      seed: request.seed,
      steps: request.steps,
      width: request.width,
      height: request.height,
      surfaceOnly: true,
      anatomyMutationAllowed: false,
      topologyMutationAllowed: false,
      geometryDisplacementAllowed: false,
    };
    return { outputPng, evidence };
  }
}

function colorSpaceFor(channel: ApprovedSkinChannel): SkinTextureReference["colorSpace"] {
  return channel === "normalDetail" || channel === "roughness" ? "linear" : "srgb";
}

/** Bind generated pixels back to a SkinLayer without changing its anatomy key. */
export function applySurfacePaintResultToSkinLayer(
  layer: SkinLayer,
  result: SurfacePaintResult,
  assetRef: string,
): SkinLayer {
  assertValidSkinLayer(layer);
  if (!assetRef.trim()) throw new Error("surface texture assetRef is required");
  const evidence = result.evidence;
  if (sha256Hex(result.outputPng) !== evidence.outputDigest || !isPng(result.outputPng)) {
    throw new Error("surface paint output does not match its evidence");
  }
  if (layer.rigId !== evidence.rigId || layer.sculptDocumentId !== evidence.sculptDocumentId
    || layer.topologyDigest !== evidence.topologyDigest || layer.uvDigest !== evidence.uvDigest) {
    throw new Error("surface paint evidence does not match the SkinLayer anatomy binding");
  }
  const textureReference: SkinTextureReference = {
    assetRef,
    digest: evidence.outputDigest,
    mimeType: "image/png",
    colorSpace: colorSpaceFor(evidence.channel),
  };
  const textureChannels = {
    ...layer.textureChannels,
    [evidence.channel]: textureReference,
  } as SkinTextureChannels;
  const updated: SkinLayer = {
    ...layer,
    textureChannels,
    generationProvenance: {
      method: "governed-model",
      generatorId: evidence.generatorId,
      generatorVersion: evidence.generatorVersion,
      authorityRef: evidence.authorityRef,
      rightsRef: evidence.rightsRef,
      inputDigests: [evidence.topologyDigest, evidence.uvDigest, evidence.guideImageDigest],
      promptDigest: evidence.promptDigest,
    },
    surfaceOnly: true,
    anatomyMutationAllowed: false,
  };
  assertValidSkinLayer(updated);
  assertValidWholeBodySkinLayer(updated, {
    rigId: layer.rigId,
    sculptDocumentId: layer.sculptDocumentId,
    topologyDigest: layer.topologyDigest,
    uvDigest: layer.uvDigest,
  });
  return updated;
}
