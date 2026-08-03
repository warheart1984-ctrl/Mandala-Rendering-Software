/**
 * MCP Gateway Lambda — Hosts the full MCP SDK server with Streamable HTTP transport.
 *
 * This replaces the custom JSON-RPC wrapper with proper MCP protocol:
 * - initialize / tools/list / tools/call / resources/list / resources/read
 * - Session management via StreamableHTTPServerTransport
 * - Full protocol compliance for ChatGPT / MCP clients
 *
 * Tool handlers delegate to RT4D engine HTTP API (via ENGINE_ALB_DNS).
 * Status: partial (synth/bundled); live protocol verified after deploy.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import * as crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import openApiSpec from './openapi.json';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ENGINE_ALB_DNS = process.env.ENGINE_ALB_DNS || '';
const ENGINE_PORT = process.env.ENGINE_PORT || '8020';
const STAGE = process.env.STAGE || 'dev';
const PROJECT_NAME = process.env.PROJECT_NAME || 'mrs-rt4d';
const RENDERS_BUCKET = process.env.RENDERS_BUCKET || '';
const EVIDENCE_BUCKET = process.env.EVIDENCE_BUCKET || '';
const USAGE_TABLE = process.env.USAGE_TABLE || '';
const DECISIONS_TABLE = process.env.DECISIONS_TABLE || '';
// Presigned preview URLs must outlive the ChatGPT turn; capped at 7 days (SigV4 max).
const RENDER_PREVIEW_URL_TTL_SECONDS = Number(
  process.env.RENDER_PREVIEW_URL_TTL_SECONDS ?? 604800,
);

interface TraceContext {
  requestId: string;
  traceId: string;
  principalId: string;
  entitlementDecisionId: string;
}

let activeTrace: TraceContext | undefined;

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function buildTraceContext(event: APIGatewayProxyEvent, requestId: string): TraceContext {
  const traceId =
    event.headers?.['x-amzn-trace-id'] || process.env._X_AMZN_TRACE_ID || '';
  const principalId =
    (event.requestContext?.authorizer as Record<string, string> | undefined)
      ?.principalId ?? 'rt4d-mcp-client';
  const entitlementDecisionId =
    `ent-${sha256Hex(`${principalId}:${requestId}:${Date.now()}`).slice(0, 16)}`;
  return { requestId, traceId, principalId, entitlementDecisionId };
}

interface EngineRenderRequest {
  sceneSpec: Record<string, unknown>;
  seed: number;
  [key: string]: unknown;
}

interface EngineRenderResponse {
  previewUrl: string;
  sha256: string;
  source: string;
  width: number;
  height: number;
  runId: string;
  renderBundle?: {
    renderId: string;
    projectionHash: string;
    pixelHash: string;
    pngHash: string;
    rendererVersion: string;
    runtimeFingerprint: Record<string, string>;
    evidenceStatus: string;
    promotionStatus: string;
    replayToken: string;
  };
  evidence?: {
    conformance: { ok: boolean };
    replayToken: string;
  };
  note: string;
}

interface EngineSceneResponse {
  sceneId: string;
  provenance: Record<string, unknown>;
  continuityState: Record<string, unknown>;
  shotEvidence: Record<string, unknown>;
  scene: Record<string, unknown>;
}

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Request-Id,mcp-session-id',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,DELETE',
      'Access-Control-Expose-Headers': 'mcp-session-id',
    },
    body: JSON.stringify(body),
  };
}

async function forwardToEngine(
  method: string,
  path: string,
  body?: unknown,
  trace?: TraceContext,
): Promise<{ status: number; json: unknown }> {
  if (!ENGINE_ALB_DNS) {
    throw new Error('ENGINE_ALB_DNS not configured');
  }
  const url = `http://${ENGINE_ALB_DNS}:${ENGINE_PORT}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (trace) {
    headers['X-Request-Id'] = trace.requestId;
    headers['X-Trace-Id'] = trace.traceId;
    headers['X-Principal-Id'] = trace.principalId;
    headers['X-Entitlement-Decision-Id'] = trace.entitlementDecisionId;
  }
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

interface EngineEnvelope {
  ok: boolean;
  data: Record<string, unknown>;
  error: { code: string; message: string } | null;
}

/** Engine HTTP responses are wrapped as { ok, statusTag, data, error }. */
function unwrapEnvelope(raw: unknown): EngineEnvelope {
  const rec = asRecord(raw) ?? {};
  const errRec = asRecord(rec.error);
  return {
    ok: rec.ok === true,
    data: asRecord(rec.data) ?? {},
    error: errRec
      ? { code: String(errRec.code ?? ''), message: String(errRec.message ?? '') }
      : null,
  };
}

