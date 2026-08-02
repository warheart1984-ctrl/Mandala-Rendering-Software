import type { ViewerPayload } from "./host";

export type ProvenancePanelProps = {
  payload: ViewerPayload | null;
  visible: boolean;
  onClose: () => void;
};

export function ProvenancePanel({
  payload,
  visible,
  onClose,
}: ProvenancePanelProps) {
  if (!visible) return null;

  const p = payload?.provenance;
  const hashes = p?.hashes ?? {};
  const projector = p?.projector ?? payload?.projection ?? {};
  const continuityVersion =
    payload?.continuityState?.continuityVersion ?? "—";

  return (
    <aside className="prov-panel" aria-label="Provenance">
      <header>
        <strong>Provenance</strong>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <dl>
        <dt>sceneId</dt>
        <dd>{payload?.sceneId ?? "—"}</dd>
        <dt>sceneSha256</dt>
        <dd className="mono">{hashes.sceneSha256 ?? "—"}</dd>
        <dt>previewSha256</dt>
        <dd className="mono">
          {hashes.previewSha256 ?? payload?.sha256 ?? "—"}
        </dd>
        <dt>projector</dt>
        <dd>
          {typeof projector === "object" && projector
            ? `${(projector as { type?: string }).type ?? "perspective"} d4=${
                (projector as { distance4d?: number }).distance4d ?? "—"
              } d3=${
                (projector as { distance3d?: number }).distance3d ?? "—"
              }`
            : "—"}
        </dd>
        <dt>planes</dt>
        <dd>
          {Array.isArray((projector as { planes?: string[] }).planes)
            ? (projector as { planes: string[] }).planes.join(", ")
            : payload?.rotations?.map((r) => r.plane).join(", ") ?? "—"}
        </dd>
        <dt>continuityVersion</dt>
        <dd>{String(continuityVersion)}</dd>
        <dt>intent / timeline / world</dt>
        <dd className="mono">
          {p?.intentId ?? "—"}
          <br />
          {p?.timelineId ?? "—"}
          <br />
          {p?.worldId ?? "—"}
        </dd>
        <dt>shotEvidence</dt>
        <dd className="mono">
          {payload?.shotEvidence?.shotId ?? "—"}
          <br />
          xf={payload?.shotEvidence?.rt4dTransformHash?.slice(0, 12) ?? "—"}…
        </dd>
      </dl>
      <p className="hint">
        In-memory partial evidence. Verified replay / RT3D persistence /
        export remain declared.
      </p>
    </aside>
  );
}
