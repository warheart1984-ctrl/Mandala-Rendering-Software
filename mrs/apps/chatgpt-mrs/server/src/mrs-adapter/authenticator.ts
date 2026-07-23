/**
 * Engine bridge authenticator — interface + stubs only.
 * Browser-first slice: no production auth claimed.
 */

export interface EngineBridgeAuthenticator {
  /** Returns true when the call may proceed. */
  authorize(context: {
    toolName: string;
    headers?: Record<string, string | string[] | undefined>;
  }): Promise<{ ok: true } | { ok: false; reason: string }>;
}

/** Dev stub — always allows. */
export class DevAuthenticator implements EngineBridgeAuthenticator {
  async authorize(): Promise<{ ok: true }> {
    return { ok: true };
  }
}

/**
 * API-key stub — checks MRS_API_KEY env when set.
 * Declared for future ChatGPT / bridge use; not a full OAuth flow.
 */
export class ApiKeyAuthenticator implements EngineBridgeAuthenticator {
  constructor(private readonly expectedKey = process.env.MRS_API_KEY ?? "") {}

  async authorize(context: {
    toolName: string;
    headers?: Record<string, string | string[] | undefined>;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!this.expectedKey) {
      return {
        ok: false,
        reason: "declared: MRS_API_KEY not configured (ApiKeyAuthenticator stub)",
      };
    }
    const header = context.headers?.["x-mrs-api-key"];
    const value = Array.isArray(header) ? header[0] : header;
    if (value !== this.expectedKey) {
      return { ok: false, reason: "invalid_api_key" };
    }
    return { ok: true };
  }
}

export function createAuthenticator(): EngineBridgeAuthenticator {
  const mode = process.env.MRS_AUTH_MODE ?? "dev";
  if (mode === "api-key") return new ApiKeyAuthenticator();
  return new DevAuthenticator();
}
