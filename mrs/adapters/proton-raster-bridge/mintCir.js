/**
 * mintCir — thin CIR overlay from IntentRecord-like input.
 *
 * STATUS: **enforced**
 *
 * CIR fields only: id, actor, timestamp, purpose ← goal/type.
 * No parallel governance.
 *
 * When `seed` is provided, id is deterministic from purpose+actor+seed (P4 tests).
 * Otherwise uses crypto.randomUUID() if id missing.
 */

import { createHash, randomUUID } from "node:crypto";

/**
 * @param {Record<string, unknown>} [intentOrPartial]
 * @returns {{ id: string, actor: string, timestamp: string, purpose: string, status: string }}
 */
export function mintCir(intentOrPartial = {}) {
  const src = intentOrPartial && typeof intentOrPartial === "object" ? intentOrPartial : {};
  const purpose =
    (typeof src.purpose === "string" && src.purpose) ||
    (typeof src.goal === "string" && src.goal) ||
    (typeof src.type === "string" && src.type) ||
    "proton-raster";
  const actor =
    typeof src.actor === "string" && src.actor.length > 0
      ? src.actor
      : "mrs.proton-raster";

  let id;
  if (typeof src.id === "string" && src.id.length > 0) {
    id = src.id;
  } else if (src.seed != null) {
    id = createHash("sha256")
      .update(`cir|${purpose}|${actor}|${String(src.seed)}`)
      .digest("hex")
      .slice(0, 32);
  } else {
    id = randomUUID();
  }

  const timestamp =
    src.timestamp != null
      ? /** @type {string|number} */ (src.timestamp)
      : new Date().toISOString();

  return {
    id,
    actor,
    timestamp: typeof timestamp === "string" ? timestamp : String(timestamp),
    purpose,
    status: "enforced",
  };
}
