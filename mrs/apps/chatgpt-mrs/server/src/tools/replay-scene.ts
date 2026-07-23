import { z } from "zod";
import { getSceneOrThrow, sceneStore } from "../scene-store.js";

export const replaySceneInputShape = {
  sceneId: z.string(),
  source: z
    .enum(["timeline", "cssv"])
    .describe(
      "timeline: attaches declared keyframe placeholders; cssv: not_implemented in this slice"
    ),
  timeRange: z.tuple([z.number(), z.number()]).optional(),
  fps: z.number().optional(),
};

const parser = z.object(replaySceneInputShape);

export async function handleReplayScene(args: unknown): Promise<{
  structured: Record<string, unknown>;
  text: string;
}> {
  const parsed = parser.parse(args ?? {});
  const scene = getSceneOrThrow(parsed.sceneId);

  if (parsed.source === "cssv") {
    return {
      structured: {
        status: "not_implemented",
        source: "cssv",
        detail:
          "declared: CSSV ledger → scene keyframe replay is not wired in the ChatGPT app server",
        scene,
      },
      text: "replay_4d_scene source=cssv is not_implemented",
    };
  }

  const fps = parsed.fps ?? 30;
  const [t0, t1] = parsed.timeRange ?? [0, 2];
  const duration = Math.max(0, t1 - t0);
  const frameCount = Math.max(1, Math.floor(duration * fps));

  const next = {
    ...scene,
    time: t0,
    _replay: {
      status: "declared",
      source: "timeline",
      timeRange: [t0, t1],
      fps,
      frameCount,
      duration,
      note: "Keyframe list is a placeholder; widget uses scene.time / rAF for motion",
    },
  };
  sceneStore.set(scene.id, scene);

  return {
    structured: {
      status: "declared",
      scene: next,
      frameCount,
      duration,
    },
    text: `Attached declared timeline replay metadata to scene ${scene.id} (${frameCount} frames @ ${fps}fps)`,
  };
}
