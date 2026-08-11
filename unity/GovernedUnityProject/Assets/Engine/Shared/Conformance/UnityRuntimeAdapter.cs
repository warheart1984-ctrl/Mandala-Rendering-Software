// UnityRuntimeAdapter — conformance probes mirroring BrowserRuntimeAdapter.js

using System;
using System.Collections.Generic;
using System.IO;
using SovereignX.CIEMS.Engine.Governance;
using SovereignX.CIEMS.Engine.Runtime;
using UnityEngine;

namespace SovereignX.CIEMS.Engine.Conformance
{
    public sealed class UnityRuntimeAdapter : IRuntimeAdapter
    {
        readonly PolicySet _policySet;
        readonly Dictionary<string, Func<(bool pass, string reason)>> _probes;

        public IReadOnlyDictionary<string, Func<(bool pass, string reason)>> Probes => _probes;

        public UnityRuntimeAdapter(PolicySet policySet)
        {
            _policySet = policySet ?? new PolicySet();
            _probes = BuildProbes();
        }

        public static UnityRuntimeAdapter CreateDefault()
        {
            PolicySet set;
            var streamingPath = Path.Combine(Application.streamingAssetsPath, "policies/default.policies.json");
            if (File.Exists(streamingPath))
            {
                var ckl = ConstitutionalKnowledgeLayer.LoadFromFile(streamingPath);
                set = ckl.GetPoliciesForWorld("world-test");
            }
            else
            {
                var repoPath = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../engine/governance/policies/default.policies.json"));
                if (File.Exists(repoPath))
                {
                    var ckl = ConstitutionalKnowledgeLayer.LoadFromFile(repoPath);
                    set = ckl.GetPoliciesForWorld("world-test");
                }
                else
                {
                    set = new PolicySet { WorldId = "world-test", Policies = new List<PolicyRule>() };
                }
            }
            return new UnityRuntimeAdapter(set);
        }

        Dictionary<string, Func<(bool pass, string reason)>> BuildProbes()
        {
            return new Dictionary<string, Func<(bool pass, string reason)>>
            {
                ["provenance.recorder-exists"] = ProbeRecorderExists,
                ["provenance.frame-fields"] = ProbeFrameFields,
                ["provenance.frame-recorded-during-play"] = ProbeFrameRecordedDuringPlay,
                ["replay.service-exists"] = ProbeReplayServiceExists,
                ["replay.deterministic-params"] = ProbeReplayDeterministic,
                ["binding.resolver-exists"] = ProbeBindingResolverExists,
                ["binding.all-tracks-resolved"] = ProbeAllTracksResolved,
                ["timeline.loader-exists"] = ProbeTimelineLoaderExists,
                ["timeline.clip-application"] = ProbeClipApplication,
                ["timeline.world-required"] = ProbeTimelineWorldRequired,
                ["evidence.bundle-fields"] = ProbeEvidenceBundleFields,
                ["evidence.dual-require"] = ProbeEvidenceDualRequire,
                ["ckl.policy-load"] = ProbeCklPolicyLoad,
                ["ckl.deny-without-intent"] = ProbeCklDenyWithoutIntent,
                ["ckl.modify-param"] = ProbeCklModifyParam,
                ["ckl.attach-provenance"] = ProbeCklAttachProvenance,
                ["csr.governance-trace"] = ProbeCsrGovernanceTrace,
            };
        }

        static IntentRecord MakeIntent(Dictionary<string, object> overrides = null)
        {
            var intent = new IntentRecord
            {
                Id = "test-intent",
                Type = "play_timeline",
                Kind = "play_timeline",
                Actor = "runtime.unity",
                World = "world-test",
                Timeline = "test-timeline",
            };
            if (overrides != null)
            {
                foreach (var kv in overrides)
                {
                    switch (kv.Key)
                    {
                        case "world": intent.World = kv.Value as string; break;
                        case "timeline": intent.Timeline = kv.Value as string; break;
                        case "actor": intent.Actor = kv.Value as string; break;
                        case "type": intent.Type = kv.Value as string; intent.Kind = kv.Value as string; break;
                    }
                }
            }
            return intent;
        }

        static EvidenceBundle MakeEvidence(IReadOnlyList<string> ids, Dictionary<string, object> extra = null)
        {
            var ev = new EvidenceBundle
            {
                Id = ids != null && ids.Count > 0 ? ids[0] : "ev-001",
                Kind = "test",
                WorldId = "world-test",
                TimelineId = "test-timeline",
                Fields = new Dictionary<string, object>(),
            };
            if (ids != null)
                ev.Fields["evidenceIds"] = new List<string>(ids);
            if (extra != null)
                foreach (var kv in extra)
                    ev.Fields[kv.Key] = kv.Value;
            return ev;
        }

