// HostConstitutionalBridge — thin Unity stub for MultiHost constitutional routing.
// STATUS: **skeleton** product host. Constitutional deny/allow SoT lives in
// `engine/runtime/hosts/HostConstitutionalRouter.js` (JS, node:test **enforced**).
// This C# type documents the contract surface; Play Mode CI is NOT claimed.

using System;
using System.Collections.Generic;

namespace GovernedEngine.Runtime.Hosts
{
    /// <summary>
    /// Mirrors JS HostConstitutionalRouter actions for editor tooling.
    /// Does not execute Node; operators must call the JS router for authoritative denies.
    /// </summary>
    public static class HostConstitutionalBridge
    {
        public const string GpuPrint = "gpu.print";
        public const string SetDeterminismRequired = "setDeterminismRequired";
        public const string InjectEvidence = "injectEvidence";
        public const string RenderAssist = "renderAssist";

        public static readonly HashSet<string> ForbiddenPrintActions = new HashSet<string>
        {
            GpuPrint,
            "print.gpu",
        };

        /// <summary>
        /// Local soft check for editor UX only — not a substitute for JS SoT tests.
        /// </summary>
        public static (bool ok, string code, string message) SoftRoute(string action, IDictionary<string, object> payload = null)
        {
            if (string.IsNullOrEmpty(action))
                return (false, "HOST_CONSTITUTIONAL_DENY", "empty action");

            if (ForbiddenPrintActions.Contains(action))
                return (false, "HOST_CONSTITUTIONAL_DENY", "GPU print SoT denied — use cpu.rt4d.print");

            if (action == SetDeterminismRequired)
            {
                if (payload != null &&
                    (HasTruthy(payload, "asPrintAuthority") ||
                     HasTruthy(payload, "gpu") ||
                     StartsWithGpu(payload)))
                {
                    return (false, "HOST_CONSTITUTIONAL_DENY",
                        "setDeterminismRequired is not print authority for GPU");
                }
            }

            if (action == InjectEvidence && payload != null &&
                (payload.ContainsKey("apiKey") || payload.ContainsKey("api_key")))
            {
                return (false, "HOST_CONSTITUTIONAL_DENY", "injectEvidence denied — secret field");
            }

            if (action == RenderAssist)
                return (true, null, "GPU/host render assist allowed — not Digital Printer SoT");

            return (false, "HOST_CONSTITUTIONAL_DENY", $"Unknown or unenforced action '{action}' in Unity stub");
        }

        static bool HasTruthy(IDictionary<string, object> payload, string key)
        {
            if (!payload.TryGetValue(key, out var v) || v == null) return false;
            if (v is bool b) return b;
            return Convert.ToBoolean(v);
        }

        static bool StartsWithGpu(IDictionary<string, object> payload)
        {
            if (payload.TryGetValue("capabilityId", out var id) && id is string s)
                return s.StartsWith("gpu.", StringComparison.Ordinal);
            return false;
        }
    }
}
