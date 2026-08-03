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
  restoreScene,
  type SceneSpec,
  type SceneRecord,
  type RenderReceipt,
} from "./store.js";

// Re-exported so tests import the SAME store module instance the server uses
// (tsx ESM resolves ./store.js and ../src/store.ts to distinct URLs — a test
// that imports store.ts directly would clear a different cache than the server).
export { clearSceneCache } from "./store.js";

import { renderScene, computeGeometry, computeProjectionHash, resolveOrderedParams, validateSceneSpec, type RenderParams } from "./renderer.js";
import { createRt4dEvidenceEnvelope, type Rt4dEvidenceEnvelope, type TraceContextIds } from "./evidence/rt4dEvidenceEnvelope.js";
import { maybeEmitMetering } from "./meteringEmit.js";
import {
  DurableSceneConflictError,
  DurableSceneIntegrityError,
  computeSceneSpecHash,
  durableSceneStore,
  type DurableSceneStore,
} from "./durable-scene-store.js";

export const DEFAULT_PORT = 8020;

export type StatusTag = "live" | "skeleton" | "declared" | "partial";

export type Envelope<T = unknown> = {
  ok: boolean;
  statusTag: StatusTag;
  data: T | null;
  error: { code: string; message: string } | null;
  requestId: string;
  traceId?: string;
  principalId?: string;
  entitlementDecisionId?: string;
  at: string;
};

let requestCounter = 0;
let runCounter = 0;

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return undefined;
}

function resolveTrace(req: IncomingMessage): TraceContextIds & { requestId: string } {
  requestCounter += 1;
  const requestId = headerValue(req, "x-request-id") ?? `req-${requestCounter}`;
  return {
    requestId,
    traceId: headerValue(req, "x-trace-id"),
    principalId: headerValue(req, "x-principal-id"),
    entitlementDecisionId: headerValue(req, "x-entitlement-decision-id"),
  };
}

