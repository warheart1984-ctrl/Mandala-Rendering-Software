/**
 * Plan limit gate — fail-closed.
 * Status: **partial** (allotment checks only; no live subscription sync).
 */
import { PlanIdSchema } from "./types.js";
import { monthlyCreditAllotment } from "./plans.js";

/**
 * Assert proposed credits fit within remaining plan allotment.
 * Fail-closed: unknown plan, negative/NaN credits, or overflow → throw.
 *
 * @param {string} userId
 * @param {string} planId
 * @param {number} proposedCredits
 * @param {number} [alreadyUsed=0]
 * @returns {{ ok: true; remaining: number; allotment: number; userId: string; planId: string }}
 */
export function assertWithinPlanLimits(
  userId,
  planId,
  proposedCredits,
  alreadyUsed = 0,
) {
  if (typeof userId !== "string" || userId.length === 0) {
    const err = new Error("PLAN_DENY: userId required");
    err.code = "PLAN_DENY";
    throw err;
  }

  const parsedPlan = PlanIdSchema.safeParse(planId);
  if (!parsedPlan.success) {
    const err = new Error(`PLAN_DENY: unknown planId=${planId}`);
    err.code = "PLAN_DENY";
    throw err;
  }

  if (
    typeof proposedCredits !== "number" ||
    !Number.isFinite(proposedCredits) ||
    proposedCredits < 0 ||
    !Number.isInteger(proposedCredits)
  ) {
    const err = new Error("PLAN_DENY: proposedCredits must be a non-negative integer");
    err.code = "PLAN_DENY";
    throw err;
  }

  if (
    typeof alreadyUsed !== "number" ||
    !Number.isFinite(alreadyUsed) ||
    alreadyUsed < 0
  ) {
    const err = new Error("PLAN_DENY: alreadyUsed must be a non-negative number");
    err.code = "PLAN_DENY";
    throw err;
  }

  const allotment = monthlyCreditAllotment(parsedPlan.data);
  const remaining = allotment - alreadyUsed;

  if (proposedCredits > remaining) {
    const err = new Error(
      `PLAN_DENY: user=${userId} plan=${parsedPlan.data} proposed=${proposedCredits} remaining=${remaining} allotment=${allotment}`,
    );
    err.code = "PLAN_DENY";
    err.details = {
      userId,
      planId: parsedPlan.data,
      proposedCredits,
      alreadyUsed,
      remaining,
      allotment,
    };
    throw err;
  }

  return {
    ok: true,
    remaining: remaining - proposedCredits,
    allotment,
    userId,
    planId: parsedPlan.data,
  };
}
