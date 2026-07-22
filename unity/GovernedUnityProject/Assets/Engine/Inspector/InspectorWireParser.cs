using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;

namespace SovereignX.CIEMS.Engine.Inspector
{
    /// <summary>
    /// Parses INSPECTOR_PROTOCOL.md inspect_result JSON into Inspector4DResultDTO.
    /// Handles wire arrays [x,y,z,w] (JsonUtility cannot). Status: skeleton parser.
    /// </summary>
    public static class InspectorWireParser
    {
        public static Inspector4DResultDTO ParseInspectResult(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;
            if (json.IndexOf("inspect_result", StringComparison.Ordinal) < 0) return null;

            var dto = new Inspector4DResultDTO
            {
                schemaVersion = ExtractString(json, "schemaVersion") ?? "1.1",
                ok = ExtractBool(json, "ok"),
                error = ExtractString(json, "error"),
                curvatureStub = true,
            };

            if (!dto.ok) return dto;

            dto.position = ExtractVec4(json, "position");
            dto.normal4D = ExtractVec4(json, "normal4D");

            var t1Obj = ExtractObject(json, "tangentBasis");
            if (!string.IsNullOrEmpty(t1Obj))
            {
                dto.tangent1 = ExtractVec4(t1Obj, "t1");
                dto.tangent2 = ExtractVec4(t1Obj, "t2");
            }

            var cur = ExtractObject(json, "curvature");
            if (!string.IsNullOrEmpty(cur))
            {
                dto.k1 = ExtractFloat(cur, "k1");
                dto.k2 = ExtractFloat(cur, "k2");
                dto.curvatureStub = ExtractBool(cur, "curvatureStub", defaultValue: true);
            }

            dto.jacobian4x2 = MatrixFromJacobian(ExtractArrayBlock(json, "jacobian"));
            dto.projectionMatrix = MatrixFromRows(ExtractArrayBlock(json, "projectionMatrix"));

            dto.rotationPlanes = ParseRotationPlanes(json);
            dto.hyperplanes = ParseHyperplanes(json);

            var top = ExtractObject(json, "topology");
            if (!string.IsNullOrEmpty(top))
            {
                dto.topology = new TopologyDTO
                {
                    incidentCellIds = ExtractIntArray(top, "incidentCellIds"),
                    neighborCellIds = ExtractIntArray(top, "neighborCellIds"),
                    isBoundary = ExtractBool(top, "isBoundary"),
                };
            }

            var prov = ExtractObject(json, "provenance");
            if (!string.IsNullOrEmpty(prov))
            {
                dto.primitiveId = ExtractInt(prov, "primitiveId", -1);
                dto.faceIndex = ExtractInt(prov, "faceIndex", -1);
            }

            return dto;
        }

        static RotationPlaneDTO[] ParseRotationPlanes(string json)
        {
            var block = ExtractArrayBlock(json, "rotationPlanes");
            if (string.IsNullOrEmpty(block)) return Array.Empty<RotationPlaneDTO>();
            var list = new List<RotationPlaneDTO>();
            foreach (var obj in SplitObjects(block))
            {
                list.Add(new RotationPlaneDTO
                {
                    axisA = ExtractVec4(obj, "axisA"),
                    axisB = ExtractVec4(obj, "axisB"),
                    angle = ExtractFloat(obj, "angle"),
                    label = ExtractString(obj, "label") ?? "",
                });
            }
            return list.ToArray();
        }

        static HyperplaneIntersectionDTO[] ParseHyperplanes(string json)
        {
            var block = ExtractArrayBlock(json, "hyperplanes");
            if (string.IsNullOrEmpty(block)) return Array.Empty<HyperplaneIntersectionDTO>();
            var list = new List<HyperplaneIntersectionDTO>();
            foreach (var obj in SplitObjects(block))
            {
                list.Add(new HyperplaneIntersectionDTO
                {
                    normal = ExtractVec4(obj, "normal"),
                    d = ExtractFloat(obj, "d"),
                    distance = ExtractFloat(obj, "distance"),
                    onPlane = ExtractBool(obj, "onPlane"),
                });
            }
            return list.ToArray();
        }

        static Matrix4x4 MatrixFromJacobian(string block)
        {
            // Wire jacobian is 4×2; store in Matrix4x4 columns 0–1.
            var m = Matrix4x4.zero;
            if (string.IsNullOrEmpty(block)) return Matrix4x4.identity;
            var rows = SplitNestedArrays(block);
            for (var r = 0; r < rows.Count && r < 4; r++)
            {
                var vals = ParseFloatList(rows[r]);
                if (vals.Count > 0) m[r, 0] = vals[0];
                if (vals.Count > 1) m[r, 1] = vals[1];
            }
            return m;
        }

        static Matrix4x4 MatrixFromRows(string block)
        {
            var m = Matrix4x4.identity;
            if (string.IsNullOrEmpty(block)) return m;
            var rows = SplitNestedArrays(block);
            for (var r = 0; r < rows.Count && r < 4; r++)
            {
                var vals = ParseFloatList(rows[r]);
                for (var c = 0; c < vals.Count && c < 4; c++)
                    m[r, c] = vals[c];
            }
            return m;
        }

        static Vector4 ExtractVec4(string json, string key)
        {
            var keyIdx = json.IndexOf("\"" + key + "\"", StringComparison.Ordinal);
            if (keyIdx < 0) return Vector4.zero;
            var arrStart = json.IndexOf('[', keyIdx);
            if (arrStart < 0) return Vector4.zero;
            var arrEnd = FindMatchingBracket(json, arrStart, '[', ']');
            if (arrEnd < 0) return Vector4.zero;
            var parts = ParseFloatList(json.Substring(arrStart + 1, arrEnd - arrStart - 1));
            return new Vector4(
                parts.Count > 0 ? parts[0] : 0,
                parts.Count > 1 ? parts[1] : 0,
                parts.Count > 2 ? parts[2] : 0,
                parts.Count > 3 ? parts[3] : 0);
        }

