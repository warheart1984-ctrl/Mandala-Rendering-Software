// mirrors engine/runtime/ExecutionOrchestrator.cs — Unity host uses Runtime/ExecutionOrchestrator.cs (ExecutionOrchestratorHost)
using System;
using SovereignX.CIEMS.Engine.Governance;

namespace SovereignX.CIEMS.Engine.Runtime
{
    public interface ITimelinePlayer
    {
        void Play(IntentRecord intent);
    }

    public sealed class ExecutionOrchestrator
    {
        readonly GovernanceKernel _kernel;
        readonly ITimelinePlayer _timeline;

        public ExecutionOrchestrator(GovernanceKernel kernel, ITimelinePlayer timeline)
        {
            _kernel = kernel ?? throw new ArgumentNullException(nameof(kernel));
            _timeline = timeline ?? throw new ArgumentNullException(nameof(timeline));
        }

        public Decision Execute(IntentRecord intent, EvidenceBundle evidence)
        {
            var decision = _kernel.EvaluateIntent(intent, evidence);
            if (!decision.Ok)
                return decision;

            if (intent != null &&
                (intent.Type == "play_timeline" || intent.Kind == "play_timeline"))
            {
                _timeline.Play(intent);
            }

            return decision;
        }
    }
}
