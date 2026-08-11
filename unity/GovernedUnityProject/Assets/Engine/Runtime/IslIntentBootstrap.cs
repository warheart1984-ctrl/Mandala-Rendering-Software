using SovereignX.CIEMS.Engine.Runtime;
using SovereignX.CIEMS.Engine.Scripting;
using UnityEngine;

/// <summary>
/// Boot: TextAsset ISL → CompileAndEvaluate → ExecutionOrchestrator.Execute.
/// Attach to an empty GameObject with ExecutionOrchestratorHost + Timeline* components.
/// Status: skeleton — attach in Mythar4DScene and verify Play Mode manually.
/// </summary>
public class IslIntentBootstrap : MonoBehaviour
{
    [Tooltip("Raw Opening4DReveal.isl TextAsset (Assets/Demo/Isl/).")]
    public TextAsset islScript;

    [Tooltip("JSON context: actor, worldId.")]
    [TextArea(2, 6)]
    public string contextJson = "{\"actor\":\"4dce.timeline\",\"worldId\":\"world-mythar-plains\"}";

    public ExecutionOrchestratorHost orchestrator;
    public bool executeOnStart = true;

    void Start()
    {
        if (executeOnStart)
            Run();
    }

    [ContextMenu("Run ISL Intent")]
    public void Run()
    {
        if (islScript == null)
        {
            Debug.LogError("[IslIntentBootstrap] Assign islScript TextAsset.");
            return;
        }
        if (orchestrator == null)
            orchestrator = GetComponent<ExecutionOrchestratorHost>();
        if (orchestrator == null)
        {
            Debug.LogError("[IslIntentBootstrap] Missing ExecutionOrchestratorHost.");
            return;
        }

        var engine = new IslEngine();
        IntentRecord intent = engine.CompileAndEvaluate(islScript.text, contextJson);
        var evidence = new EvidenceBundle
        {
            Id = intent.EvidenceId ?? "ev-open-4d-001",
            Kind = "isl-bootstrap",
            Timestamp = System.DateTime.UtcNow.ToString("o"),
            WorldId = intent.World,
            TimelineId = intent.Timeline,
        };
        var decision = orchestrator.Execute(intent, evidence);
        Debug.Log($"[IslIntentBootstrap] {decision.Verdict}: {decision.Reason} intent={intent.Id}");
    }
}
