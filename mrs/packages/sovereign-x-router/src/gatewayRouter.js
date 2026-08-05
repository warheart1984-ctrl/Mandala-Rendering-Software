/**
 * Gateway failback router — primary gateway with automatic fallback.
 *
 * Tries the primary gateway first; if it fails (network, timeout, non-2xx)
 * the failure is recorded to a timestamped log file (fresh filename each
 * attempt, so a held log handle never blocks a later attempt) and the
 * request is retried against a fallback gateway.
 *
 * STATUS: **implemented** — pure HTTP POST router, no vendor SDKs.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {object} GatewayConfig
 * @property {string} name gateway display name (e.g. "my-gateway")
 * @property {string} baseUrl base URL, no trailing slash (e.g. "http://localhost:8080")
 * @property {number} timeoutMs per-attempt abort timeout in milliseconds
 */

/**
 * @typedef {object} RouterResult
 * @property {string} gateway name of the gateway that produced the result
 * @property {boolean} ok whether the gateway returned a 2xx JSON response
 * @property {number} status HTTP status (0 when the attempt failed before a response)
 * @property {T} [data] parsed JSON body on success
 * @property {string} [error] error message on failure
 * @template T
 */

/**
 * @param {GatewayConfig} gw
 * @param {string} path request path (e.g. "/render")
 * @param {unknown} payload JSON-serializable request body
 * @returns {Promise<RouterResult<unknown>>}
 */
export async function callGateway(gw, path, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), gw.timeoutMs);

  try {
    const res = await fetch(`${gw.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return {
        gateway: gw.name,
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    return { gateway: gw.name, ok: true, status: res.status, data };
  } catch (err) {
    clearTimeout(timeout);
    return {
      gateway: gw.name,
      ok: false,
      status: 0,
      error: err?.message ?? "unknown error",
    };
  }
}

/**
 * @typedef {object} RouterOptions
 * @property {string} [logDir] directory for failure logs (default: process.cwd())
 * @property {boolean} [logOnFailure] write a timestamped failure log (default: true)
 */

/**
 * @param {string} path
 * @param {unknown} payload
 * @param {GatewayConfig} primary
 * @param {GatewayConfig} fallback
 * @param {RouterOptions} [options]
 * @returns {Promise<RouterResult<unknown>>}
 */
export async function routedRequest(path, payload, primary, fallback, options = {}) {
  const primaryResult = await callGateway(primary, path, payload);
  if (primaryResult.ok) return primaryResult;

  const fallbackResult = await callGateway(fallback, path, payload);

  if (options.logOnFailure !== false) {
    const logDir = options.logDir ?? process.cwd();
    const logFile = join(logDir, `router-log-${Date.now()}.json`);
    try {
      writeFileSync(
        logFile,
        JSON.stringify(
          {
            at: new Date().toISOString(),
            path,
            primary: primaryResult,
            fallback: fallbackResult,
          },
          null,
          2,
        ),
      );
    } catch {
      // Failure logging must never mask the router result.
    }
  }

  return fallbackResult;
}
