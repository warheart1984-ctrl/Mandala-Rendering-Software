// CSSV registry — Unity host mirror of engine/cssv/CssvRegistry.js

using System;
using System.Collections.Generic;
using System.Text;
using SovereignX.CIEMS.Engine.Runtime;
using UnityEngine;
using UnityEngine.Networking;

namespace SovereignX.CIEMS.Engine.CSSV
{
    public sealed class UnityCssvHost
    {
        public string HostId { get; set; } = "unity";
        public string HostVersion { get; set; } = "1.0";
    }

    public sealed class CssvArtifactRecord
    {
        public string Id;
        public string ArtifactType;
        public object Payload;
    }

    public sealed class CssvTransitionRecord
    {
        public string Id;
        public string FromStateId;
        public string ToStateId;
        public IntentRecord Intent;
        public string Authority;
        public EvidenceBundle Evidence;
        public Decision Decision;
        public double TimeSeconds;
    }

    /// <summary>In-memory constitutional ledger; optional sync to CSSV server via UnityWebRequest.</summary>
    public sealed class CssvRegistry
    {
        public static CssvRegistry Instance { get; private set; }

        public static CssvRegistry EnsureInstance(UnityCssvHost host = null)
        {
            if (Instance == null)
                Instance = new CssvRegistry(host ?? new UnityCssvHost());
            return Instance;
        }

        readonly UnityCssvHost _host;
        string _stateId = "state-0000";
        int _frameIndex;

        public List<object> Artifacts { get; } = new List<object>();
        public List<object> Transitions { get; } = new List<object>();
        public List<object> Frames { get; } = new List<object>();

        public CssvRegistry(UnityCssvHost host)
        {
            _host = host ?? new UnityCssvHost();
            Instance = this;
        }

        public void RegisterArtifact(CssvArtifactRecord artifact)
        {
            if (artifact == null || string.IsNullOrEmpty(artifact.Id)) return;
            var record = new Dictionary<string, object>
            {
                ["type"] = "artifact",
                ["id"] = artifact.Id,
                ["artifactType"] = artifact.ArtifactType ?? "unknown",
                ["host"] = _host.HostId,
                ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                ["payload"] = artifact.Payload ?? new Dictionary<string, object>(),
            };
            Artifacts.Add(record);
        }

        public void RegisterTransition(CssvTransitionRecord transition)
        {
            if (transition == null) return;
            var toState = transition.ToStateId ?? $"state-{Transitions.Count + 1}";
            var record = new Dictionary<string, object>
            {
                ["type"] = "transition",
                ["id"] = transition.Id ?? $"tx-{Transitions.Count + 1}",
                ["from"] = transition.FromStateId ?? _stateId,
                ["to"] = toState,
                ["intent"] = SerializeIntent(transition.Intent),
                ["authority"] = transition.Authority ?? _host.HostId,
                ["evidence"] = NormalizeEvidence(transition.Evidence),
                ["decision"] = SerializeDecision(transition.Decision),
                ["host"] = _host.HostId,
                ["timestamp"] = transition.TimeSeconds > 0
                    ? transition.TimeSeconds
                    : DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            };
            _stateId = toState;
            Transitions.Add(record);
        }

        public void RegisterFrame(FrameProvenance frame)
        {
            var record = new Dictionary<string, object>
            {
                ["type"] = "frame",
                ["intent"] = frame.IntentId,
                ["timeline"] = frame.TimelineId,
                ["world"] = frame.WorldId,
                ["host"] = _host.HostId,
                ["timestamp"] = frame.TimeSeconds,
                ["params"] = frame.Parameters ?? new Dictionary<string, double>(),
                ["frameIndex"] = _frameIndex++,
            };
            Frames.Add(record);
        }

        public Dictionary<string, object> ExportSnapshot()
        {
            return new Dictionary<string, object>
            {
                ["artifacts"] = new List<object>(Artifacts),
                ["transitions"] = new List<object>(Transitions),
                ["frames"] = new List<object>(Frames),
            };
        }

        public string ExportJson()
        {
            var snap = ExportSnapshot();
            return MiniJson.Serialize(snap);
        }

