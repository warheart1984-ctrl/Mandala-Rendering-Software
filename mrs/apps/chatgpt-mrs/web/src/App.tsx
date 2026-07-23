import { useEffect, useMemo, useState } from "react";
import type { Scene4DDTO } from "@mrs/scene-schema";
import { MRSViewport } from "./MRSViewport";
import { InspectorPanel } from "./InspectorPanel";
import { Badge } from "./ui";
import {
  getOpenAi,
  readToolOutput,
  type InspectResult,
  type ToolOutputPayload,
} from "./types";

const DEMO_SCENE: Scene4DDTO = {
  id: "local-demo",
  surface: "tesseract",
  rotations: [
    { plane: "XW", speed: 0.7 },
    { plane: "YZ", speed: 1.1 },
  ],
  projection: { type: "perspective", distance4d: 4, distance3d: 4 },
  camera: {
    position4d: [0, 0, 0, 4],
    target4d: [0, 0, 0, 0],
  },
  material: { color: "#6ec8ff", opacity: 1, wireframe: true },
  quality: "adaptive",
  resolution: 20,
  time: 0,
};

function extractScene(payload: ToolOutputPayload | null): Scene4DDTO | null {
  if (!payload) return null;
  if (payload.scene && typeof payload.scene === "object") {
    return payload.scene as Scene4DDTO;
  }
  return null;
}

export default function App() {
  const [payload, setPayload] = useState<ToolOutputPayload | null>(() =>
    readToolOutput()
  );
  const [inspect, setInspect] = useState<InspectResult>(null);
  const [showInspector, setShowInspector] = useState(true);
  const inHost = Boolean(getOpenAi());

  useEffect(() => {
    const id = window.setInterval(() => {
      setPayload(readToolOutput());
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const scene = useMemo(() => extractScene(payload) ?? DEMO_SCENE, [payload]);
  const displayMode = getOpenAi()?.displayMode ?? "inline";

  useEffect(() => {
    if (displayMode === "inline") setShowInspector(false);
    else setShowInspector(true);
  }, [displayMode]);

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <header className="flex items-center gap-2 border-b border-[var(--mrs-border)] px-3 py-2 text-xs text-[var(--mrs-muted)]">
        <span className="text-[var(--mrs-fg)]">MRS × ChatGPT</span>
        <Badge>{inHost ? "host: chatgpt" : "host: local preview"}</Badge>
        <Badge>{displayMode}</Badge>
      </header>
      <div className="flex min-h-0 flex-1">
        <MRSViewport scene={scene} onInspectResult={setInspect} />
        <InspectorPanel
          scene={scene}
          result={inspect}
          visible={showInspector}
          onClose={() => setShowInspector(false)}
        />
      </div>
    </div>
  );
}
