// CKL policy + evaluator (expression-lite). Status: host mirror of JS resolveDecision extensions.



using System;

using System.Collections.Generic;

using System.Globalization;

using System.Text.RegularExpressions;

using SovereignX.CIEMS.Engine.Runtime;



namespace SovereignX.CIEMS.Engine.Governance

{

    public class CKLPolicy

    {

        public string Id;

        public string Scope;

        public string Condition;

        public string Rule;

        public string Severity;

        public string Message;

        public string Param;

        public string Modifier;

        public List<string> Require = new List<string>();

    }



    public interface IExpressionEngine

    {

        bool EvaluateBool(string expression, Dictionary<string, object> env);

        double EvaluateNumber(string expression, Dictionary<string, object> env);

    }



    /// <summary>Minimal expression engine for CKL conditions/modifiers (not a full language).</summary>

    public sealed class SimpleExpressionEngine : IExpressionEngine

    {

        public bool EvaluateBool(string expression, Dictionary<string, object> env)

        {

            if (string.IsNullOrWhiteSpace(expression)) return true;

            var e = expression.Trim();



            // Support: A && B

            if (e.Contains("&&"))

            {

                var parts = e.Split(new[] { "&&" }, StringSplitOptions.None);

                foreach (var p in parts)

                    if (!EvaluateBool(p.Trim(), env)) return false;

                return true;

            }



            // intent.timeline == 'x'

            var eq = Regex.Match(e, @"^([\w.]+)\s*==\s*'([^']*)'$");

            if (eq.Success)

                return string.Equals(GetStr(env, eq.Groups[1].Value), eq.Groups[2].Value, StringComparison.Ordinal);



            // drift_score > 0.7

            var cmp = Regex.Match(e, @"^([\w.]+)\s*>\s*([0-9.]+)$");

            if (cmp.Success)

                return GetNum(env, cmp.Groups[1].Value) > double.Parse(cmp.Groups[2].Value, CultureInfo.InvariantCulture);



            // Named predicates (legacy)

            if (e == "intent != null") return env.ContainsKey("intent.type") || env.ContainsKey("intent");

            return GetBoolish(env, e);

        }



        public double EvaluateNumber(string expression, Dictionary<string, object> env)

        {

            if (string.IsNullOrWhiteSpace(expression)) return 0;

            var e = expression.Trim();

            var mul = Regex.Match(e, @"^([\w.]+)\s*\*\s*([0-9.]+)$");

            if (mul.Success)

                return GetNum(env, mul.Groups[1].Value) * double.Parse(mul.Groups[2].Value, CultureInfo.InvariantCulture);

            return GetNum(env, e);

        }



        static string GetStr(Dictionary<string, object> env, string key)

        {

            if (env != null && env.TryGetValue(key, out var v) && v != null) return v.ToString();

            return "";

        }



        static double GetNum(Dictionary<string, object> env, string key)

        {

            if (env == null || !env.TryGetValue(key, out var v) || v == null) return 0;

            if (v is double d) return d;

            if (v is float f) return f;

            if (v is int i) return i;

            double.TryParse(v.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var n);

            return n;

        }



        static bool GetBoolish(Dictionary<string, object> env, string key)

        {

            if (env == null || !env.TryGetValue(key, out var v) || v == null) return false;

            if (v is bool b) return b;

            return !string.IsNullOrEmpty(v.ToString());

        }

    }



    public class RuntimeContext

    {

        public double DriftScore;

        readonly Dictionary<string, double> _params = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);



        public double GetParam(string name) =>

            _params.TryGetValue(name, out var v) ? v : 0;



        public void SetParam(string name, double value) => _params[name] = value;



        public IReadOnlyDictionary<string, double> Snapshot() =>

            new Dictionary<string, double>(_params);

    }



    public class CKLEvaluator

    {

        readonly IEnumerable<CKLPolicy> _policies;

        readonly IExpressionEngine _expr;



        public CKLEvaluator(IEnumerable<CKLPolicy> policies, IExpressionEngine expr)

        {

            _policies = policies ?? Array.Empty<CKLPolicy>();

            _expr = expr ?? new SimpleExpressionEngine();

        }



        public Decision Evaluate(IntentRecord intent, EvidenceBundle evidence, RuntimeContext ctx)

        {

            var decision = new Decision

            {

                Ok = true,

                Verdict = "allow",

                Reason = "Policies satisfied",

                Violations = new List<string>(),

            };

            if (intent == null)

            {

                decision.Ok = false;

                decision.Verdict = "deny";

                decision.Reason = "No execution without intent.";

                decision.Violations.Add("policy-no-execution-without-intent");

                return decision;

            }



            ctx = ctx ?? new RuntimeContext();

            var timelineId = intent.Timeline ?? FirstParamString(intent);

            var env = new Dictionary<string, object>

            {

                ["intent.type"] = intent.Type ?? intent.Kind ?? "",

                ["intent.timeline"] = timelineId ?? "",

                ["intent.world"] = intent.World ?? "",

                ["evidence.count"] = evidence != null ? 1 : 0,

                ["drift_score"] = ctx.DriftScore,

            };



            foreach (var p in _policies)

            {

                bool cond = _expr.EvaluateBool(p.Condition, env);

                switch (p.Rule)

                {

                    case "deny_if_false":

                        if (p.Require != null && p.Require.Count > 0)

                        {

                            if (cond && !HasAllEvidence(evidence, p.Require))

                            {

                                decision.Ok = false;

                                decision.Verdict = "deny";

                                decision.Reason = p.Message ?? p.Id;

                                decision.Violations.Add(p.Id);

                            }

                        }

                        else if (!cond)

                        {

                            decision.Ok = false;

                            decision.Verdict = "deny";

                            decision.Reason = p.Message ?? p.Id;

                            decision.Violations.Add(p.Id);

                        }

                        break;

                    case "attach_provenance":

                        if (cond) decision.AttachProvenance = true;

                        break;

                    case "modify_param":

                        if (cond && !string.IsNullOrEmpty(p.Param))

                        {

                            double current = ctx.GetParam(p.Param);

                            env[p.Param] = current;

                            env["speed"] = current;

                            double modified = _expr.EvaluateNumber(p.Modifier, env);

                            ctx.SetParam(p.Param, modified);

                            decision.ParamAdjust = new Dictionary<string, object>

                            {

                                [p.Param] = modified,

                                ["policy"] = p.Id,

                            };

                        }

                        break;

                }

            }



            return decision;

        }



        static bool HasAllEvidence(EvidenceBundle evidence, List<string> require)

        {

            if (evidence == null || require == null) return false;

            var ids = new HashSet<string>(StringComparer.Ordinal);

            if (!string.IsNullOrEmpty(evidence.Id)) ids.Add(evidence.Id);

            if (evidence.Fields != null)

            {

                foreach (var kv in evidence.Fields)

                {

                    if (kv.Key == "id" || kv.Key == "evidenceId")

                        ids.Add(kv.Value?.ToString() ?? "");

                    if (kv.Key == "evidenceIds" && kv.Value is IEnumerable<string> list)

                        foreach (var id in list) ids.Add(id);

                }

            }

            foreach (var r in require)

                if (!ids.Contains(r)) return false;

            return true;

        }



        static string FirstParamString(IntentRecord intent)

        {

            if (intent?.Params == null) return null;

            if (intent.Params.TryGetValue("timelineId", out var t) && t is string s) return s;

            return null;

        }

    }

}

