using System;
using SovereignX.CIEMS.Engine.CSSV;
using SovereignX.CIEMS.Engine.Governance;
using SovereignX.CIEMS.Engine.Runtime;
using UnityEngine;

/// <summary>
/// Host ExecutionOrchestrator: GK.EvaluateIntent → timeline play or movie capture if allowed.
/// Status: partial — movie pipeline wired; Play Mode not CI-verified.
/// </summary>
public class ExecutionOrchestratorHost : MonoBehaviour
{
    public TimelineExecutor timelineExecutor;
    public GovernedMovieCapture movieCapture;
    public string policiesStreamingPath = "policies/default.policies.json";

    GovernanceKernel _kernel;
    ConstitutionalKnowledgeLayer _ckl;

    void Awake()
    {
        if (timelineExecutor == null)
            timelineExecutor = GetComponent<TimelineExecutor>();
        if (movieCapture == null)
            movieCapture = GetComponent<GovernedMovieCapture>();
        EnsureKernel();
    }

    void EnsureKernel()
    {
        if (_kernel != null) return;
        var path = System.IO.Path.Combine(Application.streamingAssetsPath, policiesStreamingPath);
        if (System.IO.File.Exists(path))
            _ckl = ConstitutionalKnowledgeLayer.LoadFromFile(path);
        else
        {
            Debug.LogWarning("[ExecutionOrchestrator] Policies file missing; empty CKL.");
            _ckl = new ConstitutionalKnowledgeLayer(Array.Empty<PolicyRule>());
        }
        _kernel = new GovernanceKernel(_ckl);
    }

    public Decision Execute(IntentRecord intent, EvidenceBundle evidence = null)
    {
        EnsureKernel();
        if (evidence == null)
        {
            evidence = new EvidenceBundle
            {
                Id = intent?.EvidenceId ?? "ev-unity-bootstrap",
                Kind = "unity",
                Timestamp = DateTime.UtcNow.ToString("o"),
                WorldId = intent?.World,
                TimelineId = intent?.Timeline,
            };
        }

        var decision = _kernel.EvaluateIntent(intent, evidence);
        CssvRegistry.EnsureInstance()?.RegisterTransition(new CssvTransitionRecord
        {
            Id = "tx-" + (intent?.Id ?? "unknown"),
            Intent = intent,
            Evidence = evidence,
            Decision = decision,
            Authority = intent?.Actor ?? "runtime.unity",
            TimeSeconds = Time.timeAsDouble,
        });

        if (!decision.Ok)
        {
            Debug.LogWarning($"[ExecutionOrchestrator] Denied: {decision.Reason} [{string.Join(",", decision.Violations)}]");
            return decision;
        }

        if (intent == null)
            return decision;

        var type = intent.Type ?? intent.Kind;
        if (IsMovieIntent(type) && movieCapture != null)
        {
            movieCapture.StartGovernedRecord(intent, decision);
        }
        else if ((type == "play_timeline") && timelineExecutor != null)
        {
            timelineExecutor.Play(intent);
        }

        return decision;
    }

    static bool IsMovieIntent(string type)
    {
        return type == "artifact.movie" ||
               type == "artifact.movie.export" ||
               type == "render.session" ||
               type == "render.session.start";
    }
}
