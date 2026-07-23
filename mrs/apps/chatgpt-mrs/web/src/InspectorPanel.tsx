import type { Scene4DDTO } from "@mrs/scene-schema";
import { Badge, Button } from "./ui";
import type { InspectResult } from "./types";
import { getOpenAi } from "./types";

export interface InspectorPanelProps {
  scene: Scene4DDTO | null;
  result: InspectResult;
  visible: boolean;
  onClose?: () => void;
}

export function InspectorPanel({
  scene,
  result,
  visible,
  onClose,
}: InspectorPanelProps) {
  if (!visible) return null;

  async function askChatGpt() {
    const openai = getOpenAi();
    if (!openai?.sendFollowUpMessage) {
      console.warn("sendFollowUpMessage unavailable outside ChatGPT host");
      return;
    }
    await openai.sendFollowUpMessage({
      prompt:
        "Explain this point's 4D geometry and differential data from the MRS inspector result.",
    });
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 border-l border-[var(--mrs-border)] bg-[var(--mrs-panel)] p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium tracking-wide">Inspector</div>
        {onClose ? (
          <Button className="px-2 py-0.5 text-xs" onClick={onClose}>
            Hide
          </Button>
        ) : null}
      </div>
      {scene ? (
        <div className="flex flex-wrap gap-1">
          <Badge tone="accent">{scene.surface}</Badge>
          <Badge>{scene.quality}</Badge>
          <Badge>res {scene.resolution}</Badge>
        </div>
      ) : (
        <Badge tone="warn">no scene</Badge>
      )}
      <pre className="max-h-64 overflow-auto rounded border border-[var(--mrs-border)] bg-[#0e1216] p-2 text-[11px] leading-relaxed text-[var(--mrs-muted)]">
        {result
          ? JSON.stringify(result, null, 2)
          : "Click the surface to inspect a point."}
      </pre>
      <Button onClick={() => void askChatGpt()}>Ask ChatGPT</Button>
    </aside>
  );
}
