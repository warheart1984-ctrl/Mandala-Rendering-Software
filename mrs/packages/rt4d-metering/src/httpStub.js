/**
 * Thin HTTP API stub for metering.
 * Status: **partial** — local library surface only; not production billing.
 *
 * POST /v1/usage/meter  { userId, planId, engineReceipt }
 * GET  /health
 */
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { InMemoryLedger } from "./ledger.js";

const ledger = new InMemoryLedger();
const port = Number(process.env.RT4D_METERING_PORT ?? 8091);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function createMeteringStubServer(options = {}) {
  const activeLedger = options.ledger ?? ledger;
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        statusTag: "partial",
        service: "@mrs/rt4d-metering",
        billing: "not_live",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/usage/meter") {
      try {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        const result = activeLedger.recordUsageFromReceipt({
          userId: body.userId,
          planId: body.planId,
          engineReceipt: body.engineReceipt,
        });
        sendJson(res, result.duplicate ? 200 : 201, {
          statusTag: "partial",
          duplicate: result.duplicate,
          usage: result.usage,
          ledgerEntry: result.ledgerEntry,
        });
      } catch (err) {
        const code = err?.code ?? "METER_ERROR";
        const status = code === "PLAN_DENY" || code === "ENGINE_EVIDENCE_INCOMPLETE" ? 403 : 400;
        sendJson(res, status, {
          statusTag: "partial",
          error: { code, message: String(err?.message ?? err) },
        });
      }
      return;
    }

    sendJson(res, 404, { error: { code: "NOT_FOUND", message: "unknown route" } });
  });
}

const isMain =
  process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const server = createMeteringStubServer();
  server.listen(port, "127.0.0.1", () => {
    // eslint-disable-next-line no-console
    console.log(`@mrs/rt4d-metering stub listening on http://127.0.0.1:${port} (partial)`);
  });
}
