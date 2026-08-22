/**
 * Species taxonomy skeleton (partial) + one species (Mythar humanoid).
 *
 * Genus (bipedal) → Species (Mythar humanoid) → Individual (params)
 *
 * Softens hype: NOT living taxonomy as enforced.
 * Tags: demos **partial**; full species system **declared**.
 */

import { MYTHAR_HUMANOID_TEMPLATE } from "./creature-template.mjs";

export const TAXONOMY_STATUS = "partial";
export const FULL_SPECIES_SYSTEM_STATUS = "declared";

/**
 * Envelope ranges for E/K/ρ on Mythar-like bipeds (soft bounds for audit).
 */
export const BIPEDAL_ENVELOPES = Object.freeze({
  E_norm: { min: 0, max: 4.5, typical: [0.2, 2.0] },
  K_abs: { min: 0, max: 3.0, typical: [0.01, 0.8] },
  rho: { min: 0, max: 1, typical: [0.1, 0.85] },
});

export const GENUS_BIPEDAL = Object.freeze({
  id: "bipedal",
  rank: "genus",
  status: TAXONOMY_STATUS,
  fullSystem: FULL_SPECIES_SYSTEM_STATUS,
  description:
    "Bipedal holographic genus — upright two-limb locomotion repertoire (partial envelope)",
  envelopes: BIPEDAL_ENVELOPES,
  behavioralRepertoire: ["breathe", "reach", "walk", "snarl"],
  governanceArchetype: {
    intent: 0.5,
    evidence: 0.5,
    conformance: 0.55,
    stewardship: 0.5,
  },
});

export const SPECIES_MYTHAR_HUMANOID = Object.freeze({
  id: "mythar-humanoid",
  rank: "species",
  genusId: "bipedal",
  status: TAXONOMY_STATUS,
  fullSystem: FULL_SPECIES_SYSTEM_STATUS,
  templateId: MYTHAR_HUMANOID_TEMPLATE.id,
  description:
    "Mythar humanoid species — spine entanglement, joint curvature, facial micro-zones, torso breath (partial)",
  envelopes: {
    ...BIPEDAL_ENVELOPES,
    E_norm: { min: 0, max: 4.0, typical: [0.25, 1.8] },
    rho: { min: 0, max: 1, typical: [0.15, 0.8] },
  },
  behavioralRepertoire: {
    breathe: "partial",
    reach: "partial",
    walk: "stub",
    snarl: "stub",
  },
  governanceArchetype: {
    ...MYTHAR_HUMANOID_TEMPLATE.governanceProfile,
    name: "no-joint-inversion-soft",
  },
  claim:
    "Synthetic species card — not living taxonomy; full species system declared",
});

/**
 * Individual instance params within species envelope.
 */
export function createIndividual(speciesId, params = {}) {
  if (speciesId !== SPECIES_MYTHAR_HUMANOID.id) {
    throw new Error(`Only mythar-humanoid individuals supported (partial): ${speciesId}`);
  }
  return {
    id: params.id || "indiv-0",
    rank: "individual",
    speciesId,
    genusId: GENUS_BIPEDAL.id,
    params: {
      breathAmp: params.breathAmp ?? 0.12,
      reachAmp: params.reachAmp ?? 0.2,
      stature: params.stature ?? 1.0,
    },
    status: TAXONOMY_STATUS,
    fullSystem: FULL_SPECIES_SYSTEM_STATUS,
  };
}

export function getTaxonomyTree() {
  return {
    status: TAXONOMY_STATUS,
    fullSpeciesSystem: FULL_SPECIES_SYSTEM_STATUS,
    note: "Skeleton taxonomy + one species — not living taxonomy enforcement",
    genus: GENUS_BIPEDAL,
    species: [SPECIES_MYTHAR_HUMANOID],
  };
}

/**
 * Soft envelope check against individual EGT stats.
 */
export function checkEnvelope(egt, species = SPECIES_MYTHAR_HUMANOID) {
  const env = species.envelopes;
  let maxE = 0;
  let maxK = 0;
  let maxRho = 0;
  const norms = egt.E_norms || [];
  for (let i = 0; i < egt.nodes.length; i++) {
    const e = norms[i] ?? egt.nodes[i].E_norm ?? 0;
    if (e > maxE) maxE = e;
    const k = Math.abs(egt.K?.[i] || 0);
    if (k > maxK) maxK = k;
    if (egt.rho[i] > maxRho) maxRho = egt.rho[i];
  }
  const ok =
    maxE <= env.E_norm.max + 1e-6 &&
    maxK <= env.K_abs.max + 1e-6 &&
    maxRho <= env.rho.max + 1e-6;
  return {
    ok,
    maxE,
    maxK,
    maxRho,
    envelopes: env,
    status: TAXONOMY_STATUS,
  };
}
