using SovereignX.CIEMS.Engine.CSSV;
using UnityEngine;

/// <summary>
/// Scene singleton: registers world/timeline artifacts and exposes CSSV sync.
/// Attach alongside ExecutionOrchestratorHost + ProvenanceRecorderBehaviour.
/// </summary>
public class CssvHostBehaviour : MonoBehaviour
{
    public string cssvIngestUrl = "http://localhost:3000/ingest";
    public bool syncOnDestroy;
    public string worldArtifactId = "world-mythar-plains";
    public string timelineArtifactId = "opening_4d_reveal";

    CssvRegistry _registry;

    void Awake()
    {
        _registry = CssvRegistry.EnsureInstance(new UnityCssvHost());
        _registry.RegisterArtifact(new CssvArtifactRecord
        {
            Id = worldArtifactId,
            ArtifactType = "world",
            Payload = new System.Collections.Generic.Dictionary<string, object>
            {
                ["worldId"] = worldArtifactId,
            },
        });
        _registry.RegisterArtifact(new CssvArtifactRecord
        {
            Id = timelineArtifactId,
            ArtifactType = "timeline",
            Payload = new System.Collections.Generic.Dictionary<string, object>
            {
                ["timelineId"] = timelineArtifactId,
            },
        });
    }

    void OnDestroy()
    {
        if (syncOnDestroy && !string.IsNullOrEmpty(cssvIngestUrl))
            _registry?.SyncToServer(this, cssvIngestUrl);
    }

    public CssvRegistry Registry => _registry ?? CssvRegistry.Instance;

    [ContextMenu("Sync CSSV to server")]
    public void SyncNow()
    {
        Registry?.SyncToServer(this, cssvIngestUrl, (ok, msg) =>
            Debug.Log(ok ? $"[CSSV] Synced: {msg}" : $"[CSSV] Sync failed: {msg}"));
    }
}
