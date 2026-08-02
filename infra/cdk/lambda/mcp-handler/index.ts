/**
 * MCP gateway Lambda — HTTPS front door pass-through to RT4D engine HTTP.
 *
 * Honesty:
 * - Fronts the **engine HTTP API**, not a second renderer.
 * - Does **not** recompute scene/pixel/png hashes (engine is sole hash authority).
 * - Redis/S3 helpers are best-effort storage; cache miss falls through to engine.
 *
 * Status: partial / skeleton for full MCP Streamable-HTTP SDK host.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const s3 = new S3Client({});

const RENDERS_BUCKET = process.env.RENDERS_BUCKET || '';
const EVIDENCE_BUCKET = process.env.EVIDENCE_BUCKET || '';
const ENGINE_ALB_DNS = process.env.ENGINE_ALB_DNS || '';
const ENGINE_PORT = process.env.ENGINE_PORT || '8020';

type JsonRpcBody = {
  jsonrpc?: string;
  method?: string;
  params?: Record<string, unknown>;
  id?: string | number | null;
};

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Request-Id',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function structuredLog(fields: Record<string, unknown>): void {
  // Declared contract fields: renderId, failureClass, renderCost, latencyMs
  console.log(JSON.stringify({ level: 'info', ...fields }));
}

async function forwardToEngine(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown; latencyMs: number }> {
  const started = Date.now();
  const url = `http://${ENGINE_ALB_DNS}:${ENGINE_PORT}${path}`;
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const latencyMs = Date.now() - started;
  let json: unknown = null;
  const text = await response.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json, latencyMs };
}

async function putObject(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  if (!bucket) return;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

async function getObject(bucket: string, key: string): Promise<Buffer | null> {
  if (!bucket) return null;
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks: Buffer[] = [];
    if (response.Body) {
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

/** Store PNG/evidence using hashes **provided by the engine** only. */
async function storeEngineArtifacts(enginePayload: Record<string, unknown>): Promise<void> {
  const data = asRecord(enginePayload.data) ?? enginePayload;
  const evidence = asRecord(data.evidence) ?? asRecord(enginePayload.evidence);
  const renderId =
    (typeof data.renderId === 'string' && data.renderId) ||
    (typeof data.sceneId === 'string' && data.sceneId) ||
    (evidence && typeof evidence.sceneId === 'string' && evidence.sceneId) ||
    null;
  const pngSha256 =
    (typeof data.pngSha256 === 'string' && data.pngSha256) ||
    (evidence && typeof evidence.pngSha256 === 'string' && evidence.pngSha256) ||
    null;
  const pngBase64 =
    (typeof data.pngBase64 === 'string' && data.pngBase64) ||
    (typeof data.png === 'string' && data.png) ||
    null;

  if (!renderId) return;

  if (pngBase64 && pngSha256 && RENDERS_BUCKET) {
    const pngBuffer = Buffer.from(pngBase64, 'base64');
    await putObject(
      RENDERS_BUCKET,
      `renders/${renderId}/${pngSha256}.png`,
      pngBuffer,
      'image/png',
    );
  }

  if (evidence && EVIDENCE_BUCKET) {
    const keySuffix = pngSha256 || 'evidence';
    await putObject(
      EVIDENCE_BUCKET,
      `evidence/${renderId}/${keySuffix}.json`,
      Buffer.from(JSON.stringify(evidence), 'utf8'),
      'application/json',
    );
  }
}

