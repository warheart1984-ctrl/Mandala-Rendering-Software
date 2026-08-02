/**
 * Soft emit hook for engine → metering.
 * Status: **partial** — opt-in via RT4D_METERING_EMIT=1; never throws into render path.
 *
 * Pricing must consume verified usage records; this helper only translates a
 * verified receipt into a ledger row when identity headers/context are present.
 */
import { InMemoryLedger } from "./ledger.js";

/** Process-local default ledger for soft emit (dev/scaffold). */
const defaultLedger = new InMemoryLedger();

/**
 * @returns {InMemoryLedger}
 */
export function getDefaultSoftEmitLedger() {
  return defaultLedger;
}

/**
 * @param {{
 *   userId?: string;
 *   planId?: string;
 *   engineReceipt: unknown;
 *   ledger?: InMemoryLedger;
 *   env?: NodeJS.ProcessEnv;
 * }} opts
 * @returns {{ emitted: boolean; reason?: string; duplicate?: boolean; usage?: unknown }}
 */
export function softEmitUsage(opts) {
  const env = opts.env ?? process.env;
  if (env.RT4D_METERING_EMIT !== "1") {
    return { emitted: false, reason: "flag_off" };
  }

  const userId = opts.userId;
  const planId = opts.planId ?? "free";
  if (!userId) {
    return { emitted: false, reason: "missing_userId" };
  }

  try {
    const ledger = opts.ledger ?? defaultLedger;
    const result = ledger.recordUsageFromReceipt({
      userId,
      planId,
      engineReceipt: opts.engineReceipt,
    });
    return {
      emitted: true,
      duplicate: result.duplicate,
      usage: result.usage,
    };
  } catch (err) {
    return {
      emitted: false,
      reason: err?.code ?? "emit_error",
    };
  }
}
