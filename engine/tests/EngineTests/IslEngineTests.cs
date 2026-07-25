using SovereignX.CIEMS.Engine.Runtime;

namespace SovereignX.CIEMS.Engine.Scripting;

public class IslEngineTests
{
    [Fact]
    public void CompileAndEvaluate_PlayTimeline_Produces_Intent()
    {
        var engine = new IslEngine();
        var source = "intent play_timeline(\"intro\") in world(\"mythar-plains\") at \"now\" with evidence(\"ev-001\");";
        var result = engine.CompileAndEvaluate(source);
        Assert.NotNull(result);
        Assert.Equal("play_timeline", result.Type);
        Assert.Equal("mythar-plains", result.World);
        Assert.Equal("intro", result.Timeline);
        Assert.Equal("ev-001", result.EvidenceId);
        Assert.Equal("now", result.At);
    }

    [Fact]
    public void CompileAndEvaluate_PlayTimeline_With_Context()
    {
        var engine = new IslEngine();
        var source = "intent play_timeline(\"chapter2\") in world(\"w2\") with evidence(\"ev-002\");";
        var context = "{\"actor\":\"4dce.timeline\",\"worldId\":\"w2\"}";
        var result = engine.CompileAndEvaluate(source, context);
        Assert.Equal("4dce.timeline", result.Actor);
        Assert.Equal("w2", result.World);
        Assert.Equal("chapter2", result.Timeline);
    }

    [Fact]
    public void CompileAndEvaluate_RenderScene()
    {
        var engine = new IslEngine();
        var source = "intent render_scene(\"scene-config-4d\") in world(\"w1\") at \"2026-01-01T00:00:00Z\";";
        var result = engine.CompileAndEvaluate(source);
        Assert.Equal("render_scene", result.Type);
        // render_scene stores first arg in Payload["arg0"] (not Entity)
        Assert.Equal("scene-config-4d", result.Payload["arg0"]);
        Assert.Equal("w1", result.World);
    }

    [Fact]
    public void CompileAndEvaluate_UpdateWorld()
    {
        var engine = new IslEngine();
        // The current ISL regex expects unquoted keys in params
        var source = "intent update_world(\"entity-xyz\") in world(\"w1\") at \"now\" with params {gravity: 9.81};";
        var result = engine.CompileAndEvaluate(source);
        Assert.Equal("update_world", result.Type);
        Assert.NotNull(result.Params);
        Assert.True(result.Params.ContainsKey("gravity"));
        Assert.Equal(9.81, result.Params["gravity"]);
    }

    [Fact]
    public void CompileAndEvaluate_Multiple_Statements_Uses_Last()
    {
        var engine = new IslEngine();
        var source = """
            intent play_timeline("intro") in world("w1") at "now";
            intent render_scene("scene-final") in world("w2") at "later";
            """;
        var result = engine.CompileAndEvaluate(source);
        Assert.Equal("render_scene", result.Type);
        Assert.Equal("w2", result.World);
    }

    [Fact]
    public void CompileAndEvaluate_With_Comments()
    {
        var engine = new IslEngine();
        var source = """
            // This is a comment
            intent play_timeline("demo") // inline comment
            in world("w3") at "now";
            """;
        var result = engine.CompileAndEvaluate(source);
        Assert.Equal("play_timeline", result.Type);
        Assert.Equal("w3", result.World);
    }
}