async function handleHealth(): Promise<APIGatewayProxyResult> {
  if (!ENGINE_ALB_DNS) {
    return jsonResponse(503, { ok: false, statusTag: 'partial', error: 'ENGINE_ALB_DNS unset' });
  }
  try {
    const result = await forwardToEngine('GET', '/health');
    return jsonResponse(result.status, {
      ok: result.status === 200,
      statusTag: 'partial',
      gateway: 'mcp-handler',
      upstream: result.json,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    structuredLog({
      failureClass: 'upstream_unreachable',
      latencyMs: 0,
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse(502, {
      ok: false,
      statusTag: 'partial',
      error: 'engine unreachable',
    });
  }
}

async function handleRestRender(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = event.body ? JSON.parse(event.body) : {};
  const sceneId =
    (typeof body.sceneId === 'string' && body.sceneId) ||
    `rt4d-scene-proxy`;
  const result = await forwardToEngine('POST', `/v1/scenes/${encodeURIComponent(sceneId)}/render`, body);
  const payload = asRecord(result.json) ?? {};
  try {
    await storeEngineArtifacts(payload);
  } catch (err) {
    structuredLog({
      failureClass: 'artifact_store',
      renderId: typeof payload.renderId === 'string' ? payload.renderId : undefined,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  structuredLog({
    renderId:
      (typeof payload.renderId === 'string' && payload.renderId) ||
      (typeof body.sceneId === 'string' && body.sceneId) ||
      sceneId,
    failureClass: result.status >= 400 ? 'engine_error' : 'none',
    latencyMs: result.latencyMs,
    renderCost: null,
  });
  return jsonResponse(result.status, result.json);
}

async function handleJsonRpc(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  let body: JsonRpcBody;
  try {
    body = event.body ? (JSON.parse(event.body) as JsonRpcBody) : {};
  } catch {
    return jsonResponse(200, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
  }

  const requestId = body.id ?? null;
  const method = body.method || 'render';
  const params = body.params || {};

  if (method === 'render' || method === 'tools/call') {
    const sceneSpec = params.sceneSpec ?? params.arguments;
    const sceneId =
      (typeof params.sceneId === 'string' && params.sceneId) || 'rt4d-scene-proxy';
    const seed = typeof params.seed === 'number' ? params.seed : 42;

    const result = await forwardToEngine('POST', `/v1/scenes/${encodeURIComponent(sceneId)}/render`, {
      sceneSpec,
      seed,
      ...params,
    });

    const payload = asRecord(result.json) ?? {};
    try {
      await storeEngineArtifacts(payload);
    } catch (err) {
      structuredLog({
        failureClass: 'artifact_store',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    structuredLog({
      renderId: typeof params.sceneId === 'string' ? params.sceneId : sceneId,
      failureClass: result.status >= 400 ? 'engine_error' : 'none',
      latencyMs: result.latencyMs,
      renderCost: null,
    });

    if (result.status >= 400) {
      return jsonResponse(200, {
        jsonrpc: '2.0',
        id: requestId,
        error: {
          code: -32000,
          message: `Engine error: ${result.status}`,
          data: result.json,
        },
      });
    }

    return jsonResponse(200, {
      jsonrpc: '2.0',
      id: requestId,
      result: result.json,
    });
  }

  if (method === 'getEvidence') {
    const renderId = typeof params.renderId === 'string' ? params.renderId : '';
    if (!renderId) {
      return jsonResponse(200, {
        jsonrpc: '2.0',
        id: requestId,
        error: { code: -32602, message: 'Missing renderId' },
      });
    }
    const pngSha256 = typeof params.pngSha256 === 'string' ? params.pngSha256 : 'evidence';
    const evidence = await getObject(EVIDENCE_BUCKET, `evidence/${renderId}/${pngSha256}.json`);
    return jsonResponse(200, {
      jsonrpc: '2.0',
      id: requestId,
      result: evidence ? JSON.parse(evidence.toString('utf8')) : { renderId, evidence: null },
    });
  }

  if (method === 'getPng') {
    const renderId = typeof params.renderId === 'string' ? params.renderId : '';
    const pngSha256 = typeof params.pngSha256 === 'string' ? params.pngSha256 : '';
    if (!renderId || !pngSha256) {
      return jsonResponse(200, {
        jsonrpc: '2.0',
        id: requestId,
        error: { code: -32602, message: 'Missing renderId or pngSha256 (engine-issued)' },
      });
    }
    const png = await getObject(RENDERS_BUCKET, `renders/${renderId}/${pngSha256}.png`);
    if (!png) {
      return jsonResponse(200, {
        jsonrpc: '2.0',
        id: requestId,
        error: { code: -32001, message: 'PNG not found' },
      });
    }
    return jsonResponse(200, {
      jsonrpc: '2.0',
      id: requestId,
      result: { renderId, pngSha256, pngBase64: png.toString('base64') },
    });
  }

  return jsonResponse(200, {
    jsonrpc: '2.0',
    id: requestId,
    error: { code: -32601, message: `Unknown method: ${method}` },
  });
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const path = event.path || '';
    const httpMethod = (event.httpMethod || 'GET').toUpperCase();

    if (path.endsWith('/health') && httpMethod === 'GET') {
      return handleHealth();
    }

    if (path.includes('/v1/renders') && httpMethod === 'POST') {
      return handleRestRender(event);
    }

    if (path.includes('/v1/renders/') && httpMethod === 'GET') {
      const renderId = event.pathParameters?.renderId;
      if (!renderId) {
        return jsonResponse(400, { ok: false, error: 'Missing renderId' });
      }
      if (path.endsWith('/evidence')) {
        const evidence = await getObject(EVIDENCE_BUCKET, `evidence/${renderId}/evidence.json`);
        return jsonResponse(evidence ? 200 : 404, evidence ? JSON.parse(evidence.toString('utf8')) : { error: 'not found' });
      }
      if (path.endsWith('/png')) {
        return jsonResponse(501, {
          ok: false,
          statusTag: 'declared',
          error: 'GET png requires engine-issued pngSha256 query; use JSON-RPC getPng',
        });
      }
    }

    // Default: /mcp JSON-RPC / tools surface
    return handleJsonRpc(event);
  } catch (err) {
    structuredLog({
      failureClass: 'handler_internal',
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse(500, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: 'Internal error' },
    });
  }
}
