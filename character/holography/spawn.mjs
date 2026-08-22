/**
 * Public spawn contract — Creature Boundary Signature (partial).
 *
 * Creature = information pattern, not geometry.
 * spawn(signature) applies entanglement / curvature / tension / governance bias
 * onto a procedural chamber lattice — no traditional mesh (GLB) load.
 *
 * Status: **partial** synthetic informational creature layer.
 * NOT “living constitutional ecosystem” / “holographic biology” as enforced.
 * Foundation of governed biological universe = **declared** aspiration.
 */

import { createHash } from "node:crypto";
import {
  getTemplate,
  instantiateTemplate,
  MYTHAR_HUMANOID_TEMPLATE,
  CREATURE_TEMPLATE_STATUS,
  LIVING_SPECIES_SYSTEM_STATUS,
} from "./creature-template.mjs";
import {
  createIndividual,
  GENUS_BIPEDAL,
  SPECIES_MYTHAR_HUMANOID,
  TAXONOMY_STATUS,
  FULL_SPECIES_SYSTEM_STATUS,
} from "./taxonomy.mjs";
import { synthesizeAnatomyFromBoundary } from "./anatomy-synthesis.mjs";
import { runConstitutionalLoop } from "./constitutional-motion.mjs";

export const SPAWN_STATUS = "partial";
export const GOVERNED_BIO_UNIVERSE_STATUS = "declared";

export const CREATURE_CONTRACT = Object.freeze({
  version: 1,
  status: SPAWN_STATUS,
  aspiration: GOVERNED_BIO_UNIVERSE_STATUS,
  pillars: Object.freeze([
    Object.freeze({
      id: "creature-boundary-signature",
      meaning: "creature = information pattern (E profile, K map, tension ρ, gov bias), not mesh geometry",
      status: "partial",
    }),
    Object.freeze({
      id: "constitutional-motion-primitives",
      meaning: "motion = Intent→Evidence→Conformance→Stewardship state evolution updating E,ρ,K,positions,CIEMS trace",
      status: "partial",
      primitives: Object.freeze({ breathe: "partial", reach: "partial", walk: "partial" }),
    }),
    Object.freeze({
      id: "holographic-species-taxonomy",
      meaning: "Genus → Species → Individual with signature envelope, anatomy rules, repertoire, gov archetype",
      status: "partial",
      fullSystem: "declared",
    }),
  ]),
  claim:
    "Synthetic informational creature layer (partial) — not living constitutional ecosystem / holographic biology enforced",
});

/**
 * Normalize a spawn input into a full signature document.
 * @param {string|object} signatureOrTemplateId
 */
export function normalizeSignature(signatureOrTemplateId, opts = {}) {
  if (typeof signatureOrTemplateId === "string") {
    const template = getTemplate(signatureOrTemplateId);
    return {
      templateId: template.id,
      genus: template.genus,
      species: template.species,
      entanglementProfile: {
        spineBoost: template.boundarySignature.spineEntanglementBoost,
        ...opts.entanglementProfile,
      },
      curvatureMap: {
        jointBoost: template.boundarySignature.jointCurvatureBoost,
        ...opts.curvatureMap,
      },
      tensionFields: {
        torsoBreathFlow: template.boundarySignature.torsoBreathFlow,
        facialMicroZones: template.boundarySignature.facialMicroZones,
        ...opts.tensionFields,
      },
      governanceBias: { ...template.governanceProfile, ...opts.governanceBias },
      bulkRules: template.bulkRules,
      behavioralFlows: template.behavioralFlows,
      boundarySignature: template.boundarySignature,
    };
  }

  const base = signatureOrTemplateId.templateId
    ? getTemplate(signatureOrTemplateId.templateId)
    : MYTHAR_HUMANOID_TEMPLATE;

  return {
    templateId: base.id,
    genus: signatureOrTemplateId.genus || base.genus,
    species: signatureOrTemplateId.species || base.species,
    entanglementProfile: {
      spineBoost: base.boundarySignature.spineEntanglementBoost,
      ...signatureOrTemplateId.entanglementProfile,
    },
    curvatureMap: {
      jointBoost: base.boundarySignature.jointCurvatureBoost,
      ...signatureOrTemplateId.curvatureMap,
    },
    tensionFields: {
      torsoBreathFlow: base.boundarySignature.torsoBreathFlow,
      facialMicroZones: base.boundarySignature.facialMicroZones,
      ...signatureOrTemplateId.tensionFields,
    },
    governanceBias: {
      ...base.governanceProfile,
      ...signatureOrTemplateId.governanceBias,
    },
    bulkRules: { ...base.bulkRules, ...signatureOrTemplateId.bulkRules },
    behavioralFlows: {
      ...base.behavioralFlows,
      ...signatureOrTemplateId.behavioralFlows,
    },
    boundarySignature: {
      ...base.boundarySignature,
      ...(signatureOrTemplateId.boundarySignature || {}),
      spineEntanglementBoost:
        signatureOrTemplateId.entanglementProfile?.spineBoost ??
        base.boundarySignature.spineEntanglementBoost,
      jointCurvatureBoost:
        signatureOrTemplateId.curvatureMap?.jointBoost ??
        base.boundarySignature.jointCurvatureBoost,
      torsoBreathFlow:
        signatureOrTemplateId.tensionFields?.torsoBreathFlow ??
        base.boundarySignature.torsoBreathFlow,
    },
  };
}

