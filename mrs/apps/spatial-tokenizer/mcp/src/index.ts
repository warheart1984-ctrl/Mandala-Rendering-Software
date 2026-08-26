/**
 * Streamable HTTP entry — ChatGPT / Codex / MCP Inspector.
 *
 * POST http://localhost:PORT/mcp
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  createSpatialMcpServer,
  SERVER_NAME,
  SERVER_VERSION,
  TOOL_NAMES,
} from "./server.js";

const PORT = Number(process.env.PORT ?? process.env.HOLORT4D_SPATIAL_MCP_PORT ?? 8793);
const mcpPath = "/mcp";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, accept, mcp-session-id, mcp-protocol-version, authorization",
  "Access-Control-Expose-Headers": "mcp-session-id",
} as const;

async function handleStreamableHttp(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

  if (req.method === "GET" || req.method === "DELETE") {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "POST" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed. Use POST /mcp (Streamable HTTP).",
        },
        id: null,
      })
    );
    return;
  }

  const server = createSpatialMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const cleanup = () => {
    void transport.close().catch(() => undefined);
    void server.close().catch(() => undefined);
  };
  res.on("close", cleanup);

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Streamable HTTP request failed", error);
    cleanup();
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        })
      );
    }
  }
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...CORS_HEADERS });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        name: SERVER_NAME,
        version: SERVER_VERSION,
        scheme: "HoloRT4D-Spatial-V1",
        transports: { streamableHttp: `POST ${mcpPath}` },
        tools: [...TOOL_NAMES],
        ui: false,
        billing: "declared",
      })
    );
    return;
  }

  if (url.pathname === mcpPath) {
    await handleStreamableHttp(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found", hint: `POST ${mcpPath}` }));
});

httpServer.listen(PORT, () => {
  console.error(
    `[${SERVER_NAME}@${SERVER_VERSION}] Streamable HTTP on http://localhost:${PORT}${mcpPath}`
  );
  console.error(`Health: http://localhost:${PORT}/health`);
});
