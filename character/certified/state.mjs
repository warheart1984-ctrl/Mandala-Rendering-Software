/**
 * CertifiedCharacterState — the single certified source that drives the three
 * visual projections (energy / clay_rig / beauty).
 *
 * DESIGN INTENT (P1/P2): the CPU owns the certified state and every provenance
 * hash. The renderer is a "dumb executor" — it only consumes this state and
 * paints pixels; it never mints lineage. This keeps energy → rig → beauty on a
 * single deterministic hash-chain.
 *
 * STATUS: partial (first increment).
 *   - Certified state fields + deterministic hash-chain: enforced (determinism
 *     test: same seed → identical hashes, see scripts/character-passes.mjs).
 *   - Temporal state CertifiedCharacterState(t): t is carried but only t=0 is
 *     exercised here. Motion history / temporal derivatives: declared.
 *
 * Determinism (P4): pure functions of the asset + seed. No Math.random, no
 * Date.now in any hashed field.
 */
import { createHash } from "node:crypto";

export const CERTIFIED_STATE_VERSION = "0.1.0";
export const GENESIS_HASH = "genesis";

/** sha256 hex of a canonical JSON payload (stable key order via replacer). */
export function sha256Canonical(payload) {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

/** Deterministic JSON with sorted object keys so hashing is order-independent. */
export function canonicalJson(value) {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}

/**
 * Canonical hash of the source mesh (topology). Positions are quantized to a
 * fixed grid so the hash is stable against harmless float re-formatting while
 * still changing whenever the actual topology/shape changes.
 */
export function meshHash(asset) {
  const q = (n) => Math.round(n * 1e6) / 1e6;
  const positions = asset.mesh.positions.map((p) => [q(p[0]), q(p[1]), q(p[2])]);
  return sha256Canonical({
    kind: "canonical-mesh:v1",
    species: asset.species,
    vertexCount: asset.mesh.vertexCount,
    faceCount: asset.mesh.faceCount,
    positions,
    quads: asset.mesh.quads,
    regions: asset.mesh.regions,
  });
}

/** Canonical hash of the rig binding (armature hierarchy + bind pose). */
export function rigHash(asset) {
  const q = (n) => Math.round(n * 1e6) / 1e6;
  const bones = asset.armature.bones.map((b) => ({
    id: b.id,
    parent: b.parent,
    head: b.head.map(q),
    tail: b.tail.map(q),
  }));
  return sha256Canonical({
    kind: "rig-binding:v1",
    bones,
    boneGroups: asset.bones,
  });
}

/** Canonical hash of a pass material spec (no pixels — spec only). */
export function materialHash(spec) {
  return sha256Canonical({ kind: "material-spec:v1", ...spec });
}

/**
 * Build the certified state for a character asset at time t.
 * @param {object} asset  buildCharacterAsset(...) result (read-only)
 * @param {object} opts
 * @param {number} opts.seed          deterministic seed (uint32)
 * @param {number} [opts.t]           certified time index (default 0)
 * @param {object} opts.world         { shape, worldStateHash, digest } from the field builder
 * @param {object} opts.materials     { energy, clay_rig, beauty } material specs
 */
export function buildCertifiedState(asset, opts) {
  const seed = opts.seed >>> 0;
  const t = opts.t ?? 0;
  const world = opts.world;
  const materials = opts.materials;
  return {
    version: CERTIFIED_STATE_VERSION,
    characterId: asset.id,
    species: asset.species,
    t,
    seed,
    status: asset.status,
    meshHash: meshHash(asset),
    rigHash: rigHash(asset),
    world: {
      shape: world.shape,
      seed,
      worldStateHash: world.worldStateHash,
    },
    passes: {
      energy: { materialHash: materialHash(materials.energy), spec: materials.energy },
      clay_rig: { materialHash: materialHash(materials.clay_rig), spec: materials.clay_rig },
      beauty: { materialHash: materialHash(materials.beauty), spec: materials.beauty },
    },
  };
}

/**
 * Produce the provenance record for one stage, chained to its parent stage.
 *
 * The hash-chain is DETERMINISTIC: stageHash_n = sha256( payload_n ) where
 * payload_n embeds parentStageHash_{n-1}. It intentionally does NOT hash the
 * memoryboard record id (a random uuid), so `same seed → identical stageHashes`
 * holds. The ledger record id lineage (parentStageId) is attached separately by
 * the caller as evidence, giving a ledger navigation path without perturbing
 * the cryptographic chain.
 *
 * @param {object} state           buildCertifiedState result
 * @param {"root"|"energy"|"clay_rig"|"beauty"} stage
 * @param {string} parentStageHash the parent stage's stageHash (GENESIS for root)
 */
export function stageProvenance(state, stage, parentStageHash = GENESIS_HASH) {
  const materialHashValue = stage === "root" ? null : state.passes[stage].materialHash;
  const payload = {
    kind: "certified-stage:v1",
    stage,
    characterId: state.characterId,
    species: state.species,
    t: state.t,
    seed: state.seed,
    sourceMeshHash: state.meshHash,
    rigHash: state.rigHash,
    worldStateHash: state.world.worldStateHash,
    materialHash: materialHashValue,
    parentStageHash,
  };
  const stageHash = sha256Canonical(payload);
  return { ...payload, stageHash };
}
