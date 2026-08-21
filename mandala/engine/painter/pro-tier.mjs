/**
 * AI Painter entitlement — local open by default; SaaS billing dual-key is declared.
 *
 * Local (default, no MANDALA_BILLING_ENFORCE):
 *   Unlock Anything-V5 / adult dramatic when:
 *     AI_PAINTER_UNCENSORED=1  (single opt-in), OR
 *     AI_PAINTER_OPEN=1, OR
 *     localOpen / golden-painter path
 *
 * Billing stub (MANDALA_BILLING_ENFORCE=1) — declared for future SaaS:
 *   Require (MANDALA_PRO_TIER=1 OR AI_PAINTER_PRO=1) AND AI_PAINTER_UNCENSORED=1
 *
 * Legal adult fiction only. Never minors / CSAM.
 */

function envOn(env, name) {
  const v = env?.[name];
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/** Local refusal (single opt-in / open path). */
export const PRO_UNCENSORED_REFUSAL =
  "Uncensored AI Painter denied. Local: set AI_PAINTER_UNCENSORED=1 (or AI_PAINTER_OPEN=1), or run node scripts/golden-painter.mjs. With MANDALA_BILLING_ENFORCE=1: also require MANDALA_PRO_TIER=1|AI_PAINTER_PRO=1.";

/** Dual-key refusal when billing enforce is on. */
export const BILLING_UNCENSORED_REFUSAL =
  "Billing enforce: uncensored AI Painter requires MANDALA_PRO_TIER=1 (or AI_PAINTER_PRO=1) AND AI_PAINTER_UNCENSORED=1.";

/** Safer free-tier models (Lemonade / sd-server). Anything-V5 stays OFF unless unlocked. */
export const FREE_SD_MODELS = ["SD-Turbo", "SD-Turbo-GGUF"];

/** Uncensored preference order on Lemonade :13307. */
export const PRO_UNCENSORED_MODELS = ["Anything-V5", "Anything V5", "anything-v5"];

/** Hardware-safe bounds (RX 580 / 15GB). Never 512/1024. */
export const PAINTER_MAX_EDGE = 128;
export const PAINTER_MIN_EDGE = 64;
export const PAINTER_DEFAULT_EDGE = 64;
export const PAINTER_STEPS = 4;

/** Future SaaS billing stub — when on, dual pro+uncensored is mandatory. */
export function isBillingEnforce(env = process.env) {
  return envOn(env, "MANDALA_BILLING_ENFORCE");
}

/** Pro product entitlement helpers (declared for future billing; optional locally). */
export function isProTierEnv(env = process.env) {
  return envOn(env, "MANDALA_PRO_TIER") || envOn(env, "AI_PAINTER_PRO");
}

/** Explicit uncensored opt-in (local single key, or half of billing dual key). */
export function isUncensoredEnv(env = process.env) {
  return envOn(env, "AI_PAINTER_UNCENSORED");
}

/** Explicit local-open override. */
export function isOpenLocalEnv(env = process.env) {
  return envOn(env, "AI_PAINTER_OPEN");
}

/**
 * Unlock for Anything-V5 / adult dramatic prompts.
 *
 * @param {object} [opts]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {boolean} [opts.cliProUncensored] - advisory only; never unlocks alone
 * @param {boolean} [opts.localOpen] - golden-painter / explicit local open path
 */
export function isProPainterUnlocked({
  env = process.env,
  cliProUncensored = false,
  localOpen = false,
} = {}) {
  void cliProUncensored; /* flag alone never unlocks */
  if (isBillingEnforce(env)) {
    return isProTierEnv(env) && isUncensoredEnv(env);
  }
  /* Local open: single uncensored opt-in, AI_PAINTER_OPEN, or golden localOpen */
  return Boolean(localOpen || isOpenLocalEnv(env) || isUncensoredEnv(env));
}

export function uncensoredDenialReason(env = process.env) {
  return isBillingEnforce(env) ? BILLING_UNCENSORED_REFUSAL : PRO_UNCENSORED_REFUSAL;
}

/**
 * Clamp edge length to 64–128. Rejects 512/1024 silently by clamping.
 */
export function clampPainterEdge(edge = PAINTER_DEFAULT_EDGE) {
  const n = Number(edge) || PAINTER_DEFAULT_EDGE;
  return Math.min(PAINTER_MAX_EDGE, Math.max(PAINTER_MIN_EDGE, Math.round(n)));
}

/**
 * Resolve which backend/models are allowed for this call.
 *
 * @param {object} opts
 * @param {boolean} [opts.requestUncensored] - caller asked for uncensored adult path
 * @param {boolean} [opts.cliProUncensored] - --pro-uncensored-painter was passed
 * @param {boolean} [opts.localOpen] - golden / local-open path
 * @param {string[]} [opts.modelIds] - Lemonade /models ids (optional)
 * @param {NodeJS.ProcessEnv} [opts.env]
 */
export function resolvePainterBackend({
  requestUncensored = false,
  cliProUncensored = false,
  localOpen = false,
  modelIds = [],
  env = process.env,
} = {}) {
  const proTier = isProTierEnv(env);
  const unlocked = isProPainterUnlocked({ env, cliProUncensored, localOpen });
  const wantsUncensored = Boolean(requestUncensored || cliProUncensored || localOpen);
  const dualPro = proTier && isUncensoredEnv(env);
  const edge = clampPainterEdge(Number(env.AI_PAINTER_SIZE) || PAINTER_DEFAULT_EDGE);
  const size = `${edge}x${edge}`;

  if (wantsUncensored && !unlocked) {
    const tier = proTier ? "pro" : "free";
    return {
      allowed: false,
      denied: true,
      tier,
      uncensored: false,
      backend: "denied-uncensored",
      model: null,
      models: FREE_SD_MODELS,
      size,
      steps: PAINTER_STEPS,
      reason: uncensoredDenialReason(env),
      fallThrough: "free-safe",
      logLine: `painter.tier=${tier} uncensored=false model=(denied) reason=missing-entitlement`,
    };
  }

  if (wantsUncensored && unlocked) {
    const picked =
      PRO_UNCENSORED_MODELS.find((id) => modelIds.includes(id)) ||
      modelIds.find((id) => /anything/i.test(id)) ||
      PRO_UNCENSORED_MODELS[0];
    const anythingPresent = modelIds.length === 0 || modelIds.some((id) => /anything/i.test(id));
    const tier = dualPro ? "pro" : "open";
    return {
      allowed: true,
      denied: false,
      tier,
      uncensored: true,
      backend: anythingPresent ? "anything-v5" : "sd-turbo-fallback",
      model: picked,
      models: [...PRO_UNCENSORED_MODELS, ...FREE_SD_MODELS],
      preferAnything: true,
      size,
      steps: PAINTER_STEPS,
      note:
        anythingPresent
          ? null
          : "Anything-V5 not listed on Lemonade; SD-Turbo may still refuse some adult prompts",
      logLine: `painter.tier=${tier} uncensored=true model=${picked}`,
    };
  }

  /* Default free / safer path — Anything-V5 OFF */
  const freeModel =
    FREE_SD_MODELS.find((id) => modelIds.includes(id)) ||
    modelIds.find((id) => /sd-turbo/i.test(id)) ||
    FREE_SD_MODELS[0];
  const tier = proTier ? "pro" : "free";
  return {
    allowed: true,
    denied: false,
    tier,
    uncensored: false,
    backend: "sd-turbo",
    model: freeModel,
    models: FREE_SD_MODELS,
    preferAnything: false,
    size,
    steps: PAINTER_STEPS,
    logLine: `painter.tier=${tier} uncensored=false model=${freeModel}`,
  };
}

/**
 * High-level CSAM / minor sexual-content refusal for theme strings.
 * Legal adult fiction only. Returns { ok:false, reason } when blocked.
 */
export function assertLegalAdultTheme(theme = "") {
  const t = String(theme || "").toLowerCase();
  if (!t.trim()) return { ok: true };
  const blocked =
    /\b(child|children|kid|kids|minor|minors|underage|under[\s-]?age|pedo|paedo|loli|shota|preteen|pre-teen|teen\s*girl|teen\s*boy|schoolgirl|schoolboy)\b/i.test(
      t,
    );
  if (blocked) {
    return {
      ok: false,
      reason: "illegal: sexual/exploitative content involving minors is refused",
    };
  }
  return { ok: true };
}
