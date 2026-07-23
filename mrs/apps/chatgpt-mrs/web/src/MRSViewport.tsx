import { useState } from "react";
import { CanvasHost } from "@mrs/renderer-web";
import type { Scene4DDTO } from "@mrs/scene-schema";
import { Badge, Button } from "./ui";
import { getOpenAi, type InspectResult } from "./types";

export interface MRSViewportProps {
  scene: Scene4DDTO;
  onInspectResult?: (result: InspectResult) => void;
}

export function MRSViewport({ scene, onInspectResult }: MRSViewportProps) {
  const [backend, setBackend] = useState("canvas2d");

  async function onMeshClick(projected2D: { x: number; y: number }) {
    const openai = getOpenAi();
    if (!openai?.callTool) {
      onInspectResult?.({
        status: "declared",
        detail: "callTool unavailable outside ChatGPT — local click coords only",
        projected2D,
        sceneId: scene.id,
      });
      return;
    }
    const raw = await openai.callTool("inspect_4d_point", {
      sceneId: scene.id,
      projectedX: projected2D.x,
      projectedY: projected2D.y,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    const structured =
      raw && typeof raw === "object" && "structuredContent" in raw
        ? (raw as { structuredContent: InspectResult }).structuredContent
        : (raw as InspectResult);
    onInspectResult?.(structured);
  }

  async function fullscreen() {
    await getOpenAi()?.requestDisplayMode?.({ mode: "fullscreen" });
  }

  async function exportScene() {
    const openai = getOpenAi();
    if (!openai?.callTool) return;
    await openai.callTool("export_4d_scene", {
      sceneId: scene.id,
      format: "json",
    });
  }

  async function share() {
    await getOpenAi()?.sendFollowUpMessage?.({
      prompt: `Share this MRS 4D scene (${scene.surface}, id=${scene.id}).`,
    });
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--mrs-border)] px-3 py-2">
        <div className="text-sm font-medium tracking-wide">MRS Viewport</div>
        <Badge tone="accent">{scene.surface}</Badge>
        <Badge tone={backend === "canvas2d" ? "neutral" : "warn"}>
          {backend === "canvas2d"
            ? "Canvas2D"
            : "WebGPU optional/declared — Canvas2D active"}
        </Badge>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => void fullscreen()}>Fullscreen</Button>
          <Button onClick={() => void exportScene()}>Export</Button>
          <Button onClick={() => void share()}>Share</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <CanvasHost
          spec={scene}
          onMeshClick={(p) => void onMeshClick(p)}
          onBackend={setBackend}
        />
      </div>
    </div>
  );
}
