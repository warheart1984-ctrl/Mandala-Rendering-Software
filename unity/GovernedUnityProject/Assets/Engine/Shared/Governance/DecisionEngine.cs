// DecisionEngine.cs — apply CKL policies to intent + evidence.
// Mirrors resolveDecision in ConstitutionalKnowledgeLayer.js.
// Status: host mirror (policy evaluation logic).

using System.Collections.Generic;
using SovereignX.CIEMS.Engine.Runtime;

namespace SovereignX.CIEMS.Engine.Governance
{
    public static class DecisionEngine
    {
        static readonly HashSet<string> MutationTypes = new HashSet<string>
        {
            "update_world",
            "play_timeline",
            "render_4d_tesseract",
            "artifact.picture",
            "artifact.movie",
            "render.session",
        };

        public static Decision Resolve(
            IntentRecord intent,
            EvidenceBundle evidence,
            PolicySet policySet,
            IReadOnlyList<PrecedentRecord> precedents = null)
        {
            var violations = new List<string>();
            var requirements = new List<string>();
            var attachProvenance = false;
            Dictionary<string, object> paramAdjust = null;

            if (intent == null)
            {
                return new Decision
                {
                    Ok = false,
                    Verdict = "deny",
                    Reason = "No execution without intent.",
                    Violations = new List<string> { "policy-no-execution-without-intent" },
                };
            }

            var policies = policySet?.Policies ?? new List<PolicyRule>();
            var type = intent.Type ?? intent.Kind;

            foreach (var policy in policies)
            {
                if (policy.Condition == "intent != null")
                    continue;

                if (policy.Condition == "require_evidence_for_mutation")
                {
                    if (MutationTypes.Contains(type) && evidence == null)
                        violations.Add(policy.Id);
                }

                if (policy.Condition == "play_timeline_or_render_4d")
                {
                    if (type == "play_timeline" || type == "render_4d_tesseract")
                    {
                        if (policy.Rule == "attach_provenance")
                        {
                            attachProvenance = true;
                            requirements.Add("provenance");
                        }
                        if (evidence == null)
                            violations.Add(policy.Id);
                    }
                }

                if (policy.Condition == "actor_has_contract")
                {
                    if (string.IsNullOrEmpty(intent.Actor))
                        violations.Add(policy.Id);
                }

                if (policy.Condition == "play_timeline_requires_world")
                {
                    if (type == "play_timeline")
                    {
                        var world = intent.World;
                        if (string.IsNullOrEmpty(world) &&
                            intent.Constraints != null &&
                            intent.Constraints.TryGetValue("worldId", out var w))
                            world = w as string;
                        if (string.IsNullOrEmpty(world))
                            violations.Add(policy.Id);
                    }
                }

                // Expression-lite ascension policies (mirrors JS resolveDecision)
                if (!string.IsNullOrEmpty(policy.Condition) &&
                    policy.Condition.Contains("intent.timeline =="))
                {
                    var timelineId = intent.Timeline ?? "";
                    double drift = 0;
                    if (evidence?.Fields != null &&
                        evidence.Fields.TryGetValue("driftScore", out var ds) &&
                        ds != null)
                        double.TryParse(ds.ToString(), out drift);

                    if (EvalTimelineCondition(policy.Condition, timelineId, drift))
                    {
                        if (policy.Rule == "deny_if_false" &&
                            policy.Require != null &&
                            policy.Require.Count > 0)
                        {
                            if (!HasAllEvidence(evidence, policy.Require))
                            {
                                violations.Add(policy.Id);
                                foreach (var r in policy.Require)
                                    requirements.Add("evidence:" + r);
                            }
                        }
                        if (policy.Rule == "modify_param" &&
                            !string.IsNullOrEmpty(policy.Param) &&
                            !string.IsNullOrEmpty(policy.Modifier))
                        {
                            double current = 1;
                            if (intent.Params != null &&
                                intent.Params.TryGetValue(policy.Param, out var pv) &&
                                pv != null)
                                double.TryParse(pv.ToString(), out current);
                            var modified = EvalModifier(policy.Modifier, policy.Param, current);
                            paramAdjust = new Dictionary<string, object>
                            {
                                { policy.Param, modified },
                                { "policy", policy.Id },
                            };
                        }
                    }
                }
            }

            var recentDenials = 0;
            if (precedents != null)
            {
                foreach (var p in precedents)
                {
                    if (Equals(p.Decision, false) || Equals(p.Decision, "deny"))
                        recentDenials++;
                }
            }
            if (recentDenials >= 2 && intent.Params != null)
            {
                paramAdjust = new Dictionary<string, object>
                {
                    { "speedFactor", 0.75 },
                    { "reason", "high_drift_precedent" },
                };
            }

            if (violations.Count > 0)
            {
                return new Decision
                {
                    Ok = false,
                    Verdict = "deny",
                    Reason = "Constitutional policy violation",
                    Violations = violations,
                    Requirements = requirements,
                    AttachProvenance = attachProvenance,
                    ParamAdjust = paramAdjust,
                };
            }

            return new Decision
            {
                Ok = true,
                Verdict = "allow",
                Reason = "Policies satisfied",
                Violations = new List<string>(),
                Requirements = requirements,
                AttachProvenance = attachProvenance,
                ParamAdjust = paramAdjust,
                DecisionId = "decision-" + intent.Id,
            };
        }

        static bool EvalTimelineCondition(string condition, string timelineId, double driftScore)
        {
            if (string.IsNullOrEmpty(condition)) return false;
            var parts = condition.Split(new[] { "&&" }, System.StringSplitOptions.None);
            foreach (var raw in parts)
            {
                var part = raw.Trim();
                if (part.StartsWith("intent.timeline =="))
                {
                    var q = part.IndexOf('\'');
                    var q2 = part.LastIndexOf('\'');
                    if (q < 0 || q2 <= q) return false;
                    var expected = part.Substring(q + 1, q2 - q - 1);
                    if (timelineId != expected) return false;
                    continue;
                }
                if (part.StartsWith("drift_score >"))
                {
                    var num = part.Substring("drift_score >".Length).Trim();
                    if (!double.TryParse(num, System.Globalization.NumberStyles.Float,
                        System.Globalization.CultureInfo.InvariantCulture, out var thr))
                        return false;
                    if (!(driftScore > thr)) return false;
                    continue;
                }
                return false;
            }
            return true;
        }

        static bool HasAllEvidence(EvidenceBundle evidence, List<string> require)
        {
            if (evidence == null || require == null) return false;
            var ids = new HashSet<string>();
            if (!string.IsNullOrEmpty(evidence.Id)) ids.Add(evidence.Id);
            if (evidence.Fields != null &&
                evidence.Fields.TryGetValue("evidenceIds", out var list) &&
                list is System.Collections.IEnumerable enumerable)
            {
                foreach (var item in enumerable)
                    if (item != null) ids.Add(item.ToString());
            }
            foreach (var r in require)
                if (!ids.Contains(r)) return false;
            return true;
        }

        static double EvalModifier(string modifier, string param, double current)
        {
            var e = (modifier ?? "").Trim();
            var star = e.IndexOf('*');
            if (star > 0)
            {
                var left = e.Substring(0, star).Trim();
                var right = e.Substring(star + 1).Trim();
                if (left == param || left == "speed")
                {
                    if (double.TryParse(right, System.Globalization.NumberStyles.Float,
                        System.Globalization.CultureInfo.InvariantCulture, out var f))
                        return current * f;
                }
            }
            return current;
        }
    }
}
