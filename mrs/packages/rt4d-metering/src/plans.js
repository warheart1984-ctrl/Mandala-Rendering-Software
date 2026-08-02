/**
 * Plan catalogs and credit allotments.
 * Status: **declared** (pricing product intent; not live Stripe/Chargebee billing).
 * No "unlimited" tiers.
 */

/** @typedef {import("./types.js").PlanId} PlanId — free|creator|pro|studio via PlanIdSchema */

/**
 * Monthly included credits by plan (declared allotments for gate tests).
 * @type {Readonly<Record<string, { monthlyCredits: number; label: string; features: string[] }>>}
 */
export const PLAN_CATALOG = Object.freeze({
  free: {
    monthlyCredits: 50,
    label: "Free",
    features: [
      "limited previews",
      "watermarked",
      "basic RT3D",
      "small RT4D effects",
    ],
  },
  creator: {
    monthlyCredits: 500,
    label: "Creator",
    features: [
      "monthly subscription",
      "included credits",
      "HD",
      "persistent characters/scenes",
      "commercial-use",
    ],
  },
  pro: {
    monthlyCredits: 2500,
    label: "Pro",
    features: [
      "more credits",
      "longer animation",
      "advanced RT4D",
      "faster queue",
      "Unity/Unreal export",
      "full provenance bundles",
    ],
  },
  studio: {
    monthlyCredits: 10000,
    label: "Studio",
    features: [
      "multi-user",
      "shared projects",
      "approval workflows",
      "API",
      "priority render",
      "larger storage/credit pool",
    ],
  },
});

/**
 * @param {string} planId
 * @returns {number}
 */
export function monthlyCreditAllotment(planId) {
  const plan = PLAN_CATALOG[planId];
  if (!plan) {
    const err = new Error(`UNKNOWN_PLAN: ${planId}`);
    err.code = "UNKNOWN_PLAN";
    throw err;
  }
  return plan.monthlyCredits;
}
