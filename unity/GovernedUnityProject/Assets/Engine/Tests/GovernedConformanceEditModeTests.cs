using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using SovereignX.CIEMS.Engine.Runtime;
using SovereignX.CIEMS.Engine.Governance;
using SovereignX.CIEMS.Engine.CSSV;
using SovereignX.CIEMS.Engine.Conformance;

/// <summary>
/// EditMode conformance tests - run without PlayMode (fast CI).
/// Mirrors browser conformance profile (17 checks).
/// </summary>
public class GovernedConformanceEditModeTests
{
    [Test]
    public void ProvenanceRecorder_Exists_And_Records_Frames()
    {
        ProvenanceRecorder.Clear();
        
        var frame = new FrameProvenance
        {
            IntentId = "test-intent",
            TimelineId = "test-timeline",
            WorldId = "test-world",
            TimeSeconds = 1.0,
            Parameters = new Dictionary<string, double> { { "speed", 2.0 } }
        };
        
        ProvenanceRecorder.Record(frame);
        
        var frames = ProvenanceRecorder.GetFrames();
        Assert.Greater(frames.Count, 0);
        
        var recorded = frames[0];
        Assert.AreEqual("test-intent", recorded.IntentId);
        Assert.AreEqual("test-timeline", recorded.TimelineId);
        Assert.AreEqual("test-world", recorded.WorldId);
        Assert.AreEqual(1.0, recorded.TimeSeconds);
        Assert.IsTrue(recorded.Parameters.ContainsKey("speed"));
        
        ProvenanceRecorder.Clear();
    }

    [Test]
    public void ReplayService_Replays_Deterministic_Params()
    {
        var frames = new List<FrameProvenance>
        {
            new FrameProvenance { Parameters = new Dictionary<string, double> { { "speed", 1.5 } } },
            new FrameProvenance { Parameters = new Dictionary<string, double> { { "speed", 2.5 } } }
        };
        
        var captured = new List<double>();
        var target = new ReplayCaptureTarget(v => captured.Add(v));
        
        ReplayService.Replay(frames, target);
        
        Assert.AreEqual(2, captured.Count);
        Assert.AreEqual(1.5, captured[0], 0.001);
        Assert.AreEqual(2.5, captured[1], 0.001);
    }

    [Test]
    public void BindingResolver_Resolves_Timeline_Tracks()
    {
        var go = new GameObject("binding-test");
        var resolver = go.AddComponent<BindingResolver>();
        
        var renderer = go.AddComponent<SovereignX.CIEMS.Engine.Rendering.FourDTesseractRenderer>();
        renderer.bindingName = "entity-renderer";
        renderer.speed = 0f;
        
        resolver.Rebuild();
        
        var resolved = resolver.Resolve<SovereignX.CIEMS.Engine.Rendering.FourDTesseractRenderer>("entity-renderer");
        Assert.NotNull(resolved);
        
        // Apply clip via resolver
        var timeline = MakeSampleTimeline();
        var clipTime = 1f;
        
        foreach (var track in timeline.tracks)
        {
            if (track.clips != null)
            {
                foreach (var clip in track.clips)
                {
                    float end = clip.startSec + clip.durationSec;
                    if (clipTime >= clip.startSec && clipTime <= end)
                    {
                        float p = clip.durationSec <= 0 ? 1f : (clipTime - clip.startSec) / clip.durationSec;
                        if (clip.payload != null && !string.IsNullOrEmpty(clip.payload.param))
                        {
                            float value = Mathf.Lerp(clip.payload.from, clip.payload.to, p);
                            var r = resolver.Resolve<SovereignX.CIEMS.Engine.Rendering.FourDTesseractRenderer>(track.binding);
                            if (r != null) r.Apply4DClip(clip.payload.param, value);
                        }
                    }
                }
            }
        }
        
        Assert.AreEqual(2f, renderer.speed, 0.01f);
        
        Object.DestroyImmediate(go);
    }

    [Test]
    public void CKL_Denies_PlayTimeline_Without_World()
    {
        var kernel = new GovernanceKernel(null);
        
        var intent = new IntentRecord
        {
            Id = "test-no-world",
            Type = "play_timeline",
            Kind = "play_timeline",
            Actor = "runtime.unity",
            World = null,
            Timeline = "test-timeline"
        };
        
        var evidence = new EvidenceBundle
        {
            Id = "ev-test",
            Kind = "test",
            Timestamp = System.DateTime.UtcNow.ToString("o"),
            WorldId = "test-world",
            TimelineId = "test-timeline"
        };
        
        var decision = kernel.EvaluateIntent(intent, evidence);
        
        Assert.IsFalse(decision.Ok);
        Assert.IsTrue(decision.Violations.Contains("policy-play-timeline-requires-world"));
    }

