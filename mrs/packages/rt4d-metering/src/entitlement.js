/**
 * Entitlement decision recording — plan gate with durable decision shape.
 * Status: **partial** (no live IdP / subscription sync).
 */
import { EntitlementDecisionSchema, PlanIdSchema } from "./types.js";
import { assertWithinPlanLimits } from "./planGate.js";

/**
 * @typedef {import("zod").infer<typeof EntitlementDecisionSchema>} EntitlementDecision
 */

/**
 * Decide entitlement and return a structured audit record (never throws for deny).
 *
 * @param {{
 *   userId: string;
 *   tenantId: string;
 *   planId: string;
 *   renderId: string;
 *   proposedCredits: number;
 *   alreadyUsed?: number;
 *   at?: string;
 * }} input
 * @returns {EntitlementDecision}
 */
export function decideEntitlement(input) {
  const at = input.at ?? new Date().toISOString();
  const tenantId =
    typeof input.tenantId === "string" && input.tenantId.length > 0
      ? input.tenantId
      : "default";

  const planParsed = PlanIdSchema.safeParse(input.planId);
  if (!planParsed.success) {
    return EntitlementDecisionSchema.parse({
      userId: input.userId || "unknown",
      tenantId,
      planId: "free",
      renderId: input.renderId,
      allowed: false,
      reason: `PLAN_DENY: unknown planId=${input.planId}`,
      creditsUsed: 0,
      at,
    });
  }

  try {
    assertWithinPlanLimits(
      input.userId,
      planParsed.data,
      input.proposedCredits,
      input.alreadyUsed ?? 0,
    );
    return EntitlementDecisionSchema.parse({
      userId: input.userId,
      tenantId,
      planId: planParsed.data,
      renderId: input.renderId,
      allowed: true,
      reason: "within_allotment",
      creditsUsed: input.proposedCredits,
      at,
    });
  } catch (err) {
    return EntitlementDecisionSchema.parse({
      userId: input.userId || "unknown",
      tenantId,
      planId: planParsed.data,
      renderId: input.renderId,
      allowed: false,
      reason: err?.message ?? "PLAN_DENY",
      creditsUsed: 0,
      at,
    });
  }
}