        public void SyncToServer(MonoBehaviour runner, string ingestUrl, Action<bool, string> onComplete = null)
        {
            if (runner == null || string.IsNullOrEmpty(ingestUrl))
            {
                onComplete?.Invoke(false, "No runner or ingest URL");
                return;
            }
            runner.StartCoroutine(PostIngest(ingestUrl, onComplete));
        }

        System.Collections.IEnumerator PostIngest(string ingestUrl, Action<bool, string> onComplete)
        {
            var body = ExportJson();
            using var req = new UnityWebRequest(ingestUrl, "POST");
            var bytes = Encoding.UTF8.GetBytes(body);
            req.uploadHandler = new UploadHandlerRaw(bytes);
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            yield return req.SendWebRequest();

#if UNITY_2020_2_OR_NEWER
            var ok = req.result == UnityWebRequest.Result.Success;
#else
            var ok = !req.isNetworkError && !req.isHttpError;
#endif
            onComplete?.Invoke(ok, ok ? req.downloadHandler.text : req.error);
        }

        static Dictionary<string, object> SerializeIntent(IntentRecord intent)
        {
            if (intent == null) return new Dictionary<string, object>();
            return new Dictionary<string, object>
            {
                ["id"] = intent.Id,
                ["type"] = intent.Type ?? intent.Kind,
                ["actor"] = intent.Actor,
                ["world"] = intent.World,
                ["timeline"] = intent.Timeline,
            };
        }

        static Dictionary<string, object> SerializeDecision(Decision decision)
        {
            if (decision == null) return new Dictionary<string, object> { ["allowed"] = false };
            return new Dictionary<string, object>
            {
                ["allowed"] = decision.Ok,
                ["verdict"] = decision.Verdict,
                ["reason"] = decision.Reason,
                ["violations"] = decision.Violations ?? new List<string>(),
            };
        }

        static List<string> NormalizeEvidence(EvidenceBundle evidence)
        {
            var ids = new List<string>();
            if (evidence == null) return ids;
            if (!string.IsNullOrEmpty(evidence.Id)) ids.Add(evidence.Id);
            if (evidence.Fields != null &&
                evidence.Fields.TryGetValue("evidenceIds", out var list) &&
                list is IEnumerable<string> enumerable)
            {
                foreach (var id in enumerable)
                    if (!string.IsNullOrEmpty(id)) ids.Add(id);
            }
            return ids;
        }
    }

    /// <summary>Minimal JSON writer for CSSV snapshots (no external deps).</summary>
    static class MiniJson
    {
        public static string Serialize(object value) => SerializeValue(value);

        static string SerializeValue(object value)
        {
            if (value == null) return "null";
            if (value is string s) return "\"" + Escape(s) + "\"";
            if (value is bool b) return b ? "true" : "false";
            if (value is int or long or float or double)
                return Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture);
            if (value is IDictionary<string, object> dict)
            {
                var parts = new List<string>();
                foreach (var kv in dict)
                    parts.Add("\"" + Escape(kv.Key) + "\":" + SerializeValue(kv.Value));
                return "{" + string.Join(",", parts) + "}";
            }
            if (value is IDictionary<string, double> dblDict)
            {
                var parts = new List<string>();
                foreach (var kv in dblDict)
                    parts.Add("\"" + Escape(kv.Key) + "\":" + SerializeValue(kv.Value));
                return "{" + string.Join(",", parts) + "}";
            }
            if (value is IEnumerable<object> list)
            {
                var parts = new List<string>();
                foreach (var item in list)
                    parts.Add(SerializeValue(item));
                return "[" + string.Join(",", parts) + "]";
            }
            if (value is IEnumerable<string> strList)
            {
                var parts = new List<string>();
                foreach (var item in strList)
                    parts.Add(SerializeValue(item));
                return "[" + string.Join(",", parts) + "]";
            }
            if (value is System.Collections.IEnumerable enumerable && value is not string)
            {
                var parts = new List<string>();
                foreach (var item in enumerable)
                    parts.Add(SerializeValue(item));
                return "[" + string.Join(",", parts) + "]";
            }
            return "\"" + Escape(value.ToString()) + "\"";
        }

        static string Escape(string s) =>
            (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n");
    }
}
