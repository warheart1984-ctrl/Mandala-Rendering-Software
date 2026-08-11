// mirrors engine/scripting/IslEngine.cs — JS IslParser/IslInterpreter remain browser authority.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using SovereignX.CIEMS.Engine.Runtime;

namespace SovereignX.CIEMS.Engine.Scripting
{
    public sealed class IslEngine : IIslEngine
    {
        static readonly Dictionary<string, string> VerbToType = new Dictionary<string, string>
        {
            { "play_timeline", "play_timeline" },
            { "render_4d_tesseract", "render_4d_tesseract" },
            { "update_world", "update_world" },
            { "render_scene", "render_scene" },
        };

        public IntentRecord CompileAndEvaluate(string islSource, string contextJson = "{}")
        {
            var context = ParseContext(contextJson);
            var stmts = ParseProgram(islSource);
            if (stmts.Count == 0)
                throw new InvalidOperationException("ISL program has no intent statements");
            return Evaluate(stmts[stmts.Count - 1], context);
        }

        sealed class IntentStmt
        {
            public string Verb;
            public List<object> Args = new List<object>();
            public string WorldId;
            public string At;
            public string EvidenceId;
            public Dictionary<string, object> Params;
        }

        static Dictionary<string, object> ParseContext(string contextJson)
        {
            var ctx = new Dictionary<string, object>();
            if (string.IsNullOrWhiteSpace(contextJson) || contextJson.Trim() == "{}")
                return ctx;
            var actor = MatchStringField(contextJson, "actor");
            var worldId = MatchStringField(contextJson, "worldId");
            if (actor != null) ctx["actor"] = actor;
            if (worldId != null) ctx["worldId"] = worldId;
            return ctx;
        }

        static string MatchStringField(string json, string key)
        {
            var m = Regex.Match(json, "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"([^\"]*)\"");
            return m.Success ? m.Groups[1].Value : null;
        }

        static List<IntentStmt> ParseProgram(string source)
        {
            var stmts = new List<IntentStmt>();
            var cleaned = StripComments(source ?? "");
            var parts = Regex.Split(cleaned, @";\s*");
            foreach (var part in parts)
            {
                var s = part.Trim();
                if (string.IsNullOrEmpty(s)) continue;
                stmts.Add(ParseIntent(s));
            }
            return stmts;
        }

        static string StripComments(string src)
        {
            var sb = new StringBuilder();
            using (var reader = new System.IO.StringReader(src))
            {
                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    var idx = line.IndexOf("//", StringComparison.Ordinal);
                    sb.AppendLine(idx >= 0 ? line.Substring(0, idx) : line);
                }
            }
            return sb.ToString();
        }

        static IntentStmt ParseIntent(string s)
        {
            var m = Regex.Match(
                s,
                @"intent\s+(\w+)\s*\(([^)]*)\)\s+in\s+world\s*\(\s*""([^""]+)""\s*\)(.*)",
                RegexOptions.Singleline | RegexOptions.IgnoreCase);
            if (!m.Success)
                throw new InvalidOperationException("ISL parse error: expected intent <verb>(...) in world(\"...\")");

            var stmt = new IntentStmt
            {
                Verb = m.Groups[1].Value,
                WorldId = m.Groups[3].Value,
            };

            var argsRaw = m.Groups[2].Value.Trim();
            if (!string.IsNullOrEmpty(argsRaw))
            {
                var am = Regex.Match(argsRaw, "^\\s*\"([^\"]*)\"\\s*$");
                if (am.Success)
                    stmt.Args.Add(am.Groups[1].Value);
                else if (double.TryParse(argsRaw, NumberStyles.Float, CultureInfo.InvariantCulture, out var num))
                    stmt.Args.Add(num);
                else
                    stmt.Args.Add(argsRaw);
            }

            var rest = m.Groups[4].Value;
            var atM = Regex.Match(rest, @"\bat\s+""([^""]+)""");
            if (atM.Success) stmt.At = atM.Groups[1].Value;

            var evM = Regex.Match(rest, @"\bwith\s+evidence\s*\(\s*""([^""]+)""\s*\)");
            if (evM.Success)
            {
                stmt.EvidenceId = evM.Groups[1].Value;
            }
            else
            {
                var pm = Regex.Match(rest, @"\bwith\s+params\s*\{([^}]*)\}", RegexOptions.Singleline);
                if (pm.Success)
                {
                    stmt.Params = new Dictionary<string, object>();
                    foreach (Match fm in Regex.Matches(pm.Groups[1].Value, @"(\w+)\s*:\s*([0-9.]+)"))
                    {
                        if (double.TryParse(fm.Groups[2].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var v))
                            stmt.Params[fm.Groups[1].Value] = v;
                    }
                }
            }

            return stmt;
        }

        static IntentRecord Evaluate(IntentStmt stmt, Dictionary<string, object> context)
        {
            VerbToType.TryGetValue(stmt.Verb, out var type);
            type = type ?? stmt.Verb;

            context.TryGetValue("actor", out var actorObj);
            var record = new IntentRecord
            {
                Id = "intent-" + Guid.NewGuid().ToString("N").Substring(0, 10),
                Actor = actorObj as string ?? "4dce.isl",
                Type = type,
                Kind = type,
                World = stmt.WorldId,
                Timestamp = DateTime.UtcNow.ToString("o"),
                Source = "isl-v2",
                Goal = "ISL " + stmt.Verb,
                EvidenceId = stmt.EvidenceId,
                At = stmt.At,
                Params = stmt.Params,
            };
            record.Constraints["worldId"] = stmt.WorldId;
            if (stmt.EvidenceId != null)
                record.Constraints["evidenceId"] = stmt.EvidenceId;
            if (stmt.At != null)
                record.Constraints["at"] = stmt.At;

            object primary = stmt.Args.Count > 0 ? stmt.Args[0] : null;
            if (type == "play_timeline")
            {
                record.Timeline = primary as string;
                record.Payload["timeline"] = record.Timeline;
            }
            else if (type == "render_4d_tesseract")
            {
                record.Entity = primary as string;
                record.Payload["entity"] = record.Entity;
            }
            else if (primary != null)
            {
                record.Payload["arg0"] = primary;
            }

            if (stmt.Params != null)
                record.Payload["params"] = stmt.Params;

            if (context.TryGetValue("worldId", out var ctxWorld) &&
                ctxWorld is string cw &&
                cw != stmt.WorldId)
            {
                record.Constraints["worldMismatch"] = true;
            }

            return record;
        }
    }
}
