using SovereignX.CIEMS.Engine.Runtime;

namespace SovereignX.CIEMS.Engine.Governance;

public class CKLEvaluatorTests
{
    private static IntentRecord MakeIntent(string type = "play_timeline", string world = "w1")
    {
        return new IntentRecord { Id = "i1", Actor = "test", Type = type, World = world, Timeline = "intro" };
    }

    private static EvidenceBundle MakeEvidence(string id = "ev-001")
    {
        return new EvidenceBundle { Id = id };
    }

    [Fact]
    public void Ctor_Accepts_Empty_Policies()
    {
        var eval = new CKLEvaluator(Array.Empty<CKLPolicy>(), new SimpleExpressionEngine());
        Assert.NotNull(eval);
    }

    [Fact]
    public void Evaluate_Allows_With_No_Policies()
    {
        var eval = new CKLEvaluator(Array.Empty<CKLPolicy>(), new SimpleExpressionEngine());
        var result = eval.Evaluate(MakeIntent(), MakeEvidence(), new RuntimeContext());
        Assert.True(result.Ok);
    }

    [Fact]
    public void Evaluate_Denies_On_Null_Intent()
    {
        var policies = new[] { new CKLPolicy { Id = "p1", Rule = "deny_if_false", Condition = "intent != null" } };
        var eval = new CKLEvaluator(policies, new SimpleExpressionEngine());
        var result = eval.Evaluate(null!, MakeEvidence(), new RuntimeContext());
        Assert.False(result.Ok);
    }

    [Fact]
    public void Evaluate_Denies_When_Evidence_Missing_For_Require()
    {
        var policies = new[]
        {
            new CKLPolicy
            {
                Id = "ascension_dual_evidence",
                Rule = "deny_if_false",
                Condition = "intent.timeline == 'intro'",
                Require = new List<string> { "ev-a", "ev-b" },
            },
        };
        var eval = new CKLEvaluator(policies, new SimpleExpressionEngine());
        var result = eval.Evaluate(MakeIntent(), MakeEvidence("ev-a"), new RuntimeContext());
        Assert.False(result.Ok);
        Assert.Contains("ascension_dual_evidence", result.Violations);
    }

    [Fact]
    public void Evaluate_Modifies_Param_On_Drift_Match()
    {
        var policies = new[]
        {
            new CKLPolicy
            {
                Id = "speed_throttle",
                Rule = "modify_param",
                Condition = "drift_score > 0.7",
                Param = "speed",
                Modifier = "speed * 0.5",
            },
        };
        var eval = new CKLEvaluator(policies, new SimpleExpressionEngine());
        var ctx = new RuntimeContext { DriftScore = 0.9 };
        ctx.SetParam("speed", 1.0);
        // Drift > 0.7 with DriftScore=0.9 → condition matches → param halved
        var result = eval.Evaluate(MakeIntent(), new EvidenceBundle { Id = "ev" }, ctx);
        Assert.True(result.Ok);
        Assert.NotNull(result.ParamAdjust);
        Assert.True(result.ParamAdjust.ContainsKey("speed"));
    }

    [Fact]
    public void Evaluate_Attaches_Provenance()
    {
        var policies = new[]
        {
            new CKLPolicy
            {
                Id = "provenance_attach",
                Rule = "attach_provenance",
                Condition = "intent.timeline == 'intro'",
            },
        };
        var eval = new CKLEvaluator(policies, new SimpleExpressionEngine());
        var result = eval.Evaluate(MakeIntent(), MakeEvidence(), new RuntimeContext());
        Assert.True(result.AttachProvenance);
    }

    [Fact]
    public void SimpleExpressionEngine_Evaluates_Conjunction()
    {
        var engine = new SimpleExpressionEngine();
        var env = new Dictionary<string, object>
        {
            { "intent.timeline", "intro" },
            { "drift_score", 0.8 },
        };
        Assert.True(engine.EvaluateBool("intent.timeline == 'intro' && drift_score > 0.7", env));
        Assert.False(engine.EvaluateBool("intent.timeline == 'other' && drift_score > 0.7", env));
    }
}
