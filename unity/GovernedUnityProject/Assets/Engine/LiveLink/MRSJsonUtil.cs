using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;

namespace SovereignX.CIEMS.Engine.LiveLink
{
    /// <summary>Tiny JSON helpers for MRS snapshots. Status: skeleton.</summary>
    public static class MRSJsonUtil
    {
        public static MRSStateSnapshot ParseStateSnapshot(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;

            // Prefer Unity JsonUtility when payload matches serializable shape.
            // Envelope: { "type":"state_snapshot", "frame":N, "entities":[ { "id":1, "pos4":[x,y,z,w] } ] }
            var frame = ExtractInt(json, "\"frame\"");
            var seed = ExtractInt(json, "\"seed\"");
            var entities = new List<MRSEntity>();

            var idx = 0;
            while (true)
            {
                var idKey = json.IndexOf("\"id\"", idx, StringComparison.Ordinal);
                if (idKey < 0) break;
                var id = ExtractIntFrom(json, idKey);
                var posKey = json.IndexOf("\"pos4\"", idKey, StringComparison.Ordinal);
                if (posKey < 0) posKey = json.IndexOf("\"Position4D\"", idKey, StringComparison.Ordinal);
                MRSVector4 pos = default;
                if (posKey >= 0)
                {
                    var arrStart = json.IndexOf('[', posKey);
                    var arrEnd = json.IndexOf(']', arrStart + 1);
                    if (arrStart >= 0 && arrEnd > arrStart)
                    {
                        var parts = json.Substring(arrStart + 1, arrEnd - arrStart - 1).Split(',');
                        if (parts.Length >= 4)
                        {
                            pos = new MRSVector4(
                                ParseF(parts[0]), ParseF(parts[1]), ParseF(parts[2]), ParseF(parts[3]));
                        }
                    }
                }

                entities.Add(new MRSEntity { id = id, Position4D = pos });
                idx = idKey + 4;
            }

            return new MRSStateSnapshot
            {
                frame = frame,
                seed = seed,
                timestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Entities = entities.ToArray(),
            };
        }

        static float ParseF(string s) =>
            float.TryParse(s.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : 0f;

        static int ExtractInt(string json, string key)
        {
            var i = json.IndexOf(key, StringComparison.Ordinal);
            return i < 0 ? 0 : ExtractIntFrom(json, i);
        }

        static int ExtractIntFrom(string json, int from)
        {
            var colon = json.IndexOf(':', from);
            if (colon < 0) return 0;
            var end = colon + 1;
            while (end < json.Length && (char.IsWhiteSpace(json[end]) || json[end] == '"')) end++;
            var start = end;
            while (end < json.Length && (char.IsDigit(json[end]) || json[end] == '-')) end++;
            return int.TryParse(json.Substring(start, end - start), out var n) ? n : 0;
        }
    }
}
