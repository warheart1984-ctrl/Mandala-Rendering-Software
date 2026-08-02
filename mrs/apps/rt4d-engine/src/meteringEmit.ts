/**
 * Optional soft emit into @mrs/rt4d-metering after successful render.
 * Status: **partial** — gated by RT4D_METERING_EMIT=1; never fails the render path.
 *
 * See: mrs/packages/rt4d-metering/docs/ENGINE_EMIT_HOOK.md
 */
import type { IncomingMessage } from "node:http";
import type { RenderReceipt } from "./store.js";
import type { Rt4dEvidenceEnvelope } from "./evidence/rt4dEvidenceEnvelope.js";

function headerValue(req: IncomingMessage | undefined, name: string): string | undefined {
  if (!req?.headers) return undefined;
  const raw = req.headers[name];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return undefined;
}

/**
 * Fire-and-forget metering emit. Swallow all errors.
 */
export function maybeEmitMetering(opts: {
  req?: IncomingMessage;
  receipt: RenderReceipt;
  evidence: Rt4dEvidenceEnvelope;
  pngByteLength?: number;
}): void {
  if (process.env.RT4D_METERING_EMIT !== "1") return;

  const userId = headerValue(opts.req, "x-rt4d-user-id");
  const planId = headerValue(opts.req, "x-rt4d-plan-id") ?? "free";
  if (!userId) return;

  const params = opts.receipt.renderParameters ?? {};
  const engineReceipt = {
    renderId: opts.receipt.renderId,
    pixelHash: opts.receipt.pixelHash,
    pngHash: opts.receipt.sha256,
    projectionHash: opts.receipt.projectionHash,
    runtimeFingerprint: opts.receipt.runtimeFingerprint,
    evidenceStatus: opts.evidence.evidenceStatus,
    computeSeconds: typeof params.computeSeconds === "number" ? params.computeSeconds : undefined,
    storageBytes:
      opts.pngByteLength ??
      (typeof opts.receipt.pngBase64 === "string"
        ? Buffer.byteLength(opts.receipt.pngBase64, "base64")
        : undefined),
    width: typeof params.width === "number" ? params.width : undefined,
    height: typeof params.height === "number" ? params.height : undefined,
    samplesPerPixel:
      typeof params.samplesPerPixel === "number" ? params.samplesPerPixel : undefined,
    maxDepth: typeof params.maxDepth === "number" ? params.maxDepth : undefined,
  };

  // Dynamic import keeps cold path light; errors must never surface to HTTP.
  void import("@mrs/rt4d-metering")
    .then((mod) => {
      mod.softEmitUsage({ userId, planId, engineReceipt });
    })
    .catch(() => {
      /* intentional no-op */
    });
}
