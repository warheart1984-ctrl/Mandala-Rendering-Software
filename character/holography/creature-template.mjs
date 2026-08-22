/**
 * Holographic creature templates (partial).
 *
 * Template = boundary signature + bulk reconstruction rules
 *          + behavioral flow fields + governance profile.
 *
 * instantiateTemplate('mythar-humanoid') builds procedural boundary EGT/rig
 * without loading a traditional GLB.
 *
 * Status: **partial** demos. Full living species system = **declared**.
 */

import { createHash } from "node:crypto";
import { buildCharacterAsset } from "../models/character.mjs";
import { buildSkinEGT, recomputeCurvature, DEFAULT_ALPHA, DEFAULT_BETA } from "./skin-egt.mjs";
import { annotateBodyLayers } from "./full-body.mjs";
import { enrichWithRigCiems } from "./rig-ciems.mjs";
import { synthesizeAnatomyFromBoundary } from "./anatomy-synthesis.mjs";

export const CREATURE_TEMPLATE_STATUS = "partial";
export const LIVING_SPECIES_SYSTEM_STATUS = "declared";

/**
 * Mythar humanoid boundary signature (procedural params).
 */
export const MYTHAR_HUMANOID_TEMPLATE = Object.freeze({
  id: "mythar-humanoid",
  genus: "bipedal",
  species: "mythar-humanoid",
  status: CREATURE_TEMPLATE_STATUS,
  livingSystem: LIVING_SPECIES_SYSTEM_STATUS,
  claim:
    "Procedural holographic humanoid template — synthetic boundary signature, not living anatomical field",
  boundarySignature: {
    spineEntanglementBoost: 0.18,
    jointCurvatureBoost: 0.22,
    facialMicroZones: true,
    torsoBreathFlow: 0.35,
    heightScale: 1.0,
    shoulderWidth: 1.0,
  },
  bulkRules: {
    muscleAnisoThresh: 0.35,
    boneThresh: 0.4,
    jointThresh: 0.55,
    softThresh: 0.45,
  },
  behavioralFlows: {
    breathe: { torsoYMin: 1.32, torsoYMax: 1.58, amp: 0.12 },
    reach: { armYMin: 1.15, armYMax: 1.55, amp: 0.2 },
    walk: { status: "partial", note: "leg ρ/z wave — not production locomotion" },
    snarl: { status: "stub" },
  },
  governanceProfile: {
    intent: 0.55,
    evidence: 0.5,
    conformance: 0.65, // "no joint inversion" archetype bias
    stewardship: 0.55,
    constraints: {
      noJointInversion: true,
      note: "Soft conformance bias — not CHARTER enforcement",
    },
  },
});

const TEMPLATES = Object.freeze({
  "mythar-humanoid": MYTHAR_HUMANOID_TEMPLATE,
});

export function listTemplates() {
  return Object.keys(TEMPLATES);
}

export function getTemplate(id) {
  const t = TEMPLATES[id];
  if (!t) throw new Error(`Unknown creature template: ${id}`);
  return t;
}

/**
 * Apply Mythar-style boundary signature onto skin EGT (spine / joints / face).
 */