const SURFACE_BY_MODE: Record<string, string> = {
  technical: 'tesseract',
  previz: 'tesseract',
  storyboard: 'trefoil-4d',
  concept: 'torus-3d',
  cinematic: 'clifford-torus',
  final: 'hopf-surface',
};
const SURFACES = ['clifford-torus', 'hopf-surface', 'torus-3d', 'trefoil-4d', 'tesseract'];
const PLANES = ['xy', 'xz', 'xw', 'yz', 'yw', 'zw'];

/** Deterministic SceneSpec derived from the natural-language request (P4 replayable). */
function buildSceneSpec(args: {
  prompt: string;
  mode?: string;
  width?: number;
  height?: number;
}): Record<string, unknown> {
  const digest = sha256Hex((args.prompt ?? '').toLowerCase());
  const surface =
    SURFACE_BY_MODE[args.mode ?? ''] ??
    SURFACES[parseInt(digest.slice(0, 8), 16) % SURFACES.length];
  const rotations: Array<{ plane: string; speed: number }> = [];
  for (let i = 0; i < 3; i++) {
    const plane = PLANES[parseInt(digest.slice(16 + i * 8, 24 + i * 8), 16) % PLANES.length];
    const speed =
      Math.round(((parseInt(digest.slice(24 + i * 8, 32 + i * 8), 16) % 60) / 10 + 0.2) * 100) /
      100;
    rotations.push({ plane, speed });
  }
  const resolution = Math.min(64, Math.max(8, Math.floor((args.width ?? 128) / 8)));
  return {
    surface,
    resolution,
    rotations,
    projection: { type: 'perspective', distance4d: 4, distance3d: 4 },
    camera: { fovX: 52, fovY: 52, fovZ: 8, fovW: 8, lensRadius: 0 },
    intentId: `int-${digest.slice(0, 12)}`,
    timelineId: `tl-${digest.slice(12, 24)}`,
    worldId: `world-${digest.slice(24, 36)}`,
    promptHash: sha256Hex(args.prompt ?? ''),
  };
}

async function putObject(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
  metadata: Record<string, string>,
): Promise<void> {
  if (!bucket) return;
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  }));
}

/**
 * Store PNG/evidence using hashes provided by the engine only; tag with trace fields.
 * Returns the S3 object key written for the PNG (null when not stored) so the caller
 * can mint a fetchable preview URL.
 */
async function storeEngineArtifacts(
  enginePayload: Record<string, unknown>,
  trace: TraceContext,
): Promise<{ pngKey: string | null }> {
  const data = asRecord(enginePayload.data) ?? enginePayload;
  const evidence = asRecord(data.evidence) ?? asRecord(enginePayload.evidence);
  const renderId =
    (typeof data.renderId === 'string' && data.renderId) ||
    (typeof data.sceneId === 'string' && data.sceneId) ||
    (evidence && typeof evidence.renderId === 'string' && evidence.renderId) ||
    null;
  const pngSha256 =
    (typeof data.pngHash === 'string' && data.pngHash) ||
    (typeof data.pngSha256 === 'string' && data.pngSha256) ||
    (evidence && typeof evidence.pngSha256 === 'string' && evidence.pngSha256) ||
    null;
  const sceneHash =
    (evidence && typeof evidence.sceneSpecHash === 'string' && evidence.sceneSpecHash) ||
    (evidence && typeof evidence.sceneSha256 === 'string' && evidence.sceneSha256) ||
    '';
  const metadata: Record<string, string> = {
    requestId: trace.requestId,
    traceId: trace.traceId,
    principalId: trace.principalId,
    entitlementDecisionId: trace.entitlementDecisionId,
    renderId: renderId ?? '',
    sceneHash,
    renderHash: pngSha256 ?? '',
    pngSha256: pngSha256 ?? '',
  };

  if (!renderId) return { pngKey: null };

  const pngBase64 =
    (typeof data.pngBase64 === 'string' && data.pngBase64) ||
    (typeof data.png === 'string' && data.png) ||
    null;

  let pngKey: string | null = null;
  if (pngBase64 && pngSha256 && RENDERS_BUCKET) {
    pngKey = `renders/${renderId}/${pngSha256}.png`;
    await putObject(
      RENDERS_BUCKET,
      pngKey,
      Buffer.from(pngBase64, 'base64'),
      'image/png',
      metadata,
    );
  }

  if (evidence && EVIDENCE_BUCKET) {
    const keySuffix = pngSha256 || 'evidence';
    await putObject(
      EVIDENCE_BUCKET,
      `evidence/${renderId}/${keySuffix}.json`,
      Buffer.from(JSON.stringify(evidence), 'utf8'),
      'application/json',
      metadata,
    );
  }

  return { pngKey };
}

