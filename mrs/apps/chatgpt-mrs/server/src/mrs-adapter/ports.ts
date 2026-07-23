/**
 * Live-link / inspector port constants.
 *
 * Evidence from repo:
 * - LiveLinkServer default: 9487 (`packages/renderer-core/src/live-link/LiveLinkServer.js`)
 * - Inspector WS helper default: 9490 (`scripts/inspector-ws-server.mjs`)
 *
 * Override via env — do not hardcode the wrong port in call sites.
 */
export const LIVELINK_DEFAULT_PORT = 9487;
export const INSPECTOR_WS_DEFAULT_PORT = 9490;

export function resolveLiveLinkPort(): number {
  const raw = process.env.MRS_LIVELINK_PORT ?? process.env.LIVELINK_PORT;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return LIVELINK_DEFAULT_PORT;
}

export function resolveLiveLinkUrl(): string {
  const host = process.env.MRS_LIVELINK_HOST ?? "127.0.0.1";
  return process.env.MRS_LIVELINK_URL ?? `ws://${host}:${resolveLiveLinkPort()}`;
}
