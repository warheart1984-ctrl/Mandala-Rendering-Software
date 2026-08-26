/**
 * Smoke: load core + spatialize synthetic depth; verify hash round-trip.
 * Also boots Streamable HTTP briefly and lists tools via MCP client.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { loadSpatialCore } from "../src/internal/core.ts";
import { resetRateLimitForTests } from "../src/internal/authorize.ts";
import {
  runSpatialTokenize,
  verifyTokenHash,
  syntheticRamp,
} from "../src/internal/tokenize-logic.ts";
import { SERVER_INSTRUCTIONS, TOOL_NAMES } from "../src/server.ts";

describe("spatial tokenize logic (no HTTP)", () => {
  it("tokenizes synthetic depth deterministically", async () => {
    resetRateLimitForTests();
    const core = await loadSpatialCore();
    const depth = Array.from(syntheticRamp(32));
    const a = runSpatialTokenize(core, {
      mode: "room",
      resolution: 16,
      width: 32,
      height: 32,
      depth,
    });
    const b = runSpatialTokenize(core, {
      mode: "room",
      resolution: 16,
      width: 32,
      height: 32,
      depth,
    });
    assert.equal(a.scheme, "HoloRT4D-Spatial-V1");
    assert.equal(a.cell_count, 256);
    assert.equal(a.hash, b.hash);
    assert.equal(a.depth_status, "enforced");
    const v = verifyTokenHash(core, a.token, a.hash);
    assert.equal(v.match, true);
  });

  it("keeps instructions under ~512 chars for host routing", () => {
    assert.ok(SERVER_INSTRUCTIONS.length > 80);
    assert.ok(
      SERVER_INSTRUCTIONS.length <= 512,
      `instructions length ${SERVER_INSTRUCTIONS.length} > 512`
    );
  });
});

describe("Streamable HTTP MCP smoke", () => {
  let child;
  let client;
  let transport;
  let baseUrl;
  let childOutput = "";

  async function freePort() {
    const socket = createNetServer();
    await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
    const address = socket.address();
    const port = address.port;
    await new Promise((resolve) => socket.close(resolve));
    return port;
  }

  async function waitForHealth(url) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${url}/health`);
        if (response.ok) return;
      } catch {
        // starting
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`server not healthy:\n${childOutput}`);
  }

  before(async () => {
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));
    const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));
    child = spawn(process.execPath, [tsxCli, entry], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (c) => {
      childOutput += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      childOutput += c.toString("utf8");
    });
    await waitForHealth(baseUrl);
    client = new Client({ name: "spatial-mcp-smoke", version: "1.0.0" });
    transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    await client.connect(transport);
  });

  after(async () => {
    try {
      await client?.close();
    } catch {
      // stateless DELETE may fail
    }
    child?.kill();
  });

  it("registers focused spatial tools", async () => {
    const listed = await client.listTools();
    const names = new Set(listed.tools.map((t) => t.name));
    for (const name of TOOL_NAMES) {
      assert.ok(names.has(name), `missing tool ${name}`);
    }
    const tokenize = listed.tools.find((t) => t.name === "spatial_tokenize");
    assert.equal(tokenize.annotations?.readOnlyHint, true);
    assert.equal(tokenize.annotations?.openWorldHint, false);
  });

  it("calls spatial_tokenize with synthetic depth via MCP", async () => {
    const depth = Array.from({ length: 16 * 16 }, (_, i) => (i % 16) / 16);
    const result = await client.callTool({
      name: "spatial_tokenize",
      arguments: {
        mode: "object",
        resolution: 8,
        width: 16,
        height: 16,
        depth,
      },
    });
    assert.equal(result.isError, undefined);
    assert.ok(result.structuredContent?.hash);
    assert.match(result.structuredContent.hash, /^[a-f0-9]{64}$/);
    assert.equal(result.structuredContent.cell_count, 64);
    assert.equal(result.structuredContent.scheme, "HoloRT4D-Spatial-V1");
  });
});