/**
 * HTTPS pre-signed GET URL for a stored render PNG — reachable by ChatGPT/browsers
 * without an Authorization header (the object itself stays private in S3).
 */
async function buildSignedPreviewUrl(bucket: string, key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: RENDER_PREVIEW_URL_TTL_SECONDS,
  });
}

async function writeUsageLedger(trace: TraceContext, enginePayload: Record<string, unknown>): Promise<void> {
  if (!USAGE_TABLE) return;
  const data = asRecord(enginePayload.data) ?? enginePayload;
  const evidence = asRecord(data.evidence) ?? asRecord(enginePayload.evidence);
  const renderId =
    (typeof data.renderId === 'string' && data.renderId) ||
    (typeof data.sceneId === 'string' && data.sceneId) ||
    trace.requestId;
  const sceneHash =
    (evidence && typeof evidence.sceneSpecHash === 'string' && evidence.sceneSpecHash) ||
    '';
  const renderHash =
    (typeof data.pngHash === 'string' && data.pngHash) ||
    (evidence && typeof evidence.pngSha256 === 'string' && evidence.pngSha256) ||
    '';
  try {
    await ddb.send(new PutCommand({
      TableName: USAGE_TABLE,
      Item: {
        tenantId: trace.principalId,
        renderId,
        userId: trace.principalId,
        recordedAt: new Date().toISOString(),
        entitlementDecisionId: trace.entitlementDecisionId,
        requestId: trace.requestId,
        traceId: trace.traceId,
        sceneHash,
        renderHash,
        event: 'render_request',
      },
    }));
  } catch (err) {
    console.error('usage_ledger_write:', err instanceof Error ? err.message : String(err));
  }
}

async function persistEntitlementDecision(trace: TraceContext, approved: boolean): Promise<void> {
  if (!DECISIONS_TABLE) return;
  const at = new Date().toISOString();
  try {
    await ddb.send(new PutCommand({
      TableName: DECISIONS_TABLE,
      Item: {
        tenantId: trace.principalId,
        decisionSk: `${at}#${trace.entitlementDecisionId}`,
        entitlementDecisionId: trace.entitlementDecisionId,
        requestId: trace.requestId,
        principalId: trace.principalId,
        approved,
        at,
      },
    }));
  } catch (err) {
    console.error('entitlement_decision_write:', err instanceof Error ? err.message : String(err));
  }
}

// ── Shared RT4D operations ────────────────────────────────────────────────
// Single implementation consumed by BOTH the MCP tools and the REST façade
// (GPT Action / OpenAPI), so the two surfaces never drift.

interface ResolvedScene {
  /** `{ sceneId, ...engine GET data }` — same shape the inspect tool returns. */
  payload: Record<string, unknown>;
  spec: Record<string, unknown>;
  provenance: Record<string, unknown>;
  continuityState: Record<string, unknown>;
}

async function resolveScene(sceneId: string, trace?: TraceContext): Promise<ResolvedScene> {
  const result = await forwardToEngine('GET', `/v1/scenes/${encodeURIComponent(sceneId)}`, undefined, trace);
  if (result.status >= 400) {
    throw new Error(`Scene not found: ${result.status}`);
  }
  const env = unwrapEnvelope(result.json);
  if (!env.ok) {
    throw new Error(`Scene not found: ${result.status} ${JSON.stringify(env.error ?? env.data)}`);
  }
  const data = env.data;
  return {
    payload: { sceneId, ...data },
    spec: asRecord(data.spec) ?? {},
    provenance: asRecord(data.provenance) ?? {},
    continuityState: asRecord(data.continuityState) ?? {},
  };
}

async function createScene(args: {
  prompt: string;
  mode?: string;
  width?: number;
  height?: number;
}): Promise<Record<string, unknown>> {
  const spec = buildSceneSpec(args);
  const promptHash =
    typeof spec.promptHash === 'string' ? spec.promptHash : undefined;
  const result = await forwardToEngine('POST', '/v1/scenes', { sceneSpec: spec, promptHash });
  if (result.status >= 400) {
    throw new Error(`Engine error: ${result.status} ${JSON.stringify(result.json)}`);
  }
  const env = unwrapEnvelope(result.json);
  if (!env.ok) {
    throw new Error(`Engine error: ${result.status} ${JSON.stringify(env.error ?? env.data)}`);
  }
  return { ...env.data, spec };
}

interface RenderStructuredContent {
  sceneId: string;
  previewUrl: string;
  sha256: string;
  source: string;
  width: number;
  height: number;
  shotEvidence: Record<string, unknown> | null;
  provenance: Record<string, unknown>;
  continuityState: Record<string, unknown>;
  statusTag: 'partial';
  visualKind: 'dimensional_preview';
  renderBundle: Record<string, unknown>;
  evidence: Record<string, unknown> | null;
}

