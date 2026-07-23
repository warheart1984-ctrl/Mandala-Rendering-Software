import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { getSurface, sampleSurface } from "@mrs/renderer-core/surfaces";
import { ExportManager } from "@mrs/renderer-core/pipeline/ExportManager";
import { getSceneOrThrow } from "../scene-store.js";
import { toCoreSurfaceId } from "../mrs-adapter/surface-map.js";

// Declared (Drive-G-1): optional B2 upload after local export is not wired here.
// Operators may call uploadArtifactIfConfigured from @mrs/storage-b2 — see docs/ops/BACKBLAZE_B2_S3.md.
// Do not treat B2 as “cloud rendering complete.”

export const exportSceneInputShape = {
  sceneId: z.string(),
  format: z
    .enum(["glTF", "json", "mesh", "image", "replay"])
    .describe(
      "json/mesh are in-process; glTF/image use ExportManager when canvas is available; replay is not_implemented"
    ),
};

const parser = z.object(exportSceneInputShape);

export async function handleExportScene(args: unknown): Promise<{
  structured: Record<string, unknown>;
  text: string;
}> {
  const parsed = parser.parse(args ?? {});
  const scene = getSceneOrThrow(parsed.sceneId);
  const coreId = toCoreSurfaceId(scene.surface);
  const mesh = sampleSurface(getSurface(coreId), scene.resolution);

  if (parsed.format === "json") {
    return {
      structured: {
        format: "json",
        scene,
        status: "ok",
      },
      text: `Exported scene ${scene.id} as JSON DTO`,
    };
  }

  if (parsed.format === "mesh") {
    return {
      structured: {
        format: "mesh",
        sceneId: scene.id,
        surface: scene.surface,
        coreSurfaceId: coreId,
        vertexCount: mesh.vertices.length,
        faceCount: mesh.faces.length,
        edgeCount: mesh.edges.length,
        mesh,
        status: "ok",
      },
      text: `Exported mesh for scene ${scene.id}`,
    };
  }

  if (parsed.format === "replay") {
    return {
      structured: {
        format: "replay",
        status: "not_implemented",
        detail:
          "declared: replay package export is not wired through ExportManager in this slice",
      },
      text: "export_4d_scene format=replay is not_implemented",
    };
  }

  const outDir = path.join(os.tmpdir(), "mrs-chatgpt-export", scene.id);
  fs.mkdirSync(outDir, { recursive: true });
  const exporter = new ExportManager({ outputDir: outDir });

  try {
    if (parsed.format === "glTF") {
      const outputPath = path.join(outDir, "scene.gltf");
      const result = await exporter.exportGLTF(
        mesh,
        {
          surface: coreId,
          width: 640,
          height: 480,
          frames: 1,
          fps: 1,
        },
        outputPath
      );
      return {
        structured: {
          format: "glTF",
          filePath: outputPath,
          result,
          status: "ok",
        },
        text: `Exported glTF to ${outputPath}`,
      };
    }

    const outputPath = path.join(outDir, "frame-000000.png");
    const buf = await exporter.exportPNG(
      mesh,
      {
        surface: coreId,
        width: 640,
        height: 480,
        frames: 1,
        fps: 1,
        durationSec: 1,
      },
      0,
      outputPath
    );
    return {
      structured: {
        format: "image",
        filePath: outputPath,
        base64Data: Buffer.from(buf).toString("base64"),
        status: "ok",
      },
      text: `Exported PNG to ${outputPath}`,
    };
  } catch (err) {
    return {
      structured: {
        format: parsed.format,
        status: "not_implemented",
        detail: `ExportManager failed (often missing native canvas): ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      text: `export_4d_scene format=${parsed.format} failed — see structured.detail`,
    };
  }
}
