import { assertFiniteDeep, canonicalJson, sha256Canonical } from "./canonical.js";
import type { GlbIntegrityDigests, SculptGlbBundle } from "./glb.js";
import { assertValidGlb } from "./glb.js";
import { validateSkinLayer } from "./rigs.js";
import type {
  CharacterRigSchema,
  GenderMetadata,
  SkinLayer,
  SkinTextureChannels,
  SculptDocument,
  Species,
} from "./types.js";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const APPROVED_SKIN_CHANNELS = [
  "baseColor",
  "celShade",
  "normalDetail",
  "roughness",
  "fur",
  "marking",
  "opacity",
] as const;

export type ApprovedSkinChannel = (typeof APPROVED_SKIN_CHANNELS)[number];

/** Public compatibility name for the shared governed SkinLayer contract. */
export type WholeBodySkinLayer = SkinLayer;

export interface SkinLayerBindingContext {
  readonly rigId: string;
  readonly sculptDocumentId: string;
  readonly topologyDigest: string;
  readonly uvDigest: string;
}

export interface ConstitutionalValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface ConstitutionalValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ConstitutionalValidationIssue[];
}

export interface ConstitutionalCharacterDigests {
  readonly speciesDigest: string;
  readonly genderDigest: string;
  readonly rigVersionDigest: string;
  readonly meshDigest: string;
  readonly topologyDigest: string;
  readonly vertexOrderDigest: string;
  readonly uvDigest: string;
  readonly armatureDigest: string;
  readonly blendshapeDigest: string;
  readonly materialDigest: string;
  readonly glbDigest: string;
  readonly sourceDigest: string;
  readonly documentDigest: string;
  readonly rigDigest: string;
  readonly skinDigest: string;
  readonly textureDigest: string;
}

export interface DiffusionPolishPolicy {
  readonly purpose: "surface-polish-only";
  readonly anatomyMutationAllowed: false;
  readonly topologyMutationAllowed: false;
  readonly geometryDisplacementAllowed: false;
  readonly runtimeRetopologyAllowed: false;
}

export const DIFFUSION_POLISH_ONLY_POLICY: DiffusionPolishPolicy = Object.freeze({
  purpose: "surface-polish-only",
  anatomyMutationAllowed: false,
  topologyMutationAllowed: false,
  geometryDisplacementAllowed: false,
  runtimeRetopologyAllowed: false,
});

export interface ConstitutionalCharacterRecord {
  readonly schemaVersion: "sovereign-character-constitutional/1.0";
  readonly status: "core-enforced-fixture-not-production-character";
  readonly characterId: string;
  readonly sculptDocumentId: string;
  readonly rigId: string;
  readonly species: Species;
  readonly genderMetadata: GenderMetadata;
  readonly rigVersion: CharacterRigSchema["schemaVersion"];
  readonly topology: {
    readonly state: "locked";
    readonly revision: number;
    readonly parentTopologyDigest?: string;
  };
  readonly digests: ConstitutionalCharacterDigests;
  readonly skinLayers: readonly WholeBodySkinLayer[];
  readonly skinLayerDigests: readonly string[];
  readonly diffusionPolicy: DiffusionPolishPolicy;
  readonly recordDigest: string;
}

export interface CreateConstitutionalRecordInput {
  readonly document: SculptDocument;
  readonly rig: CharacterRigSchema;
  readonly bundle: SculptGlbBundle;
  readonly skinLayers?: readonly WholeBodySkinLayer[];
  /** Optional upstream governed source hash; the bundle source hash is the default. */
  readonly sourceSha256?: string;
}

export interface VerifyConstitutionalRecordContext {
  readonly document: SculptDocument;
  readonly rig: CharacterRigSchema;
  readonly bundle: SculptGlbBundle;
  readonly sourceSha256?: string;
}

