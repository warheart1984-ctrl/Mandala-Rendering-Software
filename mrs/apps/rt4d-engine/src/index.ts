// @mrs/rt4d-engine HTTP server — status: live
// Deterministic render service wrapping @mrs/renderer-core. All render randomness
// derives from the seed passed in the render body (P4 replayable reality).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import {
  upsertScene,
  getScene,
  getReceipt,
  patchScene,
  putReceipt,
  listReceipts,
  deriveRenderKey,
  type SceneSpec,
  type SceneRecord,
  type RenderReceipt,
} from "./store.js";
import { renderScene, computeGeometry, computeProjectionHash, resolveOrderedParams, validateSceneSpec, type RenderParams } from "./renderer.js";
import { createRt4dEvidenceEnvelope, type Rt4dEvidenceEnvelope } from "./evidence/rt4dEvidenceEnvelope.js";
import { maybeEmitMetering } from "./meteringEmit.js";

export const DEFAULT_PORT = 8020;

export type StatusTag = "live" | "skeleton" | "declared" | "partial";

export type Envelope<T = unknown> = {
  ok: boolean;
  statusTag: StatusTag;
  data: T | null;
  error: { code: string; message: string } | null;
  requestId: string;
  at: string;
};

let requestCounter = 0;
let runCounter = 0;