async function performRender(
  sceneId: string,
  renderParams: Record<string, unknown>,
  trace?: TraceContext,
): Promise<{ structured: RenderStructuredContent; payload: Record<string, unknown> }> {
  const scene = await resolveScene(sceneId, trace);
  const renderRequest: EngineRenderRequest = {
    sceneSpec: scene.spec,
    seed: 42,
    ...renderParams,
  };

  if (trace) {
    await persistEntitlementDecision(trace, true);
  }
  const renderResult = await forwardToEngine('POST', `/v1/scenes/${encodeURIComponent(sceneId)}/render`, renderRequest, trace);
  if (renderResult.status >= 400) {
    throw new Error(`Render failed: ${renderResult.status} ${JSON.stringify(renderResult.json)}`);
  }
  const env = unwrapEnvelope(renderResult.json);
  if (!env.ok) {
    throw new Error(`Render failed: ${renderResult.status} ${JSON.stringify(env.error ?? env.data)}`);
  }
  const payload = env.data;

  let storedArtifact: { pngKey: string | null } | null = null;
  if (trace && asRecord(payload)) {
    try {
      storedArtifact = await storeEngineArtifacts(payload, trace);
      await writeUsageLedger(trace, payload);
    } catch (err) {
      console.error('artifact_store:', err instanceof Error ? err.message : String(err));
    }
  }

  const renderReceipt = asRecord(payload.renderReceipt) ?? {};
  const evidence = asRecord(payload.evidence);
  let previewUrl = '';
  if (storedArtifact?.pngKey && RENDERS_BUCKET) {
    try {
      previewUrl = await buildSignedPreviewUrl(RENDERS_BUCKET, storedArtifact.pngKey);
    } catch (err) {
      console.error('preview_url:', err instanceof Error ? err.message : String(err));
    }
  }
  previewUrl =
    previewUrl ||
    (typeof payload.previewUrl === 'string' && payload.previewUrl) ||
    (ENGINE_ALB_DNS
      ? `http://${ENGINE_ALB_DNS}/renders/${String(payload.renderId ?? sceneId)}/preview.png`
      : '');

  const structured: RenderStructuredContent = {
    sceneId,
    previewUrl,
    sha256: payload.pngHash ?? payload.sha256 ?? '',
    source: 'rt4d-engine',
    width: typeof renderReceipt.width === 'number' ? renderReceipt.width : (renderParams.width ?? 128),
    height: typeof renderReceipt.height === 'number' ? renderReceipt.height : (renderParams.height ?? 128),
    shotEvidence: evidence,
    provenance: scene.provenance,
    continuityState: scene.continuityState,
    statusTag: 'partial',
    visualKind: 'dimensional_preview',
    renderBundle: {
      renderId: payload.renderId ?? '',
      projectionHash: payload.projectionHash ?? '',
      pixelHash: payload.pixelHash ?? '',
      pngHash: payload.pngHash ?? '',
      rendererVersion: 'rt4d-engine',
      runtimeFingerprint: asRecord(payload.runtimeFingerprint) ?? {},
      evidenceStatus: evidence ? 'attached' : 'missing',
      promotionStatus: 'partial',
      replayToken: (evidence && typeof evidence.replayToken === 'string' && evidence.replayToken) || '',
    },
    evidence,
  };
  return { structured, payload };
}

async function applySceneUpdate(
  sceneId: string,
  updates: Record<string, unknown>,
): Promise<{ payload: Record<string, unknown>; preview: EngineRenderResponse | undefined }> {
  const rotations = asRecord(updates.rotations);
  const projection = asRecord(updates.projection);
  const specPatch: Record<string, unknown> = {};
  if (rotations) {
    specPatch.rotations = Object.entries(rotations)
      .filter(([k]) => ['xw', 'yw', 'zw'].includes(k))
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => ({ plane: k, speed: v }));
  }
  if (projection) {
    specPatch.projection = {
      type: 'perspective',
      distance4d: typeof projection.d4 === 'number' ? projection.d4 : undefined,
      distance3d: typeof projection.d3 === 'number' ? projection.d3 : undefined,
    };
  }
  const result = await forwardToEngine('PATCH', `/v1/scenes/${encodeURIComponent(sceneId)}`, specPatch);
  if (result.status >= 400) {
    throw new Error(`Update failed: ${result.status} ${JSON.stringify(result.json)}`);
  }
  const env = unwrapEnvelope(result.json);
  if (!env.ok) {
    throw new Error(`Update failed: ${result.status} ${JSON.stringify(env.error ?? env.data)}`);
  }
  const payload = { sceneId, ...env.data };
  const rePreview = updates.rePreview === true;
  let preview: EngineRenderResponse | undefined;
  if (rePreview) {
    const renderResult = await forwardToEngine('POST', `/v1/scenes/${encodeURIComponent(sceneId)}/render`, { sceneSpec: payload.spec, seed: 42, width: updates.width, height: updates.height });
    if (renderResult.status < 400) {
      const renv = unwrapEnvelope(renderResult.json);
      preview = renv.data as unknown as EngineRenderResponse;
    }
  }
  return { payload, preview };
}