/**
 * spawn(signature) — golden-path entry.
 * Applies Creature Boundary Signature to procedural chamber lattice.
 * No traditional mesh / GLB load.
 *
 * @param {string|object} signatureOrTemplateId — e.g. 'mythar-humanoid' or signature object
 * @param {{ individualId?: string, synthesizeBulk?: boolean, primitive?: string|null, frames?: number }} [opts]
 */
export function spawn(signatureOrTemplateId, opts = {}) {
  const signature = normalizeSignature(signatureOrTemplateId, opts);
  const individualId = opts.individualId || "indiv-0";
  const individual = createIndividual(signature.species || "mythar-humanoid", {
    id: individualId,
    breathAmp: signature.behavioralFlows?.breathe?.amp,
    reachAmp: signature.behavioralFlows?.reach?.amp,
  });

  // Procedural boundary only — instantiateTemplate → buildCharacterAsset (no GLB)
  const inst = instantiateTemplate(signature.templateId, {
    individualId,
    synthesizeBulk: opts.synthesizeBulk !== false,
    assetOpts: opts.assetOpts,
  });

  // Re-assert signature fields on receipt surface
  inst.signature = signature;
  inst.contract = CREATURE_CONTRACT;
  inst.taxonomy = {
    genus: signature.genus || GENUS_BIPEDAL.id,
    species: signature.species || SPECIES_MYTHAR_HUMANOID.id,
    individual,
    status: TAXONOMY_STATUS,
    fullSpeciesSystem: FULL_SPECIES_SYSTEM_STATUS,
  };

  let motion = null;
  const primitive = opts.primitive ?? null;
  if (primitive) {
    motion = runConstitutionalLoop(inst.egt, primitive, opts.frames ?? 6, {
      flow: {
        ...(inst.behavioralFlows[primitive] || {}),
        centralOnly: primitive === "breathe",
        requireArm: primitive === "reach",
      },
      amp:
        primitive === "breathe"
          ? individual.params.breathAmp
          : individual.params.reachAmp,
    });
  }

  const bulk =
    inst.bulk ||
    (opts.synthesizeBulk !== false
      ? synthesizeAnatomyFromBoundary(inst.egt)
      : null);

  const fingerprint = createHash("sha256")
    .update("creature.spawn.v1")
    .update(signature.templateId)
    .update(individualId)
    .update(inst.fingerprint)
    .digest("hex");

  return {
    status: SPAWN_STATUS,
    contract: CREATURE_CONTRACT,
    claim: CREATURE_CONTRACT.claim,
    meshLoad: false,
    meshNote: "Procedural chamber lattice from signature — no traditional GLB/mesh asset load",
    signature,
    taxonomy: inst.taxonomy,
    egt: inst.egt,
    governance: inst.governance,
    bulk,
    motion,
    primitive: primitive || null,
    fingerprint,
    livingConstitutionalEcosystem: "declared",
    holographicBiology: "declared",
    creatureTemplateStatus: CREATURE_TEMPLATE_STATUS,
    livingSpeciesSystem: LIVING_SPECIES_SYSTEM_STATUS,
  };
}

/** Convenience: Mythar under bipedal genus. */
export function spawnMythar(opts = {}) {
  return spawn("mythar-humanoid", opts);
}
