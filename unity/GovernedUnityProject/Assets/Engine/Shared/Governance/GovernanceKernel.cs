// mirrors engine/governance/GovernanceKernel.cs
using System.Linq;
using SovereignX.CIEMS.Engine.Runtime;

namespace SovereignX.CIEMS.Engine.Governance
{
    public sealed class GovernanceKernel
    {
        readonly IConstitutionalKnowledgeLayer _ckl;
        public string CharterId { get; set; } = "charter.4dce.v1";

        public GovernanceKernel(IConstitutionalKnowledgeLayer ckl)
        {
            _ckl = ckl;
        }

        public Decision EvaluateIntent(IntentRecord intent, EvidenceBundle evidence)
        {
            var worldId = intent?.World ?? "*";
            if (intent?.Constraints != null &&
                intent.Constraints.TryGetValue("worldId", out var w) &&
                w is string ws &&
                !string.IsNullOrEmpty(ws))
            {
                worldId = intent.World ?? ws;
            }

            var policies = _ckl.GetPoliciesForWorld(worldId);
            var precedents = _ckl.GetPrecedents(intent);
            var decision = DecisionEngine.Resolve(intent, evidence, policies, precedents);

            decision.CharterId = CharterId;
            decision.IntentId = intent?.Id;
            decision.WorldId = worldId;
            decision.PoliciesApplied = policies.Policies.Select(p => p.Id).ToList();
            decision.PrecedentCount = precedents.Count;

            _ckl.RecordPrecedent(intent, decision);
            return decision;
        }
    }
}