function envelope<T>(partial: {
  ok?: boolean;
  statusTag: StatusTag;
  data?: T | null;
  error?: { code: string; message: string } | null;
}, trace: TraceContextIds & { requestId: string } = { requestId: "" }): Envelope<T> {
  const requestId = trace.requestId || `req-${requestCounter}`;
  return {
    ok: partial.ok ?? (partial.statusTag === "live" ? true : false),
    statusTag: partial.statusTag,
    data: partial.data ?? null,
    error: partial.error ?? null,
    requestId,
    traceId: trace.traceId,
    principalId: trace.principalId,
    entitlementDecisionId: trace.entitlementDecisionId,
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
  trace: TraceContextIds = {},
  scenePersistence?: ScenePersistence,
): Rt4dEvidenceEnvelope {
  return createRt4dEvidenceEnvelope(
    {
      sceneId,
      spec: record.spec,
      provenance: record.provenance,
    },
    receipt,
    {},
    trace,
    scenePersistence,
  );
}

/** Backward-compatible creation body: raw SceneSpec OR { sceneSpec, promptHash }. */
interface SceneCreateEnvelope {
  sceneSpec: SceneSpec;
  promptHash?: string;
}

function parseSceneCreateBody(
  body: unknown,
): { sceneSpec: SceneSpec; promptHash?: string } | undefined {
  if (isSceneSpec(body)) {
    return { sceneSpec: body };
  }
  if (
    body &&
    typeof body === "object" &&
    "sceneSpec" in body &&
    isSceneSpec((body as SceneCreateEnvelope).sceneSpec)
  ) {
    const input = body as SceneCreateEnvelope;
    return {
      sceneSpec: input.sceneSpec,
      promptHash: typeof input.promptHash === "string" ? input.promptHash : undefined,
    };
  }
  return undefined;
}

export type ScenePersistence = {
  source: "memory" | "dynamodb";
  rehydrated: boolean;
  durable?: boolean;
  sceneSpecHash?: string;
  replayToken?: string;
};

export interface ResolvedScene {
  scene: SceneRecord;
  persistenceSource: "memory" | "dynamodb";
  sceneSpecHash: string;
  replayToken?: string;
}

/**
 * Scene lookup that survives ECS task replacement: in-memory cache hit wins;
 * on a miss, restore from the durable store (DynamoDB) after full verification.
 */
async function resolveScene(
  sceneId: string,
  durableStore: DurableSceneStore,
): Promise<ResolvedScene | undefined> {
  const cached = getScene(sceneId);
  if (cached) {
    return {
      scene: cached,
      persistenceSource: "memory",
      sceneSpecHash: computeSceneSpecHash(cached.spec),
    };
  }

  const durable = await durableStore.loadScene(sceneId);
  if (!durable) return undefined;

  if (!isSceneSpec(durable.sceneSpec)) {
    throw new DurableSceneIntegrityError(
      `Durable SceneSpec failed engine validation for ${sceneId}.`,
    );
  }

  const restored = restoreScene({
    sceneId: durable.sceneId,
    spec: durable.sceneSpec,
    createdAt: durable.createdAt,
    updatedAt: durable.updatedAt,
  });

  return {
    scene: restored,
    persistenceSource: "dynamodb",
    sceneSpecHash: durable.sceneSpecHash,
    replayToken: durable.replayToken,
  };
}

function sendDurableError(
  res: ServerResponse,
  err: unknown,
  trace: TraceContextIds & { requestId: string },
): boolean {
  if (err instanceof DurableSceneIntegrityError) {
    sendJson(res, 409, envelope({ statusTag: "declared", data: null, error: { code: "SCENE_INTEGRITY_ERROR", message: err.message } }, trace));
    return true;
  }
  if (err instanceof DurableSceneConflictError) {
    sendJson(res, 409, envelope({ statusTag: "declared", data: null, error: { code: "SCENE_WRITE_CONFLICT", message: err.message } }, trace));
    return true;
  }
  return false;
}

export function createEngineServer(options: { durableStore?: DurableSceneStore } = {}): Server {
  const durableStore = options.durableStore ?? durableSceneStore;
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const method = req.method ?? "GET";
      const body = method === "POST" || method === "PATCH" ? await readJsonBody(req) : null;
      const trace = resolveTrace(req);

      if (method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, envelope({ statusTag: "live", data: { service: "@mrs/rt4d-engine" } }, trace));
        return;
      }

      if (method === "POST" && url.pathname === "/v1/scenes") {
        const input = parseSceneCreateBody(body);
        if (!input) {
          sendJson(res, 400, envelope({ statusTag: "declared", error: { code: "INVALID_SCENE_SPEC", message: "body must be a SceneSpec or { sceneSpec, promptHash }" } }, trace));
          return;
        }
        const spec = input.sceneSpec;
        spec.camera.lensRadius = 0;
        try {
          validateSceneSpec(spec);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendJson(res, 400, envelope({ statusTag: "declared", error: { code: "CAPABILITY_UNSUPPORTED", message: msg } }, trace));
          return;
        }
        const scene = upsertScene(spec);
        let durable;
        try {
          durable = await durableStore.putCreatedScene(scene, {
            promptHash: input.promptHash,
          });
        } catch (err) {
          if (sendDurableError(res, err, trace)) return;
          sendJson(res, 503, envelope({
            statusTag: "declared",
            data: null,
            error: { code: "SCENE_PERSIST_FAILED", message: `durable persist failed: ${err instanceof Error ? err.message : String(err)}` },
          }, trace));
          return;
        }
        sendJson(res, 200, envelope<{
          sceneId: string;
          sceneHash: string;
          persistence: ScenePersistence;
        }>({
          statusTag: "live",
          data: {
            sceneId: scene.sceneId,
            sceneHash: scene.sceneHash,
            persistence: {
              durable: Boolean(durable),
              source: durable ? "dynamodb" : "memory",
              rehydrated: false,
              sceneSpecHash: durable?.sceneSpecHash ?? computeSceneSpecHash(scene.spec),
              replayToken: durable?.replayToken,
            },
          },
        }, trace));
        return;
      }

      const sceneMatch = SCENE_ROUTE.exec(url.pathname);
      if (sceneMatch) {
        const sceneId = sceneMatch[1];
        if (method === "GET") {
          let resolved: ResolvedScene | undefined;
          try {
            resolved = await resolveScene(sceneId, durableStore);
          } catch (err) {
            if (sendDurableError(res, err, trace)) return;
            throw err;
          }
          if (!resolved) {
            sendJson(res, 404, envelope({ statusTag: "declared", error: { code: "SCENE_NOT_FOUND", message: `no scene ${sceneId}` } }, trace));
            return;
          }
          sendJson(res, 200, envelope<{
            sceneId: string;
            spec: SceneSpec;
            persistence: ScenePersistence;
          }>({
            statusTag: "live",
            data: {
              sceneId,
              spec: resolved.scene.spec,
              persistence: {
                source: resolved.persistenceSource,
                rehydrated: resolved.persistenceSource === "dynamodb",
                sceneSpecHash: resolved.sceneSpecHash,
                replayToken: resolved.replayToken,
              },
            },
          }, trace));
          return;
        }
        if (method === "PATCH") {
          let resolved: ResolvedScene | undefined;
          try {
            resolved = await resolveScene(sceneId, durableStore);
          } catch (err) {
            if (sendDurableError(res, err, trace)) return;
            throw err;
          }
          if (!resolved) {
            sendJson(res, 404, envelope({ statusTag: "declared", error: { code: "SCENE_NOT_FOUND", message: `no scene ${sceneId}` } }, trace));
            return;
          }
          const expectedPreviousHash = computeSceneSpecHash(resolved.scene.spec);
          const patched = patchScene(sceneId, (body ?? {}) as Partial<SceneSpec>);
          if (!patched) {
            sendJson(res, 404, envelope({ statusTag: "declared", error: { code: "SCENE_NOT_FOUND", message: `no scene ${sceneId}` } }, trace));
            return;
          }
          try {
            const durable = await durableStore.updateScene(patched, expectedPreviousHash);
            sendJson(res, 200, envelope<{
              sceneId: string;
              patched: boolean;
              sceneHash: string;
              persistence: ScenePersistence;
            }>({
              statusTag: "live",
              data: {
                sceneId,
                patched: true,
                sceneHash: patched.sceneHash,
                persistence: {
                  durable: Boolean(durable),
                  source: durable ? "dynamodb" : "memory",
                  rehydrated: false,
                  sceneSpecHash: durable?.sceneSpecHash ?? computeSceneSpecHash(patched.spec),
                  replayToken: durable?.replayToken,
                },
              },
            }, trace));
          } catch (err) {
            if (err instanceof DurableSceneConflictError) {
              // Local cache must not retain a mutation that did not become durable.
              try {
                const authoritative = await durableStore.loadScene(sceneId, { includeNonActive: true });
                if (authoritative) {
                  restoreScene({
                    sceneId: authoritative.sceneId,
                    spec: authoritative.sceneSpec,
                    createdAt: authoritative.createdAt,
                    updatedAt: authoritative.updatedAt,
                  });
                }
              } catch {
                // best-effort; the 409 already signals the conflict
              }
              sendJson(res, 409, envelope({ statusTag: "declared", data: null, error: { code: "SCENE_WRITE_CONFLICT", message: err.message } }, trace));
              return;
            }
            if (sendDurableError(res, err, trace)) return;
            throw err;
          }
          return;
        }
      }

      const renderMatch = RENDER_ROUTE.exec(url.pathname);
      if (method === "POST" && renderMatch) {
        const sceneId = renderMatch[1];
        let resolved: ResolvedScene | undefined;
        try {
          resolved = await resolveScene(sceneId, durableStore);
        } catch (err) {
          if (sendDurableError(res, err, trace)) return;
          throw err;
        }
        if (!resolved) {
          sendJson(res, 404, envelope({ statusTag: "declared", error: { code: "SCENE_NOT_FOUND", message: `no scene ${sceneId}` } }, trace));
          return;
        }
        const record = resolved.scene;
        const scenePersistence: ScenePersistence = {
          source: resolved.persistenceSource,
          rehydrated: resolved.persistenceSource === "dynamodb",
          sceneSpecHash: resolved.sceneSpecHash,
          replayToken: resolved.replayToken,
        };
        const params = (body ?? {}) as RenderParams;
        if (params.seed === undefined) {
          sendJson(res, 400, envelope<{ sceneId: string; renderReceipt: RenderReceipt | null }>({ statusTag: "declared", error: { code: "MISSING_SEED", message: "render body must include a numeric seed for deterministic replay" } }, trace));
          return;
        }
        const orderedParams = resolveOrderedParams(params);
        const renderKey = deriveRenderKey(record.sceneHash, orderedParams);
        const cached = getReceipt(sceneId, renderKey);
        if (cached) {
          const hitReceipt: RenderReceipt = { ...cached, cached: true };
          const hitEvidence = buildEvidence(sceneId, record, hitReceipt, trace, scenePersistence);
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
              scenePersistence: ScenePersistence;
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
                scenePersistence,
              },
            }, trace),
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
        const evidence = buildEvidence(sceneId, record, receipt, trace, scenePersistence);
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
              scenePersistence: ScenePersistence;
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
                scenePersistence,
              },
            }, trace),
        );
        return;
      }

      const provenanceMatch = PROVENANCE_ROUTE.exec(url.pathname);
      if (method === "GET" && provenanceMatch) {
        const sceneId = provenanceMatch[1];
        let resolved: ResolvedScene | undefined;
        try {
          resolved = await resolveScene(sceneId, durableStore);
        } catch (err) {
          if (sendDurableError(res, err, trace)) return;
          throw err;
        }
        if (!resolved) {
          sendJson(res, 404, envelope({ statusTag: "declared", error: { code: "SCENE_NOT_FOUND", message: `no scene ${sceneId}` } }, trace));
          return;
        }
        sendJson(res, 200, envelope<{ sceneId: string; receipts: RenderReceipt[] }>({ statusTag: "live", data: { sceneId, receipts: listReceipts(sceneId) } }, trace));
        return;
      }

      const geometryMatch = GEOMETRY_ROUTE.exec(url.pathname);
      if (method === "GET" && geometryMatch) {
        const sceneId = geometryMatch[1];
        let resolved: ResolvedScene | undefined;
        try {
          resolved = await resolveScene(sceneId, durableStore);
        } catch (err) {
          if (sendDurableError(res, err, trace)) return;
          throw err;
        }
        if (!resolved) {
          sendJson(res, 404, envelope({ statusTag: "declared", error: { code: "SCENE_NOT_FOUND", message: `no scene ${sceneId}` } }, trace));
          return;
        }
        const geometry = computeGeometry(resolved.scene.spec, {});
        sendJson(res, 200, envelope<{ sceneId: string; geometry: unknown }>({ statusTag: "live", data: { sceneId, geometry } }, trace));
        return;
      }

      const exportMatch = EXPORT_ROUTE.exec(url.pathname);
      if (method === "GET" && exportMatch) {
        sendJson(res, 501, envelope({ statusTag: "declared", data: null, error: { code: "DECLARED_501", message: "export pipeline is declared-only in this scaffold" } }, trace));
        return;
      }

      sendJson(res, 404, envelope({ statusTag: "declared", data: null, error: { code: "NOT_FOUND", message: `no route ${method} ${url.pathname}` } }, trace));
    } catch (err) {
      sendJson(res, 400, envelope({ statusTag: "declared", data: null, error: { code: "BAD_REQUEST", message: String(err) } }));
    }
  });
}

export function main(): void {
  durableSceneStore.assertReady();
  const port = Number(process.env.RT4D_ENGINE_PORT ?? DEFAULT_PORT);
  const server = createEngineServer();
  server.listen(port, () => {
    console.log(`@mrs/rt4d-engine listening on http://localhost:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