function envelope<T>(partial: {
  ok?: boolean;
  statusTag: StatusTag;
  data?: T | null;
  error?: { code: string; message: string } | null;
}): Envelope<T> {
  requestCounter += 1;
  return {
    ok: partial.ok ?? (partial.statusTag === "live" ? true : false),
    statusTag: partial.statusTag,
    data: partial.data ?? null,
    error: partial.error ?? null,
    requestId: `req-${requestCounter}`,
    at: new Date().toISOString(),
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const SCENE_ROUTE = /^\/v1\/scenes\/([^/]+)$/;
const RENDER_ROUTE = /^\/v1\/scenes\/([^/]+)\/render$/;
const PROVENANCE_ROUTE = /^\/v1\/scenes\/([^/]+)\/provenance$/;
const GEOMETRY_ROUTE = /^\/v1\/scenes\/([^/]+)\/geometry$/;
const EXPORT_ROUTE = /^\/v1\/scenes\/([^/]+)\/export$/;

function isSceneSpec(body: unknown): body is SceneSpec {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const s = body as Record<string, unknown>;
  return (
    typeof s.surface === "string" &&
    Number.isFinite(s.resolution) &&
    Array.isArray(s.rotations) &&
    typeof s.projection === "object" &&
    typeof s.camera === "object"
  );
}

function buildEvidence(
  sceneId: string,
  record: { spec: SceneSpec; provenance: SceneRecord["provenance"] },
  receipt: RenderReceipt,
): Rt4dEvidenceEnvelope {
  return createRt4dEvidenceEnvelope(
    {
      sceneId,
      spec: record.spec,
      provenance: record.provenance,
    },
    receipt,
  );
}

export function createEngineServer(): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const method = req.method ?? "GET";
      const body = method === "POST" || method === "PATCH" ? await readJsonBody(req) : null;

      if (method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, envelope({ statusTag: "live", data: { service: "@mrs/rt4d-engine" } }));
        return;
      }

      if (method === "POST" && url.pathname === "/v1/scenes") {
        if (!isSceneSpec(body)) {
          sendJson(res, 400, envelope({ statusTag: "declared", error: { code: "INVALID_SCENE_SPEC", message: "body must be a SceneSpec" } }));
          return;
        }
        const spec = body as SceneSpec;
        spec.camera.lensRadius = 0;
        try {
          validateSceneSpec(spec);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendJson(res, 400, envelope({ statusTag: "declared", error: { code: "CAPABILITY_UNSUPPORTED", message: msg } }));
          return;
        }
        const { sceneId, sceneHash } = upsertScene(spec);
        sendJson(res, 200, envelope<{ sceneId: string; sceneHash: string }>({ statusTag: "live", data: { sceneId, sceneHash } }));
        return;
      }

      const sceneMatch = SCENE_ROUTE.exec(url.pathname);
      if (sceneMatch) {
        const sceneId = sceneMatch[1];
        if (method === "GET") {
          const record = getScene(sceneId);
          if (!record) {
            sendJson(res, 404, envelope({ statusTag: "declared", error: { code: "SCENE_NOT_FOUND", message: `no scene ${sceneId}` } }));
            return;
          }
          sendJson(res, 200, envelope<{ sceneId: string; spec: SceneSpec }>({ statusTag: "live", data: { sceneId, spec: record.spec } }));
          return;
        }
        if (method === "PATCH") {
          const record = patchScene(sceneId, (body ?? {}) as Partial<SceneSpec>);
          if (!record) {
            sendJson(res, 404, envelope({ statusTag: "declared", error: { code: "SCENE_NOT_FOUND", message: `no scene ${sceneId}` } }));
            return;
          }
          sendJson(res, 200, envelope<{ sceneId: string; patched: boolean; sceneHash: string }>({ statusTag: "live", data: { sceneId, patched: true, sceneHash: record.sceneHash } }));
          return;
        }
      }

      const renderMatch = RENDER_ROUTE.exec(url.pathname);
      if (method === "POST" && renderMatch) {
        const sceneId = renderMatch[1];
        const record = getScene(sceneId);
        if (!record) {
          sendJson(res, 404, envelope({ statusTag: "declared", error: { code: "SCENE_NOT_FOUND", message: `no scene ${sceneId}` } }));
          return;
        }
        const params = (body ?? {}) as RenderParams;
        if (params.seed === undefined) {
          sendJson(res, 400, envelope<{ sceneId: string; renderReceipt: RenderReceipt | null }>({ statusTag: "declared", error: { code: "MISSING_SEED", message: "render body must include a numeric seed for deterministic replay" } }));
          return;
        }
        const orderedParams = resolveOrderedParams(params);
        const renderKey = deriveRenderKey(record.sceneHash, orderedParams);
        const cached = getReceipt(sceneId, renderKey);
        if (cached) {
          const hitReceipt: RenderReceipt = { ...cached, cached: true };
          const hitEvidence = buildEvidence(sceneId, record, hitReceipt);
          maybeEmitMetering({
            req,
            receipt: hitReceipt,
            evidence: hitEvidence,
          });
          sendJson(
            res,
            200,
            envelope<{
              sceneId: string;
              renderKey: string;
              renderReceipt: RenderReceipt;
              pngBase64: string;
              evidence: Rt4dEvidenceEnvelope;
              renderId: string;
              projectionHash: string;
              pixelHash: string;
              pngHash: string;
              runtimeFingerprint: RenderReceipt["runtimeFingerprint"];
            }>({
              statusTag: "live",
              data: {
                sceneId,
                renderKey,
                renderReceipt: hitReceipt,
                pngBase64: cached.pngBase64 ?? "",
                evidence: hitEvidence,
                renderId: cached.renderId,
                projectionHash: cached.projectionHash,
                pixelHash: cached.pixelHash,
                pngHash: cached.sha256,
                runtimeFingerprint: cached.runtimeFingerprint,
              },
            }),
          );
          return;
        }

        const result = await renderScene(record.spec, params, record.sceneHash);
        runCounter += 1;
        const projectionHash = computeProjectionHash(
          record.spec,
          params,
          orderedParams,
        );
        const receipt: RenderReceipt = {
          runId: `run-${runCounter}`,
          renderKey,
          sha256: result.sha256,
          pixelHash: result.pixelHash,
          renderId: result.renderId,
          projectionHash,
          runtimeFingerprint: result.runtimeFingerprint,
          renderParameters: orderedParams,
          cached: false,
          at: new Date().toISOString(),
          pngBase64: result.png.toString("base64"),
        };
        putReceipt(sceneId, renderKey, receipt);
        const evidence = buildEvidence(sceneId, record, receipt);
        maybeEmitMetering({
          req,
          receipt,
          evidence,
          pngByteLength: result.png.length,
        });
        sendJson(
          res,
          200,
          envelope<{
            sceneId: string;
            renderKey: string;
            renderReceipt: RenderReceipt;
            pngBase64: string;
            evidence: Rt4dEvidenceEnvelope;
            renderId: string;
            projectionHash: string;
            pixelHash: string;
            pngHash: string;
            runtimeFingerprint: RenderReceipt["runtimeFingerprint"];
          }>({
            statusTag: "live",
            data: {
              sceneId,
              renderKey,
              renderReceipt: receipt,
              pngBase64: receipt.pngBase64!,
              evidence,
              renderId: receipt.renderId,
              projectionHash: receipt.projectionHash,
              pixelHash: receipt.pixelHash,
              pngHash: receipt.sha256,
              runtimeFingerprint: receipt.runtimeFingerprint,
            },
          }),
        );
        return;
      }

      const provenanceMatch = PROVENANCE_ROUTE.exec(url.pathname);
      if (method === "GET" && provenanceMatch) {
        const sceneId = provenanceMatch[1];
        const record = getScene(sceneId);
        if (!record) {
          sendJson(res, 404, envelope({ statusTag: "declared", error: { code: "SCENE_NOT_FOUND", message: `no scene ${sceneId}` } }));
          return;
        }
        sendJson(res, 200, envelope<{ sceneId: string; receipts: RenderReceipt[] }>({ statusTag: "live", data: { sceneId, receipts: listReceipts(sceneId) } }));
        return;
      }

      const geometryMatch = GEOMETRY_ROUTE.exec(url.pathname);
      if (method === "GET" && geometryMatch) {
        const sceneId = geometryMatch[1];
        const record = getScene(sceneId);
        if (!record) {
          sendJson(res, 404, envelope({ statusTag: "declared", error: { code: "SCENE_NOT_FOUND", message: `no scene ${sceneId}` } }));
          return;
        }
        const geometry = computeGeometry(record.spec, {});
        sendJson(res, 200, envelope<{ sceneId: string; geometry: unknown }>({ statusTag: "live", data: { sceneId, geometry } }));
        return;
      }

      const exportMatch = EXPORT_ROUTE.exec(url.pathname);
      if (method === "GET" && exportMatch) {
        sendJson(res, 501, envelope({ statusTag: "declared", data: null, error: { code: "DECLARED_501", message: "export pipeline is declared-only in this scaffold" } }));
        return;
      }

      sendJson(res, 404, envelope({ statusTag: "declared", data: null, error: { code: "NOT_FOUND", message: `no route ${method} ${url.pathname}` } }));
    } catch (err) {
      sendJson(res, 400, envelope({ statusTag: "declared", data: null, error: { code: "BAD_REQUEST", message: String(err) } }));
    }
  });
}

export function main(): void {
  const port = Number(process.env.RT4D_ENGINE_PORT ?? DEFAULT_PORT);
  const server = createEngineServer();
  server.listen(port, () => {
    console.log(`@mrs/rt4d-engine listening on http://localhost:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
