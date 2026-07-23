/**
 * Load B2 / S3-compatible config from environment.
 * Prefer B2_* vars; fall back to AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY aliases.
 *
 * Status: declared / operator-configured — secrets must never be committed.
 */

/**
 * @typedef {object} B2Config
 * @property {string} keyId
 * @property {string} applicationKey
 * @property {string} bucket
 * @property {string} region
 * @property {string} endpoint
 * @property {boolean} forcePathStyle
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isB2Configured(env = process.env) {
  const keyId = env.B2_KEY_ID || env.AWS_ACCESS_KEY_ID;
  const secret = env.B2_APPLICATION_KEY || env.AWS_SECRET_ACCESS_KEY;
  const bucket = env.B2_BUCKET;
  const region = env.B2_REGION;
  return Boolean(keyId && secret && bucket && region);
}

/**
 * Build endpoint URL. HTTPS only.
 * @param {string} region
 * @param {string} [explicit]
 * @returns {string}
 */
export function resolveEndpoint(region, explicit) {
  if (explicit) {
    if (!explicit.startsWith("https://")) {
      throw new Error("B2_ENDPOINT must use HTTPS (https://s3.<region>.backblazeb2.com)");
    }
    return explicit.replace(/\/$/, "");
  }
  if (!region) {
    throw new Error("B2_REGION is required to derive endpoint");
  }
  return `https://s3.${region}.backblazeb2.com`;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {B2Config}
 */
export function loadB2Config(env = process.env) {
  const keyId = env.B2_KEY_ID || env.AWS_ACCESS_KEY_ID;
  const applicationKey = env.B2_APPLICATION_KEY || env.AWS_SECRET_ACCESS_KEY;
  const bucket = env.B2_BUCKET;
  const region = env.B2_REGION;

  if (!keyId || !applicationKey) {
    throw new Error(
      "Missing credentials: set B2_KEY_ID + B2_APPLICATION_KEY (or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY)"
    );
  }
  if (!bucket) {
    throw new Error("Missing B2_BUCKET");
  }
  if (!region) {
    throw new Error("Missing B2_REGION (e.g. us-west-004)");
  }

  // Master application key is not supported for S3-compatible API — operators must use a non-master key.
  // We cannot detect master keys reliably from the ID alone; docs warn operators.

  const forcePathStyle =
    env.B2_FORCE_PATH_STYLE === undefined
      ? true
      : env.B2_FORCE_PATH_STYLE === "1" || env.B2_FORCE_PATH_STYLE.toLowerCase() === "true";

  return {
    keyId,
    applicationKey,
    bucket,
    region,
    endpoint: resolveEndpoint(region, env.B2_ENDPOINT),
    forcePathStyle,
  };
}
