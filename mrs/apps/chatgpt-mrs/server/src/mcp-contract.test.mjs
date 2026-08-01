import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

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
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`MCP server did not become healthy:\n${childOutput}`);
}

before(async () => {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));
  const entry = fileURLToPath(new URL("./index.ts", import.meta.url));
  child = spawn(process.execPath, [tsxCli, entry], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      PORT: String(port),
      MRS_RENDER_TIMEOUT_MS: "10000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    childOutput += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    childOutput += chunk.toString("utf8");
  });
  await waitForHealth(baseUrl);

  client = new Client({
    name: "mrs-chatgpt-contract-test",
    version: "1.0.0",
  });
  transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  await client.connect(transport);
});

after(async () => {
  try {
    await client?.close();
  } catch {
    // Stateless MCP intentionally rejects DELETE; process teardown is authoritative.
  }
  child?.kill();
});

describe("ChatGPT-facing Streamable HTTP MCP contract", () => {
  it("advertises native image tools separately from the optional viewport", async () => {
    const listed = await client.listTools();
    const byName = new Map(listed.tools.map((tool) => [tool.name, tool]));

    const renderPrompt = byName.get("render_4d_prompt");
    const fullPipeline = byName.get("render_4d_to_3d_pipeline");
    const animePipeline = byName.get("render_governed_anime_pipeline");
    const createScene = byName.get("create_4d_scene");
    assert.ok(renderPrompt);
    assert.ok(fullPipeline);
    assert.ok(animePipeline);
    assert.ok(createScene);
    assert.equal(renderPrompt._meta?.ui, undefined);
    assert.equal(fullPipeline._meta?.ui, undefined);
    assert.equal(animePipeline._meta?.ui, undefined);
    assert.equal(
      createScene._meta?.ui?.resourceUri,
      "ui://mrs-viewport/v1.html"
    );
    assert.equal(renderPrompt.annotations?.readOnlyHint, true);
    assert.equal(fullPipeline.annotations?.openWorldHint, true);
    assert.equal(animePipeline.annotations?.openWorldHint, true);
  });

  it("returns a real RT4D PNG as native MCP image content", async () => {
    const result = await client.callTool({
      name: "render_4d_prompt",
      arguments: {
        prompt: "cyan tesseract lattice",
        quality: "smoke",
        seed: 42,
      },
    });
    assert.equal(result.isError, undefined);
    const image = result.content.find((item) => item.type === "image");
    assert.ok(image);
    assert.equal(image.mimeType, "image/png");
    const png = Buffer.from(image.data, "base64");
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    assert.match(result.structuredContent.render.sha256, /^[a-f0-9]{64}$/);
  });
});
