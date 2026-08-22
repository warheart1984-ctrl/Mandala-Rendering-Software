/**
 * Tool authorization stub (declared rate-limit; no secrets).
 * Status: partial — local/dev allow; production should wire real auth.
 */

export type AuthContext = {
  toolName: string;
  clientId?: string;
};

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const hits = new Map<string, { count: number; resetAt: number }>();

/**
 * Authorize a tool call. Throws on rate-limit exceed.
 * Declared stub: no API keys; does not log secrets.
 */
export async function authorize(ctx: AuthContext): Promise<void> {
  const key = ctx.clientId ?? "local";
  const now = Date.now();
  let bucket = hits.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    hits.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > MAX_PER_WINDOW) {
    throw new Error(
      `rate limit exceeded (declared stub: ${MAX_PER_WINDOW}/min). Tool=${ctx.toolName}`
    );
  }
}

/** Reset rate-limit state (tests only). */
export function resetRateLimitForTests(): void {
  hits.clear();
}