function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'rt4d-hybrid-anime-production',
      version: '0.2.0',
    },
    {
      instructions:
        'RT4D Anime Lane product plugin (partial). Prefer create_rt4d_scene → render_rt4d_preview → inspect_rt4d_provenance. Interactive viewer (ui://rt4d/viewer-v1) can call update_rt4d_scene for XW/YW/ZW + projection (partial dimensional preview — not AnimeStylizer). Modes map to product lanes. Do not claim diffusion-as-anime, ChatGPT directory listing, persistent RT3D, 5s film, or Unity/Unreal export as enforced. Genblaze Actions are a companion onboarding tool. No claim without evidence. Architecture SoT: docs/anime-lane/RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md',
    }
  );

  // create_rt4d_scene
  server.registerTool(
    'create_rt4d_scene',
    {
      title: 'Create RT4D Scene',
      description:
        'Create deterministic scene JSON with mode/product lane, ContinuityState, provenance, and Shot Evidence Envelope (partial). Opens interactive viewer when host supports MCP Apps UI.',
      inputSchema: {
        prompt: z.string().min(1),
        mode: z.enum(['cinematic', 'technical', 'concept', 'storyboard', 'previz', 'final']).optional(),
        width: z.number().int().min(16).max(2048).optional(),
        height: z.number().int().min(16).max(2048).optional(),
        continuityState: z.object({
          characterState: z.record(z.unknown()).optional(),
          worldState: z.record(z.unknown()).optional(),
          cameraState: z.record(z.unknown()).optional(),
          emotionState: z.record(z.unknown()).optional(),
          rt4dState: z.record(z.unknown()).optional(),
          continuityVersion: z.number().int().min(0).optional(),
        }).optional(),
      },
    },
    async (args) => {
      const payload = await createScene(args);
      return {
        content: [
          { type: 'text', text: `Created scene ${String(payload.sceneId ?? '')}` },
          { type: 'text', text: JSON.stringify(payload, null, 2) },
        ],
        structuredContent: payload,
      };
    }
  );

  // render_rt4d_preview
  server.registerTool(
    'render_rt4d_preview',
    {
      title: 'Render RT4D Preview',
      description:
        'Preview via RT4D engine. Updates Shot Evidence Envelope outputHash. Binds to viewer widget.',
      inputSchema: {
        sceneId: z.string().min(1),
        mode: z.enum(['cinematic', 'technical', 'concept', 'storyboard', 'previz', 'final']).optional(),
        width: z.number().int().min(16).max(1024).optional(),
        height: z.number().int().min(16).max(1024).optional(),
        continuityState: z.object({
          characterState: z.record(z.unknown()).optional(),
          worldState: z.record(z.unknown()).optional(),
          cameraState: z.record(z.unknown()).optional(),
          emotionState: z.record(z.unknown()).optional(),
          rt4dState: z.record(z.unknown()).optional(),
          continuityVersion: z.number().int().min(0).optional(),
        }).optional(),
      },
    },
    async (args) => {
      const { sceneId, ...renderParams } = args;
      const trace = activeTrace;
      const { structured, payload } = await performRender(sceneId, renderParams, trace);
      const evidence = asRecord(structured.evidence);
      const replayToken =
        (evidence && typeof evidence.replayToken === 'string' && evidence.replayToken) || '';
      const conformance =
        (evidence && asRecord(evidence.conformance)) as { ok?: boolean } | null ?? null;
      return {
        content: [
          { type: 'text', text: `Preview for ${sceneId} via rt4d-engine. renderId=${String(payload.renderId ?? '')} evidence=${evidence ? 'attached' : 'missing'}${replayToken ? ` replayToken=${replayToken.slice(0, 16)}…` : ''}${conformance?.ok != null ? ` conformance=${conformance.ok ? 'ok' : 'n/a'}` : ''}` },
          { type: 'text', text: JSON.stringify(structured, null, 2) },
        ],
        structuredContent: structured,
      };
    }
  );

  // inspect_rt4d_provenance
  server.registerTool(
    'inspect_rt4d_provenance',
    {
      title: 'Inspect RT4D Provenance',
      description: 'Return provenance, ContinuityState, and Shot Evidence Envelope from in-memory store.',
      inputSchema: {
        sceneId: z.string().min(1),
      },
    },
    async (args) => {
      const scene = await resolveScene(args.sceneId, activeTrace);
      const payload = scene.payload;
      return {
        content: [
          { type: 'text', text: `Provenance for ${args.sceneId}` },
          { type: 'text', text: JSON.stringify(payload, null, 2) },
        ],
        structuredContent: payload,
      };
    }
  );

  // update_rt4d_scene
  server.registerTool(
    'update_rt4d_scene',
    {
      title: 'Update RT4D Scene',
      description: 'Phase 2 partial — update XW/YW/ZW rotations and/or projection distance; optional rePreview. Id-stable in-memory mutation. Not RT3D persistence / export.',
      inputSchema: {
        sceneId: z.string().min(1),
        rotations: z.object({
          xw: z.number().optional(),
          yw: z.number().optional(),
          zw: z.number().optional(),
        }).optional(),
        projection: z.object({
          d4: z.number().optional(),
          d3: z.number().optional(),
        }).optional(),
        rePreview: z.boolean().optional(),
        width: z.number().int().min(16).max(1024).optional(),
        height: z.number().int().min(16).max(1024).optional(),
      },
    },
    async (args) => {
      const { sceneId, ...updates } = args;
      const { payload, preview } = await applySceneUpdate(sceneId, updates);
      return {
        content: [
          { type: 'text', text: `Updated scene ${sceneId}` + (preview ? ` + re-preview via rt4d-engine` : '') },
          { type: 'text', text: JSON.stringify(payload, null, 2) },
        ],
        structuredContent: preview ? { ...payload, preview } : payload,
        isError: false,
      };
    }
  );

  // export_rt4d_asset (declared stub)
  server.registerTool(
    'export_rt4d_asset',
    {
      title: 'Export RT4D Asset',
      description: 'Skeleton — Unity/Unreal export declared, not implemented.',
      inputSchema: {
        sceneId: z.string().min(1),
        format: z.enum(['usd', 'gltf', 'fbx']).optional(),
      },
    },
    async (args) => {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'NotImplemented', message: 'Unity/Unreal export declared, not implemented', sceneId: args.sceneId }) }],
        structuredContent: { error: 'NotImplemented', message: 'Unity/Unreal export declared, not implemented', sceneId: args.sceneId },
        isError: true,
      };
    }
  );

  // validate_character_continuity (declared stub)
  server.registerTool(
    'validate_character_continuity',
    {
      title: 'Validate Character Continuity',
      description: 'Declared governance tool — NotImplemented. No continuity claim without state comparison.',
      inputSchema: {
        sceneId: z.string().min(1),
        referenceSceneId: z.string().min(1),
      },
    },
    async (args) => {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'NotImplemented', message: 'No continuity claim without state comparison', sceneId: args.sceneId }) }],
        structuredContent: { error: 'NotImplemented', message: 'No continuity claim without state comparison', sceneId: args.sceneId },
        isError: true,
      };
    }
  );

  // replay_anime_shot (declared stub)
  server.registerTool(
    'replay_anime_shot',
    {
      title: 'Replay Anime Shot',
      description: 'Declared — deterministic replay verification not enforced. Inspect shotEvidence for partial receipt.',
      inputSchema: {
        sceneId: z.string().min(1),
        shotId: z.string().min(1),
      },
    },
    async (args) => {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'NotImplemented', message: 'Deterministic replay verification not enforced', sceneId: args.sceneId, shotId: args.shotId }) }],
        structuredContent: { error: 'NotImplemented', message: 'Deterministic replay verification not enforced', sceneId: args.sceneId, shotId: args.shotId },
        isError: true,
      };
    }
  );

  // compare_render_versions (declared stub)
  server.registerTool(
    'compare_render_versions',
    {
      title: 'Compare Render Versions',
      description: 'Declared — version compare not implemented.',
      inputSchema: {
        sceneId: z.string().min(1),
        versionA: z.string().min(1),
        versionB: z.string().min(1),
      },
    },
    async (args) => {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'NotImplemented', message: 'Version compare not implemented', sceneId: args.sceneId }) }],
        structuredContent: { error: 'NotImplemented', message: 'Version compare not implemented', sceneId: args.sceneId },
        isError: true,
      };
    }
  );

  // approve_canonical_shot (declared stub)
  server.registerTool(
    'approve_canonical_shot',
    {
      title: 'Approve Canonical Shot',
      description: 'Declared — no approved scene without a recorded decision store.',
      inputSchema: {
        sceneId: z.string().min(1),
        shotId: z.string().min(1),
        approver: z.string().min(1).optional(),
      },
    },
    async (args) => {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'NotImplemented', message: 'No approved scene without a recorded decision store', sceneId: args.sceneId, shotId: args.shotId }) }],
        structuredContent: { error: 'NotImplemented', message: 'No approved scene without a recorded decision store', sceneId: args.sceneId, shotId: args.shotId },
        isError: true,
      };
    }
  );

  // Resource: Interactive viewer
  server.registerResource(
    'RT4D Viewer v1',
    'ui://rt4d/viewer-v1',
    {
      mimeType: 'text/html;profile=mcp-app',
      description: 'Interactive RT4D dimensional preview (Three.js tesseract / engine PNG). Phase 2 partial — not photoreal anime.',
    },
    async () => ({
      contents: [{
        uri: 'ui://rt4d/viewer-v1',
        mimeType: 'text/html;profile=mcp-app',
        text: `<!doctype html><html><body><p>RT4D viewer — deploy widget build to serve full viewer. <a href="https://github.com/modelcontextprotocol/specification/blob/main/docs/apps.md">MCP Apps spec</a>.</p></body></html>`,
      }],
    })
  );

  return server;
}

