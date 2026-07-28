/**
 * CSSV dashboard + ingest server.
 * POST /cql — run constitutional query
 * POST /ingest — append browser session snapshot to ledger
 * GET  /ledger — full ledger JSON
 * GET  /health — liveness
 *
 * Usage: npm run cssv:server
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCql } from "../engine/cssv/cqlParser.js";
import { executeCql } from "../engine/cssv/cqlInterpreter.js";
import {
  appendNdjsonBatch,
  ensureLedgerInitialized,
  loadLedger,
  mergeArtifacts,
} from "../engine/cssv/ledger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_ROOT = __dirname;
const PUBLIC = path.join(__dirname, "public");
const PORT = Number(process.env.CSSV_PORT) || 3000;
const MAX_BODY = 5 * 1024 * 1024;

const ALLOWED_ORIGINS = (process.env.CSSV_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);
const API_KEY = process.env.CSSV_API_KEY ?? "";
const RATE_LIMIT = Number(process.env.CSSV_RATE_LIMIT) || 60;

ensureLedgerInitialized(LEDGER_ROOT);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
};

function cors(res, req) {
  const origin = req?.headers?.origin ?? "";
  if (ALLOWED_ORIGINS.length === 0) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
}

function checkAuth(req) {
  if (!API_KEY) return true;
  return req.headers["x-api-key"] === API_KEY;
}

const rateLimitMap = new Map();
function checkRateLimit(ip, limit = RATE_LIMIT, windowMs = 60000) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > windowMs) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function handleIngest(body) {
  const payload = JSON.parse(body);
  const paths = ensureLedgerInitialized(LEDGER_ROOT);
  let counts = { artifacts: 0, transitions: 0, frames: 0 };

  if (Array.isArray(payload.artifacts) && payload.artifacts.length) {
    counts.artifacts = mergeArtifacts(paths.artifacts, payload.artifacts);
  }
  if (Array.isArray(payload.transitions) && payload.transitions.length) {
    appendNdjsonBatch(paths.transitions, payload.transitions);
    counts.transitions = payload.transitions.length;
  }
  if (Array.isArray(payload.frames) && payload.frames.length) {
    appendNdjsonBatch(paths.frames, payload.frames);
    counts.frames = payload.frames.length;
  }

  return { ok: true, ingested: counts };
}

const server = http.createServer(async (req, res) => {
  cors(res, req);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const clientIp = req.socket.remoteAddress ?? "unknown";

  if (!checkRateLimit(clientIp)) {
    json(res, 429, { error: "Rate limit exceeded" });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { status: "ok", service: "cssv", port: PORT });
    return;
  }

  if (req.method === "POST" && req.url === "/cql") {
    if (!checkAuth(req)) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }
    try {
      const body = await readBody(req);
      const { query } = JSON.parse(body);
      const ast = parseCql(query);
      const ledger = await loadLedger(LEDGER_ROOT);
      const rows = await executeCql(ast, ledger);
      json(res, 200, { rows, count: rows.length });
    } catch (e) {
      json(res, 400, { error: e.message ?? String(e) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/ingest") {
    if (!checkAuth(req)) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }
    try {
      const body = await readBody(req);
      const result = await handleIngest(body);
      json(res, 200, result);
    } catch (e) {
      json(res, 400, { error: e.message ?? String(e) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/ledger") {
    if (!checkAuth(req)) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }
    try {
      const ledger = await loadLedger(LEDGER_ROOT);
      json(res, 200, {
        artifacts: ledger.artifacts,
        transitions: ledger.transitions,
        frames: ledger.frames,
      });
    } catch (e) {
      json(res, 500, { error: e.message ?? String(e) });
    }
    return;
  }

  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.join(PUBLIC, urlPath === "/" ? "index.html" : urlPath.replace(/^\//, ""));
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(path.resolve(PUBLIC)) || !fs.existsSync(resolved)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(resolved);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "text/plain" });
  fs.createReadStream(resolved).pipe(res);
});

server.listen(PORT, () => {
  console.log(`CSSV dashboard: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Ingest: POST http://localhost:${PORT}/ingest`);
  if (API_KEY) console.log("Auth: enabled (X-API-Key header required)");
  if (ALLOWED_ORIGINS.length) console.log(`CORS: restricted to ${ALLOWED_ORIGINS.join(", ")}`);
});

function shutdown(signal) {
  console.log(`CSSV server shutting down (${signal})…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
