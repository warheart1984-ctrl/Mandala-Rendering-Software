using SovereignX.CIEMS.Engine.Runtime;

namespace SovereignX.CIEMS.Engine.Governance;

public class GovernanceKernelTests
{
    [Fact]
    public void Ctor_Sets_Default_CharterId()
    {
        var ckl = new ConstitutionalKnowledgeLayer(Array.Empty<PolicyRule>());
        var kernel = new GovernanceKernel(ckl);
        Assert.Equal("charter.4dce.v1", kernel.CharterId);
    }

    [Fact]
    public void EvaluateIntent_Allows_With_Valid_Input()
    {
        var ckl = new ConstitutionalKnowledgeLayer(Array.Empty<PolicyRule>());
        var kernel = new GovernanceKernel(ckl);
        var intent = new IntentRecord { Id = "i1", Actor = "test", Type = "play_timeline", World = "w1" };
        var evidence = new EvidenceBundle { Id = "ev-001", WorldId = "w1" };
        var result = kernel.EvaluateIntent(intent, evidence);
        Assert.True(result.Ok);
        Assert.Equal("i1", result.IntentId);
    }

    [Fact]
    public void EvaluateIntent_Denies_Null_Intent()
    {
        var ckl = new ConstitutionalKnowledgeLayer(Array.Empty<PolicyRule>());
        var kernel = new GovernanceKernel(ckl);
        var result = kernel.EvaluateIntent(null!, null!);
        Assert.False(result.Ok);
        Assert.Contains("policy-no-execution-without-intent", result.Violations);
    }

    [Fact]
    public void EvaluateIntent_Denies_Play_Timeline_Without_World()
    {
        var policies = new List<PolicyRule>
        {
            new() { Id = "play_timeline_requires_world", Rule = "deny_if_false", Condition = "play_timeline_requires_world" },
        };
        var ckl = new ConstitutionalKnowledgeLayer(policies);
        var kernel = new GovernanceKernel(ckl);
        var intent = new IntentRecord { Id = "i2", Actor = "test", Type = "play_timeline", World = null! };
        var evidence = new EvidenceBundle { Id = "ev-001" };
        var result = kernel.EvaluateIntent(intent, evidence);
        Assert.False(result.Ok);
    }

    [Fact]
    public void EvaluateIntent_Denies_Without_Actor()
    {
        var policies = new List<PolicyRule>
        {
            new() { Id = "actor_has_contract", Rule = "deny_if_false", Condition = "actor_has_contract" },
        };
        var ckl = new ConstitutionalKnowledgeLayer(policies);
        var kernel = new GovernanceKernel(ckl);
        var intent = new IntentRecord { Id = "i3", Actor = "", Type = "play_timeline", World = "w1" };
        var evidence = new EvidenceBundle { Id = "ev-001" };
        var result = kernel.EvaluateIntent(intent, evidence);
        Assert.False(result.Ok);
        Assert.Contains("actor_has_contract", result.Violations);
    }
}