/**
 * API Gateway REST → Web Request for MCP Streamable HTTP (Lambda-safe).
 * Stateless + JSON responses: in-memory Node HTTP mocks previously returned
 * stub `{status:"handled"}` and dropped protocol payloads (live smoke 2026-08-02).
 */
function eventToWebRequest(event: APIGatewayProxyEvent, httpMethod: string): {
  request: Request;
  parsedBody: unknown | undefined;
} {
  const host =
    event.headers?.Host ||
    event.headers?.host ||
    event.requestContext?.domainName ||
    'localhost';
  const path = event.path || '/mcp';
  const url = `https://${host}${path}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(event.headers || {})) {
    if (value) headers.set(key, value);
  }
  if (!headers.has('accept')) {
    headers.set('accept', 'application/json, text/event-stream');
  }

  let rawBody: string | undefined;
  if (event.body) {
    rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
  }

  let parsedBody: unknown | undefined;
  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = undefined;
    }
  }

  const request = new Request(url, {
    method: httpMethod,
    headers,
    body: httpMethod === 'GET' || httpMethod === 'HEAD' || httpMethod === 'DELETE' ? undefined : rawBody,
  });
  return { request, parsedBody };
}

async function webResponseToApiGateway(response: Response): Promise<APIGatewayProxyResult> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'Content-Type,Authorization,X-Request-Id,mcp-session-id,Accept,Mcp-Session-Id',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,DELETE',
    'Access-Control-Expose-Headers': 'mcp-session-id,Mcp-Session-Id',
  };
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  if (!headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  const body = await response.text();
  return {
    statusCode: response.status,
    headers,
    body,
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const path = event.path || '';
    const httpMethod = (event.httpMethod || 'GET').toUpperCase();

    // Health check (no auth required)
    if (path.endsWith('/health') && httpMethod === 'GET') {
      return jsonResponse(200, {
        ok: true,
        name: 'rt4d-hybrid-anime-production',
        version: '0.2.0',
        status: {
          mcp_protocol: 'partial',
          engine_configured: Boolean(ENGINE_ALB_DNS),
          stage: STAGE,
        },
        capabilities: {
          tools: true,
          resources: true,
          logging: false,
        },
      });
    }

    // MCP endpoint — Web-standard Streamable HTTP (returns real JSON-RPC body)
    if (path.endsWith('/mcp') || path.endsWith('/mcp/')) {
      if (httpMethod === 'OPTIONS') {
        return jsonResponse(204, null);
      }

      const requestId = event.headers?.['x-request-id'] || `req-${crypto.randomUUID().slice(0, 12)}`;
      const trace = buildTraceContext(event, requestId);
      activeTrace = trace;

      const transport = new WebStandardStreamableHTTPServerTransport({
        // Stateless: Lambda instances do not share session memory reliably.
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      const server = createMcpServer();
      await server.connect(transport);

      const { request, parsedBody } = eventToWebRequest(event, httpMethod);
      const response = await transport.handleRequest(request, { parsedBody });

      activeTrace = undefined;
      try {
        await transport.close();
      } catch {
        // best-effort cleanup
      }

      return webResponseToApiGateway(response);
    }

    // REST façade for GPT Actions (OpenAPI): mirrors the MCP tool surface.
    if (path === '/openapi.json' || path.endsWith('/openapi.json')) {
      if (httpMethod === 'GET') {
        return jsonResponse(200, openApiSpec);
      }
      return jsonResponse(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'GET only' } });
    }
    if (path === '/v1/render-prompt' && httpMethod === 'POST') {
      return handleRenderPrompt(event);
    }
    if (path.startsWith('/v1/scenes')) {
      return handleSceneRest(event);
    }

    return jsonResponse(404, { ok: false, error: 'Not found' });
  } catch (err) {
    console.error('MCP handler error:', err);
    return jsonResponse(500, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: 'Internal error', data: err instanceof Error ? err.message : String(err) },
    });
  }
}

// ── REST façade (GPT Action / OpenAPI) ───────────────────────────────────

function parseJsonBody(event: APIGatewayProxyEvent): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function restOk(statusCode: number, data: unknown): APIGatewayProxyResult {
  return jsonResponse(statusCode, { ok: true, statusTag: 'partial', data, error: null });
}

function restError(statusCode: number, code: string, message: string): APIGatewayProxyResult {
  return jsonResponse(statusCode, { ok: false, statusTag: 'partial', data: null, error: { code, message } });
}

async function handleSceneRest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const httpMethod = (event.httpMethod || 'GET').toUpperCase();
  const path = event.path || '';
  const match = /^\/v1\/scenes(?:\/([^/]+))?(?:\/(render))?$/.exec(path);
  if (!match) {
    return restError(404, 'NOT_FOUND', 'unknown route');
  }
  const sceneId = match[1];
  const sub = match[2];

  const requestId = event.headers?.['x-request-id'] || `req-${crypto.randomUUID().slice(0, 12)}`;
  const trace = buildTraceContext(event, requestId);

  try {
    if (httpMethod === 'POST' && !sceneId && !sub) {
      const body = asRecord(parseJsonBody(event)) ?? {};
      const prompt = typeof body.prompt === 'string' ? body.prompt : '';
      if (!prompt) {
        return restError(400, 'BAD_REQUEST', 'prompt is required');
      }
      const payload = await createScene({
        prompt,
        mode: typeof body.mode === 'string' ? body.mode : undefined,
        width: typeof body.width === 'number' ? body.width : undefined,
        height: typeof body.height === 'number' ? body.height : undefined,
      });
      return restOk(201, payload);
    }

    if (!sceneId) {
      return restError(404, 'NOT_FOUND', 'sceneId required');
    }

    if (httpMethod === 'GET' && !sub) {
      const scene = await resolveScene(sceneId, trace);
      return restOk(200, scene.payload);
    }

    if (httpMethod === 'PATCH' && !sub) {
      const body = asRecord(parseJsonBody(event)) ?? {};
      const { payload, preview } = await applySceneUpdate(sceneId, body);
      return restOk(200, preview ? { ...payload, preview } : payload);
    }

    if (httpMethod === 'POST' && sub === 'render') {
      const body = asRecord(parseJsonBody(event)) ?? {};
      const { structured } = await performRender(sceneId, body, trace);
      return restOk(200, structured);
    }

    return restError(404, 'NOT_FOUND', 'unknown route');
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'ERROR';
    const message = err instanceof Error ? err.message : String(err);
    const status = /not found/i.test(message) ? 404 : /SCENE_/.test(code) ? 409 : 400;
    return restError(status, code, message);
  }
}

/**
 * One-shot GPT Action: create a deterministic scene from a prompt and render a
 * preview in a single call, so ChatGPT returns an image in one tool invocation.
 * Defaults to 512×512 (measured ~8s) to stay well inside the 29s gateway timeout.
 */
async function handleRenderPrompt(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = event.headers?.['x-request-id'] || `req-${crypto.randomUUID().slice(0, 12)}`;
  const trace = buildTraceContext(event, requestId);

  try {
    const body = asRecord(parseJsonBody(event)) ?? {};
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (!prompt) {
      return restError(400, 'BAD_REQUEST', 'prompt is required');
    }
    const mode = typeof body.mode === 'string' ? body.mode : undefined;
    const width = typeof body.width === 'number' ? body.width : 512;
    const height = typeof body.height === 'number' ? body.height : 512;
    const created = await createScene({ prompt, mode, width, height });
    const sceneId = typeof created.sceneId === 'string' ? created.sceneId : '';
    if (!sceneId) {
      return restError(502, 'ENGINE_ERROR', 'engine did not return a sceneId');
    }
    const continuityState = asRecord(body.continuityState);
    const { structured } = await performRender(
      sceneId,
      { mode, width, height, ...(continuityState ? { continuityState } : {}) },
      trace,
    );
    return restOk(200, structured);
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'ERROR';
    const message = err instanceof Error ? err.message : String(err);
    const status = /not found/i.test(message) ? 404 : /SCENE_/.test(code) ? 409 : 400;
    return restError(status, code, message);
  }
}