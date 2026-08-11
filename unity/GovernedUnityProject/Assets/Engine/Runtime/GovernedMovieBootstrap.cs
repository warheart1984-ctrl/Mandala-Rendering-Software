using System.Collections.Generic;
using SovereignX.CIEMS.Engine.Runtime;
using UnityEngine;

/// <summary>
/// One-shot: submit governed artifact.movie intent through ExecutionOrchestratorHost.
/// Attach with ExecutionOrchestratorHost + GovernedMovieCapture (+ optional TimelineExecutor).
/// </summary>
public class GovernedMovieBootstrap : MonoBehaviour
{
    public ExecutionOrchestratorHost orchestrator;
    public float seconds = 8f;
    public int fps = 30;
    public string worldId = "world-mythar-plains";
    public string timelineId = "opening_4d_reveal";
    public bool executeOnStart;

    void Start()
    {
        if (executeOnStart)
            Run();
    }

    [ContextMenu("Make Governed Movie")]
    public void Run()
    {
        if (orchestrator == null)
            orchestrator = GetComponent<ExecutionOrchestratorHost>();
        if (orchestrator == null)
        {
            Debug.LogError("[MovieBootstrap] Missing ExecutionOrchestratorHost.");
            return;
        }

        var intent = new IntentRecord
        {
            Id = "movie-" + System.DateTime.UtcNow.Ticks,
            Type = "artifact.movie",
            Kind = "artifact.movie",
            Actor = "runtime.unity",
            World = worldId,
            Timeline = timelineId,
            EvidenceId = "ev-unity-movie-001",
            Goal = $"Record governed {seconds}s PNG sequence",
            Params = new Dictionary<string, object>
            {
                ["seconds"] = seconds,
                ["fps"] = fps,
            },
        };

        var evidence = new EvidenceBundle
        {
            Id = "ev-unity-movie-001",
            Kind = "movie",
            Timestamp = System.DateTime.UtcNow.ToString("o"),
            WorldId = worldId,
            TimelineId = timelineId,
            Fields = new Dictionary<string, object>
            {
                ["evidenceIds"] = new List<string> { "ev-unity-movie-001" },
                ["seconds"] = seconds,
            },
        };

        var decision = orchestrator.Execute(intent, evidence);
        Debug.Log($"[MovieBootstrap] {decision.Verdict}: {decision.Reason}");
    }
}
