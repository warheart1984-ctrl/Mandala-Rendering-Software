using SovereignX.CIEMS.Engine.Runtime;

namespace SovereignX.CIEMS.Engine.Governance;

public class ConstitutionalKnowledgeLayerTests
{
    [Fact]
    public void Ctor_Accepts_Empty_Policies()
    {
        var ckl = new ConstitutionalKnowledgeLayer(Array.Empty<PolicyRule>());
        Assert.NotNull(ckl);
    }

    [Fact]
    public void GetPoliciesForWorld_Returns_Loaded_Policies()
    {
        var rules = new List<PolicyRule>
        {
            new() { Id = "p1", Rule = "deny_if_false", Condition = "intent != null" },
        };
        var ckl = new ConstitutionalKnowledgeLayer(rules);
        var ps = ckl.GetPoliciesForWorld("w1");
        Assert.Single(ps.Policies);
        Assert.Equal("p1", ps.Policies[0].Id);
        Assert.Equal("w1", ps.WorldId);
    }

    [Fact]
    public void LoadFromJsonArray_Parses_Minimal_Json()
    {
        var json = "[{\"id\":\"test-policy\",\"scope\":\"runtime\",\"rule\":\"deny_if_false\",\"condition\":\"intent != null\"}]";
        var ckl = ConstitutionalKnowledgeLayer.LoadFromJsonArray(json);
        Assert.NotNull(ckl);
        var ps = ckl.GetPoliciesForWorld("w");
        Assert.Single(ps.Policies);
        Assert.Equal("test-policy", ps.Policies[0].Id);
    }

    [Fact]
    public void LoadFromJsonArray_Parses_Known_String_Fields()
    {
        // Current Field() regex only extracts string fields: id, scope, condition, rule, severity, message.
        // Array fields (require) and other fields (param, modifier) are not parsed.
        var json = "[{\"id\":\"p1\",\"rule\":\"deny_if_false\",\"condition\":\"ok\",\"require\":[\"ev-a\",\"ev-b\"],\"param\":\"speed\",\"modifier\":\"speed*0.5\"}]";
        var ckl = ConstitutionalKnowledgeLayer.LoadFromJsonArray(json);
        var ps = ckl.GetPoliciesForWorld("w");
        Assert.Equal("p1", ps.Policies[0].Id);
        Assert.Equal("deny_if_false", ps.Policies[0].Rule);
        // require/param/modifier are not extracted by the current string-only parser
        Assert.Equal(0, ps.Policies[0].Require.Count);
        Assert.Null(ps.Policies[0].Param);
        Assert.Null(ps.Policies[0].Modifier);
    }

    [Fact]
    public void GetPrecedents_Returns_Empty_Initially()
    {
        var ckl = new ConstitutionalKnowledgeLayer(Array.Empty<PolicyRule>());
        var intent = new IntentRecord { Id = "i1", Type = "play_timeline" };
        var prece = ckl.GetPrecedents(intent);
        Assert.Empty(prece);
    }

    [Fact]
    public void RecordPrecedent_Stores_And_Retrieves()
    {
        var ckl = new ConstitutionalKnowledgeLayer(Array.Empty<PolicyRule>());
        var intent = new IntentRecord { Id = "i1", Type = "play_timeline", World = "w1" };
        var decision = new Decision { Ok = false, Verdict = "deny" };
        var rec = ckl.RecordPrecedent(intent, decision, 0.5f);
        Assert.NotNull(rec);
        Assert.Equal("play_timeline", rec.IntentType);
        Assert.Equal("w1", rec.WorldId);
        Assert.Equal(0.5f, rec.DriftScore);
        // Now retrieve
        var prece = ckl.GetPrecedents(intent);
        Assert.Single(prece);
    }

    [Fact]
    public void LoadFromJsonArray_With_Known_Fields()
    {
        // The current regex parser only extracts id, scope, condition, rule, severity, message.
        var json = "[{\"id\":\"drift-policy\",\"scope\":\"render\",\"rule\":\"modify_param\",\"condition\":\"drift_score > 0.7\",\"severity\":\"info\",\"message\":\"throttle applied\"}]";
        var ckl = ConstitutionalKnowledgeLayer.LoadFromJsonArray(json);
        var ps = ckl.GetPoliciesForWorld("w");
        Assert.Equal("drift-policy", ps.Policies[0].Id);
        Assert.Equal("render", ps.Policies[0].Scope);
        Assert.Equal("modify_param", ps.Policies[0].Rule);
        Assert.Equal("drift_score > 0.7", ps.Policies[0].Condition);
        Assert.Equal("info", ps.Policies[0].Severity);
        Assert.Equal("throttle applied", ps.Policies[0].Message);
    }
}