        static string ExtractObject(string json, string key)
        {
            var keyIdx = json.IndexOf("\"" + key + "\"", StringComparison.Ordinal);
            if (keyIdx < 0) return null;
            var brace = json.IndexOf('{', keyIdx);
            if (brace < 0) return null;
            var end = FindMatchingBracket(json, brace, '{', '}');
            return end < 0 ? null : json.Substring(brace, end - brace + 1);
        }

        static string ExtractArrayBlock(string json, string key)
        {
            var keyIdx = json.IndexOf("\"" + key + "\"", StringComparison.Ordinal);
            if (keyIdx < 0) return null;
            var start = json.IndexOf('[', keyIdx);
            if (start < 0) return null;
            var end = FindMatchingBracket(json, start, '[', ']');
            return end < 0 ? null : json.Substring(start + 1, end - start - 1);
        }

        static int[] ExtractIntArray(string json, string key)
        {
            var block = ExtractArrayBlock(json, key);
            if (string.IsNullOrEmpty(block)) return Array.Empty<int>();
            var parts = block.Split(',');
            var list = new List<int>();
            foreach (var p in parts)
            {
                if (int.TryParse(p.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var n))
                    list.Add(n);
            }
            return list.ToArray();
        }

        static List<string> SplitObjects(string block)
        {
            var list = new List<string>();
            var i = 0;
            while (i < block.Length)
            {
                var start = block.IndexOf('{', i);
                if (start < 0) break;
                var end = FindMatchingBracket(block, start, '{', '}');
                if (end < 0) break;
                list.Add(block.Substring(start, end - start + 1));
                i = end + 1;
            }
            return list;
        }

        static List<string> SplitNestedArrays(string block)
        {
            var list = new List<string>();
            var i = 0;
            while (i < block.Length)
            {
                var start = block.IndexOf('[', i);
                if (start < 0) break;
                var end = FindMatchingBracket(block, start, '[', ']');
                if (end < 0) break;
                list.Add(block.Substring(start + 1, end - start - 1));
                i = end + 1;
            }
            return list;
        }

        static List<float> ParseFloatList(string s)
        {
            var list = new List<float>();
            if (string.IsNullOrEmpty(s)) return list;
            foreach (var part in s.Split(','))
            {
                if (float.TryParse(part.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var v))
                    list.Add(v);
            }
            return list;
        }

        static int FindMatchingBracket(string s, int openIdx, char open, char close)
        {
            var depth = 0;
            for (var i = openIdx; i < s.Length; i++)
            {
                if (s[i] == open) depth++;
                else if (s[i] == close)
                {
                    depth--;
                    if (depth == 0) return i;
                }
            }
            return -1;
        }

        static string ExtractString(string json, string key)
        {
            var keyIdx = json.IndexOf("\"" + key + "\"", StringComparison.Ordinal);
            if (keyIdx < 0) return null;
            var colon = json.IndexOf(':', keyIdx);
            if (colon < 0) return null;
            var q1 = json.IndexOf('"', colon + 1);
            if (q1 < 0) return null;
            // null literal
            var slice = json.Substring(colon + 1, Math.Min(8, json.Length - colon - 1)).TrimStart();
            if (slice.StartsWith("null", StringComparison.Ordinal)) return null;
            var q2 = json.IndexOf('"', q1 + 1);
            return q2 < 0 ? null : json.Substring(q1 + 1, q2 - q1 - 1);
        }

        static bool ExtractBool(string json, string key, bool defaultValue = false)
        {
            var keyIdx = json.IndexOf("\"" + key + "\"", StringComparison.Ordinal);
            if (keyIdx < 0) return defaultValue;
            var colon = json.IndexOf(':', keyIdx);
            if (colon < 0) return defaultValue;
            var rest = json.Substring(colon + 1, Math.Min(12, json.Length - colon - 1)).TrimStart();
            if (rest.StartsWith("true", StringComparison.Ordinal)) return true;
            if (rest.StartsWith("false", StringComparison.Ordinal)) return false;
            return defaultValue;
        }

        static float ExtractFloat(string json, string key)
        {
            var keyIdx = json.IndexOf("\"" + key + "\"", StringComparison.Ordinal);
            if (keyIdx < 0) return 0f;
            var colon = json.IndexOf(':', keyIdx);
            if (colon < 0) return 0f;
            var end = colon + 1;
            while (end < json.Length && char.IsWhiteSpace(json[end])) end++;
            var start = end;
            while (end < json.Length && (char.IsDigit(json[end]) || json[end] == '-' || json[end] == '+' ||
                                         json[end] == '.' || json[end] == 'e' || json[end] == 'E'))
                end++;
            return float.TryParse(json.Substring(start, end - start), NumberStyles.Float,
                CultureInfo.InvariantCulture, out var v)
                ? v
                : 0f;
        }

        static int ExtractInt(string json, string key, int defaultValue = 0)
        {
            var keyIdx = json.IndexOf("\"" + key + "\"", StringComparison.Ordinal);
            if (keyIdx < 0) return defaultValue;
            var colon = json.IndexOf(':', keyIdx);
            if (colon < 0) return defaultValue;
            var end = colon + 1;
            while (end < json.Length && (char.IsWhiteSpace(json[end]) || json[end] == '"')) end++;
            var start = end;
            while (end < json.Length && (char.IsDigit(json[end]) || json[end] == '-')) end++;
            return int.TryParse(json.Substring(start, end - start), out var n) ? n : defaultValue;
        }
    }
}
