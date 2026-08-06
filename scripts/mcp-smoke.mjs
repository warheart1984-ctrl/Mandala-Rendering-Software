// MRS MCP/REST intelligent-service smoke probe.
// Boots mrs/mcp/server.js, checks REST /health /ready /version, MCP JSON-RPC
// health, and /openapi.json availability, then shuts the server down.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '../mrs/mcp/server.js');

const MCP_PORT = process.env.MRS_MCP_PORT || 8080;
const REST_PORT = process.env.MRS_REST_PORT || 8081;
const OAS_PORT = Number(REST_PORT) + 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, body) {
  const res = await fetch(url, body ? {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  } : undefined);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

let server;
try {
  server = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    stdio: 'ignore',
  });

  // Wait for boot
  let up = false;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try {
      const r = await getJson(`http://localhost:${REST_PORT}/health`);
      if (r.status === 200) { up = true; break; }
    } catch { /* not up yet */ }
  }
  if (!up) throw new Error('server did not become healthy within 12s');

  const results = {};

  const health = await getJson(`http://localhost:${REST_PORT}/health`);
  results.health = { status: health.status, ok: health.json?.ok };

  const ready = await getJson(`http://localhost:${REST_PORT}/ready`);
  results.ready = { status: ready.status, ready: ready.json?.ready };

  const version = await getJson(`http://localhost:${REST_PORT}/version`);
  results.version = { status: version.status, name: version.json?.name, version: version.json?.version };

  const mcp = await getJson(`http://localhost:${MCP_PORT}/`, { toolId: 'mrs.health', params: {}, context: {} });
  results.mcp = { status: mcp.status, toolId: mcp.json?.toolId };

  const oas = await getJson(`http://localhost:${OAS_PORT}/openapi.json`);
  results.openapi = { status: oas.status, title: oas.json?.info?.title, paths: Object.keys(oas.json?.paths || {}).length };

  const failures = Object.entries(results).filter(([, v]) => !(v.status >= 200 && v.status < 300));
  const pass = failures.length === 0 && results.health.ok === true && results.ready.ready === true;

  console.log(JSON.stringify({ pass, results }, null, 2));
  process.exitCode = pass ? 0 : 1;
} catch (err) {
  console.error('SMOKE FAIL', err.message);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await sleep(300);
  }
}