export function applyBoundarySignature(egt, signature, govProfile) {
  const n = egt.nodes.length;
  const spineBoost = signature.spineEntanglementBoost ?? 0.15;
  const jointBoost = signature.jointCurvatureBoost ?? 0.2;
  const breath = signature.torsoBreathFlow ?? 0.3;

  for (const e of egt.edges) {
    const yi = egt.nodes[e.i].position.y;
    const yj = egt.nodes[e.j].position.y;
    const xi = Math.abs(egt.nodes[e.i].position.x);
    const xj = Math.abs(egt.nodes[e.j].position.x);
    const midY = 0.5 * (yi + yj);
    // Spine band: central column
    if (midY > 1.1 && midY < 1.7 && xi < 0.12 && xj < 0.12) {
      e.w_ij = Math.min(1, e.w_ij + spineBoost);
      e.tag = e.tag || "spine";
    }
    // Joint-ish: high bone blend already encoded in ρ — boost mid-limb
    if ((midY > 0.9 && midY < 1.15) || (midY > 1.55 && midY < 1.75)) {
      e.w_ij = Math.min(1, e.w_ij + jointBoost * 0.5);
    }
  }

  for (let i = 0; i < n; i++) {
    const p = egt.nodes[i].position;
    const region = egt.nodes[i].region || "";
    // Torso breath flow baseline on ρ
    if (p.y >= 1.32 && p.y <= 1.58 && Math.abs(p.x) < 0.22) {
      egt.rho[i] = Math.min(1, egt.rho[i] + breath * 0.25);
    }
    // Facial micro-zones (head region)
    if (signature.facialMicroZones && (region === "head" || p.y > 1.72)) {
      egt.rho[i] = Math.min(1, egt.rho[i] + 0.08);
      egt.nodes[i].microZone =
        p.x < -0.05 ? "cheek_L" : p.x > 0.05 ? "cheek_R" : "midface";
    }
    // Governance profile as node prior
    egt.nodes[i].gov = {
      intent: govProfile.intent,
      evidence: govProfile.evidence,
      conformance: govProfile.conformance,
      stewardship: govProfile.stewardship,
    };
  }

  // Soft "no joint inversion": elevate conformance near limb extremes
  if (govProfile.constraints?.noJointInversion) {
    for (let i = 0; i < n; i++) {
      const y = egt.nodes[i].position.y;
      if (y < 0.95 || (y > 1.5 && y < 1.65)) {
        egt.nodes[i].gov.conformance = Math.min(
          1,
          egt.nodes[i].gov.conformance + 0.12,
        );
      }
    }
  }

  recomputeCurvature(egt, {
    alpha: egt.alpha ?? DEFAULT_ALPHA,
    beta: egt.beta ?? DEFAULT_BETA,
  });
  egt.w_sum = Float64Array.from(egt.epsilon);
  return egt;
}

/**
 * Instantiate a template → boundary EGT + rig + optional bulk inference.
 * Deterministic for fixed template id + individual params seed string.
 *
 * @param {string} templateId
 * @param {{ individualId?: string, synthesizeBulk?: boolean, assetOpts?: object }} [opts]
 */
export function instantiateTemplate(templateId, opts = {}) {
  const template = getTemplate(templateId);
  const individualId = opts.individualId || "indiv-0";
  const sig = template.boundarySignature;

  // Procedural humanoid asset — no GLB
  const asset = buildCharacterAsset({
    id: `${template.id}:${individualId}`,
    ...(opts.assetOpts || {}),
  });

  let egt = buildSkinEGT(asset, { t: 0 });
  annotateBodyLayers(egt);
  egt = applyBoundarySignature(egt, sig, template.governanceProfile);
  egt.kind = "creature-boundary-egt";
  egt.templateId = template.id;
  egt.individualId = individualId;
  egt.creatureStatus = CREATURE_TEMPLATE_STATUS;
  egt.livingSpeciesSystem = LIVING_SPECIES_SYSTEM_STATUS;

  const { receipt } = enrichWithRigCiems(egt, {
    gov: template.governanceProfile,
  });

  let bulk = null;
  if (opts.synthesizeBulk !== false) {
    bulk = synthesizeAnatomyFromBoundary(egt, {
      muscle: { seedThresh: template.bulkRules.muscleAnisoThresh, topK: 4 },
      bone: {
        boneThresh: template.bulkRules.boneThresh,
        jointThresh: template.bulkRules.jointThresh,
      },
      soft: { softThresh: template.bulkRules.softThresh },
    });
  }

  const fingerprint = createHash("sha256")
    .update("creature.template.instantiate.v1")
    .update(template.id)
    .update(individualId)
    .update(egt.hash || "")
    .update(String(egt.nodes.length))
    .update(receipt.fingerprint)
    .digest("hex");

  return {
    template,
    asset,
    egt,
    governance: receipt,
    bulk,
    behavioralFlows: template.behavioralFlows,
    fingerprint,
    status: CREATURE_TEMPLATE_STATUS,
    livingSpeciesSystem: LIVING_SPECIES_SYSTEM_STATUS,
  };
}