    [Test]
    public void CKL_Allows_PlayTimeline_With_World()
    {
        var kernel = new GovernanceKernel(null);
        
        var intent = new IntentRecord
        {
            Id = "test-with-world",
            Type = "play_timeline",
            Kind = "play_timeline",
            Actor = "runtime.unreal",
            World = "world-mythar-plains",
            Timeline = "opening_4d_reveal"
        };
        
        var evidence = new EvidenceBundle
        {
            Id = "ev-test",
            Kind = "test",
            Timestamp = System.DateTime.UtcNow.ToString("o"),
            WorldId = "world-mythar-plains",
            TimelineId = "opening_4d_reveal"
        };
        
        var decision = kernel.EvaluateIntent(intent, evidence);
        
        Assert.IsTrue(decision.Ok);
        Assert.AreEqual("allow", decision.Verdict);
        Assert.IsTrue(decision.AttachProvenance);
    }

    [Test]
    public void CSSV_Registry_Records_Artifacts_Transitions_Frames()
    {
        var registry = CssvRegistry.EnsureInstance(new UnityCssvHost());
        
        var artifact = new CssvArtifactRecord
        {
            Id = "test-artifact",
            ArtifactType = "test",
            Payload = new Dictionary<string, object> { { "key", "value" } }
        };
        registry.RegisterArtifact(artifact);
        
        var intent = new IntentRecord { Id = "test-intent", World = "test-world" };
        var evidence = new EvidenceBundle { Id = "ev-test", WorldId = "test-world" };
        var decision = new Decision { Ok = true, Verdict = "allow", DecisionId = "dec-test" };
        
        var transition = new CssvTransitionRecord
        {
            Id = "test-transition",
            FromStateId = "state-0000",
            ToStateId = "state-0001",
            Intent = intent,
            Authority = "runtime.unity",
            Evidence = evidence,
            Decision = decision,
            TimeSeconds = UnityEngine.Time.time
        };
        registry.RegisterTransition(transition);
        
        var frame = new FrameProvenance
        {
            IntentId = "test-intent",
            TimelineId = "test-timeline",
            WorldId = "test-world",
            TimeSeconds = 1.0,
            Parameters = new Dictionary<string, double> { { "speed", 1.0 } }
        };
        registry.RegisterFrame(frame);
        
        var snapshot = registry.ExportSnapshot();
        Assert.NotNull(snapshot);
        Assert.IsTrue(snapshot.ContainsKey("artifacts"));
        Assert.IsTrue(snapshot.ContainsKey("transitions"));
        Assert.IsTrue(snapshot.ContainsKey("frames"));
    }

    [Test]
    public void CKL_Policy_Load_Has_Minimum_Policies()
    {
        var kernel = new GovernanceKernel(null);
        var set = kernel.GetCKL().GetPoliciesForWorld("test-world");
        
        // Base policies + Amendment VII (3) + Amendment VIII (9) = at least 12
        Assert.GreaterOrEqual(set.Policies.Count, 12);
    }

    [Test]
    public void CSR_Decision_Attaches_Provenance()
    {
        var kernel = new GovernanceKernel(null);
        
        var intent = new IntentRecord
        {
            Id = "csr-test",
            Type = "play_timeline",
            Kind = "play_timeline",
            Actor = "runtime.unreal",
            World = "world-test",
            Timeline = "test-timeline"
        };
        
        var evidence = new EvidenceBundle
        {
            Id = "ev-test",
            Kind = "test",
            Timestamp = System.DateTime.UtcNow.ToString("o"),
            WorldId = "world-test",
            TimelineId = "test-timeline"
        };
        
        var decision = kernel.EvaluateIntent(intent, evidence);
        
        Assert.IsTrue(decision.Ok);
        Assert.IsTrue(decision.AttachProvenance);
    }

    private TimelineDto MakeSampleTimeline()
    {
        return new TimelineDto
        {
            id = "test-timeline",
            name = "Test Timeline",
            durationSec = 2f,
            tracks = new List<TimelineTrackDto>
            {
                new TimelineTrackDto
                {
                    id = "track-1",
                    binding = "entity-renderer",
                    clips = new List<TimelineClipDto>
                    {
                        new TimelineClipDto
                        {
                            id = "clip-1",
                            action = "set_param",
                            startSec = 0f,
                            durationSec = 2f,
                            payload = new TimelinePayloadDto { param = "speed", from = 1f, to = 3f }
                        }
                    }
                }
            }
        };
    }

    private class ReplayCaptureTarget : IReplayTarget
    {
        public System.Action<double> OnSpeed { get; set; }
        public void ApplyFrame(FrameProvenance frame)
        {
            if (frame.Parameters != null && frame.Parameters.TryGetValue("speed", out var s))
                OnSpeed?.Invoke(s);
        }
    }
}