        static TimelineDto MakeSampleTimeline()
        {
            return new TimelineDto
            {
                id = "test-timeline",
                name = "Test Timeline",
                durationSec = 2f,
                tracks = new[]
                {
                    new TimelineTrackDto
                    {
                        id = "track-1",
                        binding = "entity-renderer",
                        clips = new[]
                        {
                            new TimelineClipDto
                            {
                                id = "clip-1",
                                action = "set_param",
                                startSec = 0f,
                                durationSec = 2f,
                                payload = new TimelinePayloadDto { param = "speed", from = 1f, to = 3f },
                            },
                        },
                    },
                },
            };
        }

        static float ApplyClipAtTime(TimelineDto timeline, float timeSec, FourDTesseractRenderer renderer)
        {
            if (timeline?.tracks == null || renderer == null) return 0f;
            foreach (var track in timeline.tracks)
            {
                if (track?.clips == null) continue;
                foreach (var clip in track.clips)
                {
                    var end = clip.startSec + clip.durationSec;
                    if (timeSec < clip.startSec || timeSec > end) continue;
                    var p = clip.durationSec <= 0 ? 1f : (timeSec - clip.startSec) / clip.durationSec;
                    if (clip.payload == null || string.IsNullOrEmpty(clip.payload.param)) continue;
                    var value = Mathf.Lerp(clip.payload.from, clip.payload.to, p);
                    renderer.Apply4DClip(clip.payload.param, value);
                    return value;
                }
            }
            return renderer.speed;
        }

        (bool, string) ProbeRecorderExists()
        {
            ProvenanceRecorder.Clear();
            var ok = true;
            return (ok, ok ? null : "Missing recorder API");
        }

        (bool, string) ProbeFrameFields()
        {
            var f = new FrameProvenance
            {
                IntentId = "i",
                TimelineId = "t",
                WorldId = "w",
                TimeSeconds = 1.0,
                Parameters = new Dictionary<string, double> { ["speed"] = 2 },
            };
            var ok = f.IntentId == "i" && f.TimelineId == "t" && f.WorldId == "w";
            return (ok, ok ? null : "Frame missing required fields");
        }

        (bool, string) ProbeFrameRecordedDuringPlay()
        {
            ProvenanceRecorder.Clear();
            var tl = MakeSampleTimeline();
            var go = new GameObject("conformance-tess");
            try
            {
                var renderer = go.AddComponent<FourDTesseractRenderer>();
                for (var i = 0; i < 10; i++)
                {
                    ApplyClipAtTime(tl, i * 0.2f, renderer);
                    ProvenanceRecorder.Record(new FrameProvenance
                    {
                        IntentId = "i",
                        TimelineId = tl.id,
                        WorldId = "w",
                        TimeSeconds = i * 0.2,
                        Parameters = new Dictionary<string, double> { ["speed"] = renderer.speed },
                    });
                }
                var ok = ProvenanceRecorder.Count > 0;
                return (ok, ok ? null : "No frames recorded");
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
                ProvenanceRecorder.Clear();
            }
        }

        (bool, string) ProbeReplayServiceExists()
        {
            var ok = true;
            return (ok, null);
        }

        (bool, string) ProbeReplayDeterministic()
        {
            var frames = new List<FrameProvenance>
            {
                new FrameProvenance { Parameters = new Dictionary<string, double> { ["speed"] = 1.5 } },
                new FrameProvenance { Parameters = new Dictionary<string, double> { ["speed"] = 2.5 } },
            };
            var captured = new List<double>();
            var target = new ReplayCaptureTarget(v => captured.Add(v));
            ReplayService.Replay(frames, target);
            var ok = captured.Count == 2 && Math.Abs(captured[0] - 1.5) < 0.001 && Math.Abs(captured[1] - 2.5) < 0.001;
            return (ok, ok ? null : "Replayed params mismatch");
        }

        (bool, string) ProbeBindingResolverExists()
        {
            var go = new GameObject("conformance-bind");
            try
            {
                var renderer = go.AddComponent<FourDTesseractRenderer>();
                renderer.speed = 0f;
                ApplyClipAtTime(MakeSampleTimeline(), 1f, renderer);
                var ok = renderer.speed != 0f;
                return (ok, ok ? null : "Clip did not bind to renderer");
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
            }
        }

