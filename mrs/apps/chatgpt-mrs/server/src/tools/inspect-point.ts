import { z } from "zod";
import { MRSInspector4D } from "@mrs/renderer-core/inspector";
import { getSurface, sampleSurface } from "@mrs/renderer-core/surfaces";
import { getSceneOrThrow } from "../scene-store.js";
import { toCoreSurfaceId } from "../mrs-adapter/surface-map.js";
import type { RendererClient } from "../mrs-adapter/renderer-client.js";

export const inspectPointInputShape = {
  sceneId: z.string(),
  projectedX: z.number().optional(),
  projectedY: z.number().optional(),
  viewportWidth: z.number().optional(),
  viewportHeight: z.number().optional(),
  origin4d: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .optional(),
  direction4d: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .optional(),
};

const parser = z.object(inspectPointInputShape).refine(
  (v) =>
    (v.origin4d && v.direction4d) ||
    (v.projectedX !== undefined && v.projectedY !== undefined),
  { message: "Provide screen coords or origin4d+direction4d" }
);

export async function handleInspectPoint(
  args: unknown,
  client: RendererClient
): Promise<{
  result: Record<string, unknown>;
  text: string;
  path: "local_inspector" | "livelink";
}> {
  const parsed = parser.parse(args ?? {});
  const scene = getSceneOrThrow(parsed.sceneId);

  if (
    parsed.projectedX !== undefined &&
    parsed.projectedY !== undefined &&
    process.env.MRS_INSPECT_VIA_LIVELINK === "1"
  ) {
    const ll = await client.inspectScreen({
      x: parsed.projectedX,
      y: parsed.projectedY,
      width: parsed.viewportWidth ?? 640,
      height: parsed.viewportHeight ?? 480,
    });
    if (ll.ok) {
      return {
        result: ll.message as Record<string, unknown>,
        text: "Inspect via LiveLink",
        path: "livelink",
      };
    }
  }

  const mesh = sampleSurface(
    getSurface(toCoreSurfaceId(scene.surface)),
    scene.resolution
  );
  const inspector = new MRSInspector4D({ mesh, sceneId: scene.id });

  let wire: unknown;
  if (parsed.origin4d && parsed.direction4d) {
    wire = inspector.handleWireMessage({
      type: "inspect_ray",
      schemaVersion: "1.1",
      origin: {
        x: parsed.origin4d[0],
        y: parsed.origin4d[1],
        z: parsed.origin4d[2],
        w: parsed.origin4d[3],
      },
      direction: {
        x: parsed.direction4d[0],
        y: parsed.direction4d[1],
        z: parsed.direction4d[2],
        w: parsed.direction4d[3],
      },
    });
  } else {
    wire = inspector.handleWireMessage({
      type: "inspect_screen",
      schemaVersion: "1.1",
      x: parsed.projectedX,
      y: parsed.projectedY,
      width: parsed.viewportWidth ?? 640,
      height: parsed.viewportHeight ?? 480,
    });
  }

  const result = (wire ?? {}) as Record<string, unknown>;
  return {
    result,
    text: "Inspect via in-process MRSInspector4D",
    path: "local_inspector",
  };
}
