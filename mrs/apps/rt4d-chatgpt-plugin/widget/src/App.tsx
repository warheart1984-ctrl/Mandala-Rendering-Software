import { useCallback, useEffect, useRef, useState } from "react";
import {
  callTool,
  getOpenAi,
  readToolOutput,
  subscribeToToolOutput,
  type ViewerPayload,
} from "./host";
import { ProvenancePanel } from "./ProvenancePanel";
import { RotationControls } from "./RotationControls";
import { RT4DViewer } from "./RT4DViewer";

const DEMO: ViewerPayload = {
  sceneId: "local-demo",
  rotations: [
    { plane: "XW", speed: 0.7 },
    { plane: "YW", speed: 0.55 },
    { plane: "ZW", speed: 0.2 },
  ],
  projection: { type: "perspective", distance4d: 4, distance3d: 2.5 },
  provenance: {
    intentId: "intent-local",
    timelineId: "timeline-local",
    worldId: "world-local",
    projector: {
      type: "perspective",
      distance4d: 4,
      distance3d: 2.5,
      planes: ["XW", "YW", "ZW"],
    },
    hashes: { sceneSha256: "demo-not-a-hash" },
  },
  continuityState: { continuityVersion: 0 },
  statusTag: "partial",
  visualKind: "dimensional_preview",
};

function speedFor(
  payload: ViewerPayload | null,
  plane: string,
  fallback: number
): number {
  const list = payload?.rotations ?? payload?.scene?.rotations ?? [];
  const hit = list.find((r) => r.plane === plane);
  return typeof hit?.speed === "number" ? hit.speed : fallback;
}

function dist4(payload: ViewerPayload | null): number {
  return (
    payload?.projection?.distance4d ??
    payload?.scene?.projection?.distance4d ??
    payload?.provenance?.projector?.distance4d ??
    4
  );
}

export default function App() {
  const [payload, setPayload] = useState<ViewerPayload | null>(
    () => readToolOutput() ?? DEMO
  );
  const [xw, setXw] = useState(() => speedFor(readToolOutput(), "XW", 0.7));
  const [yw, setYw] = useState(() => speedFor(readToolOutput(), "YW", 0.55));
  const [zw, setZw] = useState(() => speedFor(readToolOutput(), "ZW", 0.2));
  const [distance4d, setDistance4d] = useState(() =>
    dist4(readToolOutput())
  );
  const [playing, setPlaying] = useState(true);
  const [showProv, setShowProv] = useState(false);
  const [showPng, setShowPng] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const inHost = Boolean(getOpenAi()?.callTool);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeToToolOutput((next) => {
      if (!next) return;
      setPayload(next);
      setXw(speedFor(next, "XW", 0.7));
      setYw(speedFor(next, "YW", 0.55));
      setZw(speedFor(next, "ZW", 0.2));
      setDistance4d(dist4(next));
      setStatus(`Bound scene ${next.sceneId ?? "?"}`);
    });
  }, []);

  const pushUpdate = useCallback(
    (next: { xw: number; yw: number; zw: number; distance4d: number }) => {
      setXw(next.xw);
      setYw(next.yw);
      setZw(next.zw);
      setDistance4d(next.distance4d);

      const sceneId = payload?.sceneId;
      if (!sceneId || sceneId === "local-demo" || !inHost) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void (async () => {
          setBusy(true);
          setStatus("Updating scene…");
          try {
            const result = await callTool("update_rt4d_scene", {
              sceneId,
              rotations: [
                { plane: "XW", speed: next.xw },
                { plane: "YW", speed: next.yw },
                { plane: "ZW", speed: next.zw },
              ],
              projection: { distance4d: next.distance4d },
              rePreview: false,
            });
            if (result) {
              setPayload((prev) => ({ ...prev, ...result }));
              setStatus("Scene updated (debounced)");
            } else {
              setStatus("callTool returned empty (host may not support)");
            }
          } catch (err) {
            setStatus(
              err instanceof Error ? err.message : "update_rt4d_scene failed"
            );
          } finally {
            setBusy(false);
          }
        })();
      }, 350);
    },
    [payload?.sceneId, inHost]
  );

  async function regeneratePreview() {
    const sceneId = payload?.sceneId;
    if (!sceneId || sceneId === "local-demo") {
      setStatus("No bound sceneId — create_rt4d_scene first via MCP");
      return;
    }
    if (!inHost) {
      setStatus("Outside MCP host — local Three.js preview only");
      return;
    }
    setBusy(true);
    setStatus("Rendering preview…");
    try {
      const result = await callTool("render_rt4d_preview", {
        sceneId,
        width: 256,
        height: 256,
      });
      if (result) {
        setPayload((prev) => ({ ...prev, ...result }));
        setShowPng(true);
        setStatus(`Preview via ${result.source ?? "unknown"}`);
      }
    } catch (err) {
      setStatus(
        err instanceof Error ? err.message : "render_rt4d_preview failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function inspectProvenance() {
    const sceneId = payload?.sceneId;
    setShowProv(true);
    if (!sceneId || sceneId === "local-demo" || !inHost) return;
    setBusy(true);
    try {
      const result = await callTool("inspect_rt4d_provenance", { sceneId });
      if (result) setPayload((prev) => ({ ...prev, ...result }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>RT4D Viewer</h1>
          <p>
            Phase 2 <strong>partial</strong> · dimensional preview · host:{" "}
            {inHost ? "MCP / ChatGPT" : "local"}
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" disabled={busy} onClick={() => void regeneratePreview()}>
            Regenerate preview
          </button>
          <button type="button" disabled={busy} onClick={() => void inspectProvenance()}>
            Provenance
          </button>
          <button type="button" onClick={() => setShowPng((v) => !v)}>
            {showPng ? "Hide PNG" : "Show PNG"}
          </button>
        </div>
      </header>

      <div className="main">
        <RT4DViewer
          angles={{ xw, yw, zw }}
          distance4d={distance4d}
          playing={playing}
          previewUrl={payload?.previewUrl}
          showOverlayPreview={showPng}
        />
        <ProvenancePanel
          payload={payload}
          visible={showProv}
          onClose={() => setShowProv(false)}
        />
      </div>

      <RotationControls
        xw={xw}
        yw={yw}
        zw={zw}
        distance4d={distance4d}
        onChange={pushUpdate}
      />

      <footer className="status">
        <span>{status}</span>
        <span className="mono">{payload?.sceneId ?? "—"}</span>
      </footer>
    </div>
  );
}
