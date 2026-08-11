#if UNITY_EDITOR
using System.Collections.Generic;
using System.IO;
using SovereignX.CIEMS.Engine.Conformance;
using UnityEditor;
using UnityEngine;

/// <summary>Editor menu: run constitutional conformance probes without Play Mode.</summary>
public static class ConformanceRunnerMenu
{
    const string ProfileRelative = "engine/conformance/default.conformance-profile.json";

    [MenuItem("SovereignX.CIEMS.Engine/Run Conformance Checks")]
    public static void RunConformance()
    {
        var profilePath = ResolveProfilePath();
        if (!File.Exists(profilePath))
        {
            Debug.LogError("[Conformance] Profile not found: " + profilePath);
            return;
        }

        var profileJson = File.ReadAllText(profilePath);
        var wrapper = JsonUtility.FromJson<ProfileWrapper>(profileJson);
        if (wrapper?.checks == null || wrapper.checks.Length == 0)
        {
            Debug.LogError("[Conformance] No checks in profile.");
            return;
        }

        var adapter = UnityRuntimeAdapter.CreateDefault();
        var defs = new List<ConformanceCheckDef>();
        foreach (var c in wrapper.checks)
        {
            defs.Add(new ConformanceCheckDef
            {
                Id = c.id,
                Domain = c.domain,
                Description = c.description,
                Severity = c.severity,
            });
        }

        var report = ConformanceChecker.Evaluate("unity", defs, adapter);
        Debug.Log(ConformanceChecker.FormatReport(report));
        if (!report.Compliant)
            Debug.LogWarning($"[Conformance] {report.Failed} check(s) failed.");
        else
            Debug.Log("[Conformance] Unity runtime is fully compliant.");
    }

    static string ResolveProfilePath()
    {
        var candidates = new[]
        {
            Path.GetFullPath(Path.Combine(Application.dataPath, "../../../", ProfileRelative)),
            Path.GetFullPath(Path.Combine(Application.dataPath, "../../", ProfileRelative)),
        };
        foreach (var path in candidates)
            if (File.Exists(path)) return path;
        return candidates[0];
    }

    // JsonUtility cannot parse top-level arrays — profile file is { version, checks: [...] }.

    [System.Serializable]
    class ProfileWrapper
    {
        public string version;
        public ProfileCheck[] checks;
    }

    [System.Serializable]
    class ProfileCheck
    {
        public string id;
        public string domain;
        public string description;
        public string severity;
    }
}
#endif
