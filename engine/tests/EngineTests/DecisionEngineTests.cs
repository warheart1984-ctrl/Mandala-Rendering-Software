using SovereignX.CIEMS.Engine.Runtime;
using SovereignX.CIEMS.Engine.Governance;

namespace EngineTests;

public class DecisionEngineTests
{
    private static IntentRecord MakeIntent(string type = "play_timeline", string world = "w1", string actor = "test")
    {
        return new IntentRecord
        {
            Id = "int-001",
            Actor = actor,
            Type = type,
            World = world,
            Timeline = "intro",
            EvidenceId = "ev-001",
        };
    }

    private static EvidenceBundle MakeEvidence(string id = "ev-001")
    {
        return new EvidenceBundle { Id = id, WorldId = "w1", TimelineId = "intro" };
    }

    [Fact]
    public void Resolve_Allows_When_No_Violations()
    {
        var intent = MakeIntent();
        var evidence = MakeEvidence();
        var policies = new PolicySet { WorldId = "w1", Policies = new List<PolicyRule>() };
        var result = DecisionEngine.Resolve(intent, evidence, policies);
        Assert.True(result.Ok);
        Assert.Equal("allow", result.Verdict);
    }

    [Fact]
    public void Resolve_Denies_When_Actor_Missing()
    {
        var intent = MakeIntent(actor: "");
        var evidence = MakeEvidence();
        var policies = new PolicySet
        {
            WorldId = "w1",
            Policies = new List<PolicyRule>
            {
                new() { Id = "actor_has_contract", Rule = "deny_if_false", Condition = "actor_has_contract" },
            }
        };
        var result = DecisionEngine.Resolve(intent, evidence, policies);
        Assert.False(result.Ok);
        Assert.Contains("actor_has_contract", result.Violations);
    }

    [Fact]
    public void Resolve_Denies_World_Missing()
    {
        var intent = MakeIntent(world: null!);
        var evidence = MakeEvidence();
        var policies = new PolicySet
        {
            WorldId = null,
            Policies = new List<PolicyRule>
            {
                new() { Id = "play_timeline_requires_world", Rule = "deny_if_false", Condition = "play_timeline_requires_world" },
            }
        };
        var result = DecisionEngine.Resolve(intent, evidence, policies);
        Assert.False(result.Ok);
        Assert.Contains("play_timeline_requires_world", result.Violations);
    }

    [Fact]
    public void Resolve_Attaches_Provenance_For_Play_Timeline()
    {
        var intent = MakeIntent();
        var evidence = MakeEvidence();
        var policies = new PolicySet
        {
            WorldId = "w1",
            Policies = new List<PolicyRule>
            {
                new() { Id = "play_timeline_or_render_4d", Rule = "attach_provenance", Condition = "play_timeline_or_render_4d" },
            }
        };
        var result = DecisionEngine.Resolve(intent, evidence, policies);
        Assert.True(result.AttachProvenance);
    }

    [Fact]
    public void Resolve_Modifies_Param_On_Timeline_Condition()
    {
        var intent = MakeIntent();
        intent.Params = new Dictionary<string, object> { { "speed", 1.0 } };
        var evidence = MakeEvidence();
        var policies = new PolicySet
        {
            WorldId = "w1",
            Policies = new List<PolicyRule>
            {
                new() { Id = "speed_throttle", Rule = "modify_param", Condition = "intent.timeline == 'intro'", Param = "speed", Modifier = "speed * 0.5" },
            }
        };
        var result = DecisionEngine.Resolve(intent, evidence, policies);
        Assert.True(result.Ok);
        Assert.NotNull(result.ParamAdjust);
        // DecisionEngine modifies param from intent.Params, which starts at 1.0
        Assert.Equal(0.5, result.ParamAdjust["speed"]);
    }

    [Fact]
    public void Resolve_Requires_Dual_Evidence_For_Ascension()
    {
        var intent = MakeIntent(type: "play_timeline");
        var evidence = new EvidenceBundle { Id = "ev-a", WorldId = "w1" };
        var policies = new PolicySet
        {
            WorldId = "w1",
            Policies = new List<PolicyRule>
            {
                new()
                {
                    Id = "ascension_dual_evidence",
                    Rule = "deny_if_false",
                    Condition = "intent.timeline == 'intro'",
                    Require = new List<string> { "ev-a", "ev-b" },
                },
            }
        };
        var result = DecisionEngine.Resolve(intent, evidence, policies);
        Assert.False(result.Ok);
        Assert.Contains("ascension_dual_evidence", result.Violations);
    }
}