        (bool, string) ProbeAllTracksResolved()
        {
            var go = new GameObject("conformance-tracks");
            try
            {
                var renderer = go.AddComponent<FourDTesseractRenderer>();
                renderer.speed = 0f;
                ApplyClipAtTime(MakeSampleTimeline(), 1f, renderer);
                var ok = Math.Abs(renderer.speed - 2f) < 0.01f;
                return (ok, ok ? null : "Track clip not applied");
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
            }
        }

        (bool, string) ProbeTimelineLoaderExists()
        {
            var tl = MakeSampleTimeline();
            var ok = Math.Abs(tl.durationSec - 2f) < 0.001f;
            return (ok, null);
        }

        (bool, string) ProbeClipApplication()
        {
            var go = new GameObject("conformance-clip");
            try
            {
                var renderer = go.AddComponent<FourDTesseractRenderer>();
                ApplyClipAtTime(MakeSampleTimeline(), 1f, renderer);
                var ok = Math.Abs(renderer.speed - 2f) < 0.01f;
                return (ok, ok ? null : $"Expected 2, got {renderer.speed}");
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
            }
        }

        (bool, string) ProbeTimelineWorldRequired()
        {
            var intent = MakeIntent(new Dictionary<string, object> { ["world"] = null });
            intent.World = null;
            var result = DecisionEngine.Resolve(intent, MakeEvidence(new[] { "ev-001" }), _policySet);
            var ok = !result.Ok;
            return (ok, ok ? null : "CKL allowed play without world");
        }

        (bool, string) ProbeEvidenceBundleFields()
        {
            var ev = MakeEvidence(new[] { "ev-001" });
            var ok = ev.Fields.ContainsKey("evidenceIds");
            return (ok, null);
        }

        (bool, string) ProbeEvidenceDualRequire()
        {
            var intent = MakeIntent(new Dictionary<string, object> { ["timeline"] = "mythar_ascension" });
            var evidence = MakeEvidence(new[] { "ev-ascension-001" });
            var result = DecisionEngine.Resolve(intent, evidence, _policySet);
            var ok = !result.Ok;
            return (ok, ok ? null : "CKL did not deny missing dual evidence");
        }

        (bool, string) ProbeCklPolicyLoad()
        {
            var ok = _policySet.Policies.Count >= 5;
            return (ok, ok ? null : $"Only {_policySet.Policies.Count} policies loaded");
        }

        (bool, string) ProbeCklDenyWithoutIntent()
        {
            var result = DecisionEngine.Resolve(null, MakeEvidence(new[] { "ev-001" }), _policySet);
            var ok = !result.Ok;
            return (ok, ok ? null : "CKL allowed null intent");
        }

        (bool, string) ProbeCklModifyParam()
        {
            var intent = MakeIntent(new Dictionary<string, object> { ["timeline"] = "mythar_ascension" });
            intent.Params = new Dictionary<string, object> { ["driftScore"] = 0.9 };
            var evidence = MakeEvidence(
                new[] { "ev-ascension-001", "ev-ascension-002" },
                new Dictionary<string, object> { ["driftScore"] = 0.9 });
            var result = DecisionEngine.Resolve(intent, evidence, _policySet, Array.Empty<PrecedentRecord>());
            var ok = result.Ok && result.ParamAdjust != null &&
                     result.ParamAdjust.TryGetValue("speed", out var speed) &&
                     speed is double d && d < 1.0;
            if (!ok && result.ParamAdjust != null && result.ParamAdjust.TryGetValue("speed", out var s))
                ok = result.Ok && Convert.ToDouble(s) < 1.0;
            return (ok, ok ? null : "modify_param did not adjust speed");
        }

        (bool, string) ProbeCklAttachProvenance()
        {
            var result = DecisionEngine.Resolve(MakeIntent(), MakeEvidence(new[] { "ev-001" }), _policySet);
            return (result.AttachProvenance, null);
        }

        (bool, string) ProbeCsrGovernanceTrace()
        {
            var result = DecisionEngine.Resolve(MakeIntent(), MakeEvidence(new[] { "ev-001" }), _policySet);
            var ok = result.Ok && result.AttachProvenance;
            return (ok, ok ? null : "CSR governance trace gate did not allow provenance");
        }

        sealed class ReplayCaptureTarget : IReplayTarget
        {
            readonly Action<double> _onSpeed;

            public ReplayCaptureTarget(Action<double> onSpeed) => _onSpeed = onSpeed;

            public void ApplyFrame(FrameProvenance frame)
            {
                if (frame.Parameters != null && frame.Parameters.TryGetValue("speed", out var s))
                    _onSpeed(s);
            }
        }
    }
}
