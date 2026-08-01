import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import { handleRender4dTo3d } from "./render-4d-to-3d.js";
import { handleRenderGovernedAnime } from "./render-governed-anime.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

let server;
let baseUrl;
const requests = [];

function json(res, body) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (
      url.pathname.startsWith("/preview/") ||
      url.pathname.startsWith("/api/preview/")
    ) {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(PNG);
      return;
    }

    let body = null;
    if (req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push({ path: url.pathname, body });
    }

    if (url.pathname === "/health") {
      json(res, {
        status: "ok",
        image_backend: "rt4d",
        rt4d: { available: true },
        prompt_scene: { available: true },
        engine3d_still: { available: true },
      });
      return;
    }
    if (url.pathname === "/api/generate") {
      json(res, {
        run_id: "11111111-1111-1111-1111-111111111111",
        preview_url: "/preview/rt4d",
        provider: "rt4d-render",
        model: "mrs-renderer-core/rt4d",
        asset_sha256: "a".repeat(64),
        kind: "rt4d-still",
      });
      return;
    }
    if (url.pathname === "/api/prompt-to-scene") {
      json(res, {
        ok: true,
        engine3dWorldDocument: {
          id: "bridge-world",
          version: "1.0",
          objects: [],
        },
        render: {
          run_id: "22222222-2222-2222-2222-222222222222",
          provider: "scene-spec-render",
          model: "mrs-renderer-core/scene-spec",
          asset_sha256: "b".repeat(64),
          kind: "prompt-scene-bridge-rt4d",
        },
      });
      return;
    }
    if (url.pathname === "/api/engine3d-still") {
      json(res, {
        structure: {
          run_id: "33333333-3333-3333-3333-333333333333",
          preview_url: "/preview/engine3d",
          provider: "engine3d-still",
          model: "mrs-engine3d-core/soft-raster",
          asset_sha256: "c".repeat(64),
          kind: "engine3d-still",
        },
        composite: {
          run_id: "44444444-4444-4444-4444-444444444444",
          preview_url: "/preview/composite",
          provider: "engine3d-rt4d-composite",
          model: "mrs-genblaze/composite",
          asset_sha256: "d".repeat(64),
          kind: "engine3d-rt4d-composite",
        },
      });
      return;
    }
    if (url.pathname === "/api/anime") {
      json(res, {
        lane: "anime",
        style: "anime",
        style_forced: true,
        status: "partial",
        kind: "anime-ue-handoff",
        run_id: "55555555-5555-5555-5555-555555555555",
        dry_run: body.dry_run,
        prompt: body.prompt,
        anime_world_profile_id: "anime.mandala-cel.v1",
        projection_method: body.projection_method,
        anime_lane: {
          contract_version: "1.0",
          status: "declared",
          maturity: "partial",
          promoted: false,
        },
        provenance: {
          lane: "anime",
          style_forced: true,
          structure_plate_used: false,
        },
        structure: null,
        capability_tags: {
          genblaze_api_anime: "partial",
          ue_anime_stylizer: "skeleton/partial",
          promotion: "not_promoted",
        },
        non_claims: ["Not a verified UE 5.3+ compile in this repo"],
      });
      return;
    }

    res.writeHead(404).end("not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.MRS_GENBLAZE_BASE_URL = baseUrl;
});

after(async () => {
  delete process.env.MRS_GENBLAZE_BASE_URL;
  await new Promise((resolve) => server.close(resolve));
});

describe("native 4D to 3D ChatGPT pipeline", () => {
  it("passes prompt-scene structure into Engine3D and returns three native PNGs", async () => {
    const result = await handleRender4dTo3d({
      prompt: "gold glass tesseract cathedral",
      quality: "draft",
      width: 256,
      height: 192,
    });

    assert.equal(result.pipeline.status, "ok");
    assert.equal(result.pipeline.constraints.noDiffusion, true);
    assert.equal(result.pipeline.presentation.imagesArePrimaryEvidence, true);
    assert.deepEqual(result.pipeline.presentation.labels, [
      "RT4D concept",
      "Governed SceneSpecification reveal",
      "Engine3D structure/composite",
    ]);
    assert.match(result.text, /primary visual evidence/);
    assert.match(result.text, /describe only differences visible in the images/);
    assert.equal(result.pipeline.stages.rt4d.runId, "11111111-1111-1111-1111-111111111111");
    assert.equal(result.pipeline.stages.governedScene.runId, "22222222-2222-2222-2222-222222222222");
    assert.equal(
      result.pipeline.stages.governedScene.previewUrl,
      `${baseUrl}/api/preview/22222222-2222-2222-2222-222222222222`
    );
    assert.equal(result.pipeline.stages.engine3d.runId, "33333333-3333-3333-3333-333333333333");
    assert.equal(result.pipeline.stages.composite.runId, "44444444-4444-4444-4444-444444444444");
    assert.equal(
      result.content.filter((item) => item.type === "image").length,
      3
    );

    const engineRequest = requests.find(
      (request) => request.path === "/api/engine3d-still"
    );
    assert.deepEqual(engineRequest.body.world_document, {
      id: "bridge-world",
      version: "1.0",
      objects: [],
    });
    assert.equal(
      engineRequest.body.rt4d_background_run_id,
      "11111111-1111-1111-1111-111111111111"
    );
    assert.equal(engineRequest.body.polish, false);
    assert.equal(engineRequest.body.path_trace, false);
  });

  it("calls the governed anime handoff without claiming UE promotion", async () => {
    const result = await handleRenderGovernedAnime({
      prompt: "mandala oracle anime structure plate",
      dry_run: true,
      render_structure: false,
      projection_method: "projector4d-sot",
      width: 256,
      height: 256,
    });

    assert.equal(result.anime.status, "partial");
    assert.equal(result.anime.lane, "anime");
    assert.equal(result.anime.styleForced, true);
    assert.equal(result.anime.dryRun, true);
    assert.equal(result.anime.animeWorldProfileId, "anime.mandala-cel.v1");
    assert.equal(result.anime.structurePreviewUrl, null);
    assert.match(result.content[1].text, /No structure PNG/);
    assert.match(result.content[0].text, /skeleton\/partial/);
    assert.equal(
      result.content.filter((item) => item.type === "image").length,
      0
    );

    const animeRequest = requests.find(
      (request) => request.path === "/api/anime"
    );
    assert.equal(animeRequest.body.prompt, "mandala oracle anime structure plate");
    assert.equal(animeRequest.body.dry_run, true);
    assert.equal(animeRequest.body.render_structure, false);
    assert.equal(animeRequest.body.projection_method, "projector4d-sot");
  });
});