function issue(code: string, message: string, path?: string): ConstitutionalValidationIssue {
  return path ? { code, message, path } : { code, message };
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

export function validateWholeBodySkinLayer(
  layer: WholeBodySkinLayer,
  context: SkinLayerBindingContext,
): ConstitutionalValidationResult {
  const issues: ConstitutionalValidationIssue[] = validateSkinLayer(layer).issues.map((entry) => ({
    ...entry,
    ...(entry.code === "geometry-channel-forbidden" ? { code: "skin-channel-unapproved" } : {}),
  }));
  if (layer.rigId !== context.rigId) {
    issues.push(issue("skin-rig-mismatch", "skin layer is bound to a different rig", "rigId"));
  }
  if (layer.sculptDocumentId !== context.sculptDocumentId) {
    issues.push(issue("skin-document-mismatch", "skin layer is bound to a different sculpt document", "sculptDocumentId"));
  }
  if (layer.topologyDigest !== context.topologyDigest) {
    issues.push(issue("skin-topology-mismatch", "skin layer topology digest does not match", "topologyDigest"));
  }
  if (layer.uvDigest !== context.uvDigest) {
    issues.push(issue("skin-uv-mismatch", "skin layer UV digest does not match", "uvDigest"));
  }
  if (layer.anatomyMutationAllowed !== false) {
    issues.push(issue("skin-anatomy-mutation", "skin layer cannot mutate anatomy", "anatomyMutationAllowed"));
  }
  if (layer.surfaceOnly !== true) {
    issues.push(issue("skin-not-surface-only", "skin layer must be surface-only", "surfaceOnly"));
  }
  const channels = layer.textureChannels as SkinTextureChannels & Record<string, unknown>;
  for (const [name, reference] of Object.entries(channels)) {
    if (!APPROVED_SKIN_CHANNELS.includes(name as ApprovedSkinChannel)) {
      issues.push(issue("skin-channel-unapproved", `unapproved skin channel ${name}`, `textureChannels.${name}`));
      continue;
    }
    const digest = (reference as { readonly digest?: unknown }).digest;
    if (!isSha256(digest)) {
      issues.push(issue("invalid-sha256", "texture asset must be bound by lowercase SHA256", `textureChannels.${name}.digest`));
    }
  }

  return { ok: issues.length === 0, issues };
}

export function assertValidWholeBodySkinLayer(
  layer: WholeBodySkinLayer,
  context: SkinLayerBindingContext,
): void {
  const result = validateWholeBodySkinLayer(layer, context);
  if (!result.ok) {
    throw new Error(`invalid whole-body skin layer: ${result.issues.map((entry) => entry.code).join(", ")}`);
  }
}

function mapGlbDigests(
  document: SculptDocument,
  rig: CharacterRigSchema,
  sourceSha256: string,
  glbDigests: GlbIntegrityDigests,
  skinLayers: readonly WholeBodySkinLayer[],
): ConstitutionalCharacterDigests {
  const textureRefs = skinLayers.flatMap((layer) =>
    Object.entries(layer.textureChannels).map(([channel, reference]) => ({
      skinLayerId: layer.id,
      channel,
      assetSha256: reference.digest,
    })),
  );
  return {
    speciesDigest: sha256Canonical(document.species),
    genderDigest: sha256Canonical(document.identity.gender),
    rigVersionDigest: sha256Canonical(rig.schemaVersion),
    meshDigest: glbDigests.meshSha256,
    topologyDigest: glbDigests.topologySha256,
    vertexOrderDigest: glbDigests.vertexOrderSha256,
    uvDigest: glbDigests.uvSha256,
    armatureDigest: glbDigests.armatureSha256,
    blendshapeDigest: glbDigests.blendshapeSha256,
    materialDigest: glbDigests.materialSha256,
    glbDigest: glbDigests.glbSha256,
    sourceDigest: sourceSha256,
    documentDigest: sha256Canonical(document),
    rigDigest: sha256Canonical(rig),
    skinDigest: sha256Canonical(skinLayers),
    textureDigest: sha256Canonical(textureRefs),
  };
}

function withoutRecordDigest(
  record: ConstitutionalCharacterRecord,
): Omit<ConstitutionalCharacterRecord, "recordDigest"> {
  const { recordDigest: _recordDigest, ...body } = record;
  return body;
}

export function constitutionalRecordDigest(record: ConstitutionalCharacterRecord): string {
  return sha256Canonical(withoutRecordDigest(record));
}

export function createConstitutionalCharacterRecord(
  input: CreateConstitutionalRecordInput,
): ConstitutionalCharacterRecord {
  const { document, rig, bundle } = input;
  if (document.id !== bundle.fixture.document.id || rig.id !== bundle.fixture.rig.id) {
    throw new Error("constitutional inputs do not reference the GLB fixture documents");
  }
  if (document.species !== rig.species || document.species !== bundle.inspection.species) {
    throw new Error("constitutional species mismatch");
  }
  if (bundle.fixture.documentSha256 !== sha256Canonical(document)) {
    throw new Error("sculpt document digest does not match GLB fixture");
  }
  if (bundle.fixture.rigSha256 !== sha256Canonical(rig)) {
    throw new Error("rig digest does not match GLB fixture");
  }
  const inspection = assertValidGlb(bundle.glb, {
    profile: document.species,
    expectedDigests: bundle.inspection.digests,
  });
  const sourceSha256 = input.sourceSha256 ?? bundle.fixture.sourceSha256;
  if (!isSha256(sourceSha256)) throw new Error("sourceSha256 must be lowercase SHA256");
  const skinLayers = [...(input.skinLayers ?? [])];
  const skinContext: SkinLayerBindingContext = {
    rigId: rig.id,
    sculptDocumentId: document.id,
    topologyDigest: inspection.digests.topologySha256,
    uvDigest: inspection.digests.uvSha256,
  };
  const seenSkinIds = new Set<string>();
  for (const layer of skinLayers) {
    if (seenSkinIds.has(layer.id)) throw new Error(`duplicate skin layer ${layer.id}`);
    seenSkinIds.add(layer.id);
    assertValidWholeBodySkinLayer(layer, skinContext);
  }
  const digests = mapGlbDigests(document, rig, sourceSha256, inspection.digests, skinLayers);
  const body: Omit<ConstitutionalCharacterRecord, "recordDigest"> = {
    schemaVersion: "sovereign-character-constitutional/1.0",
    status: "core-enforced-fixture-not-production-character",
    characterId: document.identity.id,
    sculptDocumentId: document.id,
    rigId: rig.id,
    species: document.species,
    genderMetadata: document.identity.gender,
    rigVersion: rig.schemaVersion,
    topology: {
      state: "locked",
      revision: document.topologyRevision,
      ...(document.parentTopologyDigest ? { parentTopologyDigest: document.parentTopologyDigest } : {}),
    },
    digests,
    skinLayers,
    skinLayerDigests: skinLayers.map((layer) => sha256Canonical(layer)),
    diffusionPolicy: DIFFUSION_POLISH_ONLY_POLICY,
  };
  return { ...body, recordDigest: sha256Canonical(body) };
}

export function verifyConstitutionalCharacterRecord(
  record: ConstitutionalCharacterRecord,
  context?: VerifyConstitutionalRecordContext,
): ConstitutionalValidationResult {
  const issues: ConstitutionalValidationIssue[] = [];
  try {
    assertFiniteDeep(record);
  } catch (error) {
    issues.push(issue("non-finite", (error as Error).message));
  }
  if (record.schemaVersion !== "sovereign-character-constitutional/1.0") {
    issues.push(issue("record-schema-version", "unsupported constitutional record schema", "schemaVersion"));
  }
  if (record.status !== "core-enforced-fixture-not-production-character") {
    issues.push(issue("record-status", "record must disclose non-production fixture status", "status"));
  }
  if (!record.topology || record.topology.state !== "locked") {
    issues.push(issue("topology-not-locked", "constitutional records require locked topology", "topology.state"));
  }
  if (!record.topology || !Number.isInteger(record.topology.revision) || record.topology.revision < 0) {
    issues.push(issue("topology-revision", "topology revision must be a nonnegative integer", "topology.revision"));
  }
  if (record.topology?.parentTopologyDigest !== undefined && !isSha256(record.topology.parentTopologyDigest)) {
    issues.push(issue("invalid-sha256", "parent topology digest is not lowercase SHA256", "topology.parentTopologyDigest"));
  }
  if (record.diffusionPolicy.anatomyMutationAllowed !== false ||
      record.diffusionPolicy.topologyMutationAllowed !== false ||
      record.diffusionPolicy.geometryDisplacementAllowed !== false ||
      record.diffusionPolicy.runtimeRetopologyAllowed !== false ||
      record.diffusionPolicy.purpose !== "surface-polish-only") {
    issues.push(issue("diffusion-policy", "diffusion must remain surface-polish-only", "diffusionPolicy"));
  }
  for (const [name, digest] of Object.entries(record.digests)) {
    if (!isSha256(digest)) issues.push(issue("invalid-sha256", `${name} is not lowercase SHA256`, `digests.${name}`));
  }
  if (record.skinLayerDigests.length !== record.skinLayers.length) {
    issues.push(issue("skin-digest-count", "skin layer digest count does not match", "skinLayerDigests"));
  }
  record.skinLayers.forEach((layer, index) => {
    const expected = record.skinLayerDigests[index];
    if (expected !== sha256Canonical(layer)) {
      issues.push(issue("skin-digest-mismatch", "skin layer content digest does not match", `skinLayerDigests[${index}]`));
    }
    const result = validateWholeBodySkinLayer(layer, {
      rigId: record.rigId,
      sculptDocumentId: record.sculptDocumentId,
      topologyDigest: record.digests.topologyDigest,
      uvDigest: record.digests.uvDigest,
    });
    issues.push(...result.issues.map((entry) => ({
      ...entry,
      path: entry.path ? `skinLayers[${index}].${entry.path}` : `skinLayers[${index}]`,
    })));
  });
  if (record.recordDigest !== constitutionalRecordDigest(record)) {
    issues.push(issue("record-digest-mismatch", "constitutional record digest does not match", "recordDigest"));
  }

  if (context) {
    try {
      const expected = createConstitutionalCharacterRecord({
        ...context,
        skinLayers: record.skinLayers,
      });
      const fields: readonly (keyof ConstitutionalCharacterRecord)[] = [
        "characterId", "sculptDocumentId", "rigId", "species", "genderMetadata",
        "rigVersion", "topology", "digests", "skinLayers", "skinLayerDigests", "diffusionPolicy",
        "recordDigest",
      ];
      for (const field of fields) {
        if (canonicalJson(record[field]) !== canonicalJson(expected[field])) {
          issues.push(issue("record-context-mismatch", `${field} does not match source context`, String(field)));
        }
      }
    } catch (error) {
      issues.push(issue("record-context-invalid", (error as Error).message));
    }
  }
  return { ok: issues.length === 0, issues };
}

export function assertConstitutionalCharacterRecord(
  record: ConstitutionalCharacterRecord,
  context?: VerifyConstitutionalRecordContext,
): void {
  const result = verifyConstitutionalCharacterRecord(record, context);
  if (!result.ok) {
    throw new Error(`invalid constitutional character record: ${result.issues.map((entry) => entry.code).join(", ")}`);
  }
}

export const createConstitutionalRecord = createConstitutionalCharacterRecord;
export const verifyConstitutionalRecord = verifyConstitutionalCharacterRecord;
