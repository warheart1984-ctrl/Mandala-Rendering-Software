/**
 * Governed REST facade for Custom GPT Actions.
 *
 * The Action surface stays deliberately small while the tool catalog is read
 * live from Mandala's MCP server. New governed MCP tools therefore become
 * discoverable without adding a second execution implementation.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { getRenderDir } from "./render-jobs.js";

const ACTION_SCHEMA_VERSION = "mandala-gpt-action/1.0";
const MAX_BODY_BYTES = 1_000_000;
const MAX_INTENT_CHARS = 1_000;
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
const ASSET_PATH_PATTERN = /^\/actions\/assets\/([a-f0-9]{64})\.(png|jpg|webp|mp3|wav|ogg)$/;
const MEDIA_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
};

type JsonRecord = Record<string, unknown>;

class ActionHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite values are not canonical");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as JsonRecord;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("unsupported value in canonical record");
}

function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function writeJson(res: ServerResponse, statusCode: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function actionError(res: ServerResponse, error: ActionHttpError): void {
  writeJson(res, error.statusCode, {
    ok: false,
    schemaVersion: ACTION_SCHEMA_VERSION,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const declaredLength = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new ActionHttpError(413, "BODY_TOO_LARGE", `request body exceeds ${MAX_BODY_BYTES} bytes`);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const raw of req) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new ActionHttpError(413, "BODY_TOO_LARGE", `request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new ActionHttpError(400, "INVALID_JSON", "request body must be valid JSON");
  }
}

function expectedActionKey(): string {
  return (process.env.MRS_ACTION_API_KEY ?? process.env.MRS_API_KEY ?? "").trim();
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireActionAuthorization(req: IncomingMessage): void {
  const expected = expectedActionKey();
  if (!expected) {
    throw new ActionHttpError(
      503,
      "ACTION_AUTH_NOT_CONFIGURED",
      "Set MRS_ACTION_API_KEY before exposing Mandala Actions",
    );
  }
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(.+)$/i.exec(value ?? "");
  if (!match || !constantTimeEqual(match[1]!, expected)) {
    throw new ActionHttpError(401, "UNAUTHORIZED", "missing or invalid Bearer API key");
  }
}

function publicBaseUrl(req: IncomingMessage): string {
  const configured = (
    process.env.MRS_ACTION_PUBLIC_BASE_URL ?? process.env.MRS_PUBLIC_BASE_URL ?? ""
  ).trim();
  if (configured) return configured.replace(/\/$/, "");
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0]?.trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] ?? "").split(",")[0]?.trim();
  const protocol = forwardedProto === "https" ? "https" : "http";
  const host = forwardedHost || req.headers.host || "127.0.0.1:8000";
  return `${protocol}://${host}`;
}

function configuredAllowlist(): ReadonlySet<string> | null {
  const raw = (process.env.MRS_ACTION_TOOL_ALLOWLIST ?? "*").trim();
  if (!raw || raw === "*") return null;
  return new Set(raw.split(",").map((value) => value.trim()).filter(Boolean));
}

function toolAllowed(name: string): boolean {
  const allowlist = configuredAllowlist();
  return allowlist === null || allowlist.has(name);
}

function mcpUrl(port: number): URL {
  const configured = process.env.MRS_ACTION_MCP_URL?.trim();
  return new URL(configured || `http://127.0.0.1:${port}/mcp`);
}

async function withMcpClient<T>(port: number, operation: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: "mandala-gpt-action-gateway", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(mcpUrl(port));
  await client.connect(transport);
  try {
    return await operation(client);
  } finally {
    try {
      await client.close();
    } catch {
      // Mandala's stateless MCP endpoint intentionally rejects DELETE; the
      // per-request server/transport is already closed after its response.
    }
  }
}

function publicTool(tool: JsonRecord): JsonRecord {
  return {
    name: tool.name,
    title: tool.title ?? tool.name,
    description: tool.description ?? "",
    inputSchema: tool.inputSchema ?? { type: "object", additionalProperties: false },
    annotations: tool.annotations ?? {},
  };
}

async function listGovernedTools(port: number): Promise<JsonRecord[]> {
  return withMcpClient(port, async (client) => {
    const listed = await client.listTools();
    return listed.tools
      .filter((tool) => toolAllowed(tool.name))
      .map((tool) => publicTool(tool as unknown as JsonRecord));
  });
}

function storeMediaAsset(data: string, mimeType: string, baseUrl: string): JsonRecord {
  const extension = MEDIA_EXTENSIONS[mimeType];
  if (!extension) {
    return { type: "media", mimeType, omitted: true, reason: "unsupported Action media type" };
  }
  const bytes = Buffer.from(data, "base64");
  const maxBytes = Number(process.env.MRS_ACTION_MAX_ASSET_BYTES ?? 5_000_000);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || bytes.length > maxBytes) {
    throw new ActionHttpError(413, "ASSET_TOO_LARGE", `tool media exceeds Action limit ${maxBytes}`);
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  const filename = `${digest}.${extension}`;
  const output = path.join(getRenderDir(), filename);
  try {
    fs.writeFileSync(output, bytes, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return {
    type: mimeType.startsWith("image/") ? "image" : "audio",
    mimeType,
    sha256: digest,
    bytes: bytes.length,
    url: `${baseUrl}/actions/assets/${filename}`,
  };
}

function normalizeContent(content: unknown, baseUrl: string): unknown[] {
  if (!Array.isArray(content)) return [];
  return content.map((item) => {
    const record = asRecord(item);
    if (!record) return { type: "unknown", value: item };
    if ((record.type === "image" || record.type === "audio")
      && typeof record.data === "string" && typeof record.mimeType === "string") {
      return storeMediaAsset(record.data, record.mimeType, baseUrl);
    }
    return record;
  });
}

function validateInvocationBody(body: unknown): {
  intent: string;
  args: JsonRecord;
  evidence: JsonRecord;
  confirmDestructive: boolean;
} {
  const record = asRecord(body);
  if (!record) throw new ActionHttpError(400, "INVALID_BODY", "request body must be an object");
  const intent = typeof record.intent === "string" ? record.intent.trim() : "";
  if (!intent) throw new ActionHttpError(400, "INTENT_REQUIRED", "intent is required");
  if (intent.length > MAX_INTENT_CHARS) {
    throw new ActionHttpError(400, "INTENT_TOO_LONG", `intent exceeds ${MAX_INTENT_CHARS} characters`);
  }
  const args = record.arguments === undefined ? {} : asRecord(record.arguments);
  if (!args) throw new ActionHttpError(400, "INVALID_ARGUMENTS", "arguments must be an object");
  const evidence = record.evidence === undefined ? {} : asRecord(record.evidence);
  if (!evidence) throw new ActionHttpError(400, "INVALID_EVIDENCE", "evidence must be an object");
  return {
    intent,
    args,
    evidence,
    confirmDestructive: record.confirmDestructive === true,
  };
}

async function invokeGovernedTool(
  port: number,
  toolName: string,
  body: unknown,
  baseUrl: string,
): Promise<JsonRecord> {
  if (!TOOL_NAME_PATTERN.test(toolName)) {
    throw new ActionHttpError(400, "INVALID_TOOL_NAME", "tool name is invalid");
  }
  if (!toolAllowed(toolName)) {
    throw new ActionHttpError(403, "TOOL_NOT_AUTHORIZED", `${toolName} is outside the Action allowlist`);
  }
  const invocation = validateInvocationBody(body);
  return withMcpClient(port, async (client) => {
    const listed = await client.listTools();
    const tool = listed.tools.find((candidate) => candidate.name === toolName);
    if (!tool) throw new ActionHttpError(404, "TOOL_NOT_FOUND", `unknown Mandala tool ${toolName}`);
    if (tool.annotations?.destructiveHint === true && !invocation.confirmDestructive) {
      throw new ActionHttpError(
        409,
        "CONFIRMATION_REQUIRED",
        `${toolName} is destructive; obtain explicit user approval and set confirmDestructive=true`,
      );
    }
    const requestEvidence = {
      schemaVersion: ACTION_SCHEMA_VERSION,
      toolName,
      intent: invocation.intent,
      arguments: invocation.args,
      evidence: invocation.evidence,
    };
    const result = await client.callTool({ name: toolName, arguments: invocation.args });
    const normalizedContent = normalizeContent(result.content, baseUrl);
    const data = {
      toolName,
      content: normalizedContent,
      structuredContent: result.structuredContent ?? null,
      isError: result.isError === true,
    };
    return {
      ok: result.isError !== true,
      schemaVersion: ACTION_SCHEMA_VERSION,
      status: result.isError === true ? "tool-error" : "completed",
      data,
      receipt: {
        invocationDigest: sha256Canonical(requestEvidence),
        intentDigest: sha256Canonical(invocation.intent),
        argumentsDigest: sha256Canonical(invocation.args),
        evidenceDigest: sha256Canonical(invocation.evidence),
        resultDigest: sha256Canonical(data),
        topologyMutationAuthorityGranted: false,
      },
    };
  });
}

export function createMandalaActionOpenApi(baseUrl: string): JsonRecord {
  const errorSchema = {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      error: {
        type: "object",
        properties: {
          code: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  };
  return {
    openapi: "3.1.0",
    info: {
      title: "Mandala Sovereign Tool Gateway",
      version: "1.0.0",
      description:
        "Discover and invoke every governed tool registered by Mandala. Invocation requires a declared intent, Bearer API key, and explicit confirmation for destructive tools. Tool execution remains subject to Mandala's constitutional authority and evidence gates.",
    },
    servers: [{ url: baseUrl }],
    security: [{ BearerAuth: [] }],
    paths: {
      "/actions/v1/status": {
        get: {
          operationId: "getMandalaStatus",
          summary: "Check whether the Mandala Action gateway is ready",
          security: [],
          responses: {
            "200": { description: "Gateway status", content: { "application/json": { schema: { type: "object" } } } },
          },
        },
      },
      "/actions/v1/tools": {
        get: {
          operationId: "listMandalaTools",
          summary: "Discover every governed Mandala tool and its current input schema",
          description:
            "Call before invoking a tool. The catalog is live from Mandala MCP and includes safety annotations.",
          responses: {
            "200": { description: "Live governed tool catalog", content: { "application/json": { schema: { type: "object" } } } },
            "401": { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
          },
        },
      },
      "/actions/v1/tools/{toolName}/invoke": {
        post: {
          operationId: "useMandalaTool",
          summary: "Invoke one governed Mandala tool",
          description:
            "Use the exact tool name and arguments from listMandalaTools. Every invocation needs a concrete intent. Set confirmDestructive only after the user explicitly approves a destructive operation.",
          "x-openai-isConsequential": true,
          parameters: [{
            name: "toolName",
            in: "path",
            required: true,
            description: "Exact name returned by listMandalaTools",
            schema: { type: "string", pattern: "^[A-Za-z0-9_.:-]{1,128}$" },
          }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["intent", "arguments"],
                  properties: {
                    intent: {
                      type: "string",
                      minLength: 1,
                      maxLength: MAX_INTENT_CHARS,
                      description: "Concrete purpose authorized by the current user request",
                    },
                    arguments: {
                      type: "object",
                      additionalProperties: true,
                      description: "Arguments matching this tool's live inputSchema",
                    },
                    evidence: {
                      type: "object",
                      additionalProperties: true,
                      description: "Optional world, timeline, source, approval, or provenance references",
                    },
                    confirmDestructive: {
                      type: "boolean",
                      default: false,
                      description: "True only after explicit user approval when destructiveHint is true",
                    },
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "200": { description: "Tool result and deterministic evidence receipt", content: { "application/json": { schema: { type: "object" } } } },
            "400": { description: "Invalid intent or arguments", content: { "application/json": { schema: errorSchema } } },
            "401": { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
            "409": { description: "Explicit confirmation required", content: { "application/json": { schema: errorSchema } } },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        BearerAuth: { type: "http", scheme: "bearer" },
      },
    },
  };
}

function privacyHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mandala Action Privacy</title></head><body><main><h1>Mandala Sovereign Tool Gateway</h1><p>The gateway sends only the tool name, declared intent, arguments, and evidence supplied for an invocation to the operator-controlled Mandala runtime.</p><p>API keys are used for authorization and are not returned in responses. Rendered media may be stored under content-addressed filenames so ChatGPT can display the result. Mandala tool-specific retention and external-provider behavior remain visible in each tool's catalog description and result provenance.</p><p>Do not expose the gateway without HTTPS and a configured API key.</p></main></body></html>`;
}

/** Return true when the request belongs to the Action surface. */
export async function handleMandalaActionRequest(
  req: IncomingMessage,
  res: ServerResponse,
  port: number,
  url: URL,
): Promise<boolean> {
  if (!url.pathname.startsWith("/actions/")) return false;
  try {
    if (req.method === "GET" && url.pathname === "/actions/openapi.json") {
      writeJson(res, 200, createMandalaActionOpenApi(publicBaseUrl(req)));
      return true;
    }
    if (req.method === "GET" && url.pathname === "/actions/privacy") {
      const body = privacyHtml();
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
      });
      res.end(body);
      return true;
    }
    if (req.method === "GET" && url.pathname === "/actions/v1/status") {
      writeJson(res, 200, {
        ok: true,
        schemaVersion: ACTION_SCHEMA_VERSION,
        name: "Mandala Sovereign Tool Gateway",
        authConfigured: Boolean(expectedActionKey()),
        mcpUrl: mcpUrl(port).toString(),
        toolScope: configuredAllowlist() === null ? "all-governed-tools" : "operator-allowlist",
      });
      return true;
    }

    const assetMatch = ASSET_PATH_PATTERN.exec(url.pathname);
    if (req.method === "GET" && assetMatch) {
      const [, digest, extension] = assetMatch;
      const filePath = path.join(getRenderDir(), `${digest}.${extension}`);
      if (!fs.existsSync(filePath)) throw new ActionHttpError(404, "ASSET_NOT_FOUND", "asset not found");
      const mimeType = Object.entries(MEDIA_EXTENSIONS).find(([, value]) => value === extension)?.[0]
        ?? "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": mimeType,
        "Content-Length": fs.statSync(filePath).size,
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      fs.createReadStream(filePath).pipe(res);
      return true;
    }

    requireActionAuthorization(req);
    if (req.method === "GET" && url.pathname === "/actions/v1/tools") {
      const tools = await listGovernedTools(port);
      const catalog = { tools };
      writeJson(res, 200, {
        ok: true,
        schemaVersion: ACTION_SCHEMA_VERSION,
        count: tools.length,
        catalogDigest: sha256Canonical(catalog),
        tools,
      });
      return true;
    }
    const invokeMatch = /^\/actions\/v1\/tools\/([^/]+)\/invoke$/.exec(url.pathname);
    if (req.method === "POST" && invokeMatch) {
      const toolName = decodeURIComponent(invokeMatch[1]!);
      const body = await readJsonBody(req);
      const result = await invokeGovernedTool(port, toolName, body, publicBaseUrl(req));
      writeJson(res, 200, result);
      return true;
    }
    throw new ActionHttpError(404, "ACTION_ROUTE_NOT_FOUND", "unknown Mandala Action route");
  } catch (error) {
    if (error instanceof ActionHttpError) {
      actionError(res, error);
    } else {
      console.error("Mandala Action gateway failed", error);
      actionError(
        res,
        new ActionHttpError(502, "MANDALA_TOOL_GATEWAY_ERROR", error instanceof Error ? error.message : String(error)),
      );
    }
    return true;
  }
}
