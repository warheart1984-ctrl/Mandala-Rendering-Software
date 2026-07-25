using SovereignX.CIEMS.Engine.Conformance;

namespace EngineTests;

public class ConformanceCheckerTests
{
    class PassAllAdapter : IRuntimeAdapter
    {
        public IReadOnlyDictionary<string, Func<(bool pass, string reason)>> Probes =>
            new Dictionary<string, Func<(bool, string)>>
            {
                ["provenance.recorder-exists"] = () => (true, "Recorder exists"),
                ["provenance.frame-fields"] = () => (true, "Frame has all fields"),
            };
    }

    class FailSomeAdapter : IRuntimeAdapter
    {
        public IReadOnlyDictionary<string, Func<(bool pass, string reason)>> Probes =>
            new Dictionary<string, Func<(bool, string)>>
            {
                ["provenance.recorder-exists"] = () => (true, "Recorder exists"),
                ["provenance.frame-fields"] = () => (false, "Missing intentId field"),
            };
    }

    class MissingProbeAdapter : IRuntimeAdapter
    {
        public IReadOnlyDictionary<string, Func<(bool pass, string reason)>> Probes =>
            new Dictionary<string, Func<(bool, string)>>();
    }

    class ThrowingAdapter : IRuntimeAdapter
    {
        public IReadOnlyDictionary<string, Func<(bool pass, string reason)>> Probes =>
            new Dictionary<string, Func<(bool, string)>>
            {
                ["provenance.recorder-exists"] = () => throw new InvalidOperationException("Device lost"),
            };
    }

    [Fact]
    public void Evaluate_AllPass_Returns_Compliant()
    {
        var checks = new List<ConformanceCheckDef>
        {
            new() { Id = "provenance.recorder-exists", Domain = "provenance", Description = "Recorder exists" },
            new() { Id = "provenance.frame-fields", Domain = "provenance", Description = "Frame has fields" },
        };
        var report = ConformanceChecker.Evaluate("test-runtime", checks, new PassAllAdapter());
        Assert.True(report.Compliant);
        Assert.Equal(2, report.Total);
        Assert.Equal(2, report.Passed);
        Assert.Equal(0, report.Failed);
    }

    [Fact]
    public void Evaluate_SomeFail_Returns_NonCompliant()
    {
        var checks = new List<ConformanceCheckDef>
        {
            new() { Id = "provenance.recorder-exists", Domain = "provenance" },
            new() { Id = "provenance.frame-fields", Domain = "provenance" },
        };
        var report = ConformanceChecker.Evaluate("test-runtime", checks, new FailSomeAdapter());
        Assert.False(report.Compliant);
        Assert.Equal(2, report.Total);
        Assert.Equal(1, report.Passed);
        Assert.Equal(1, report.Failed);
    }

    [Fact]
    public void Evaluate_MissingProbe_Reports_Fail()
    {
        var checks = new List<ConformanceCheckDef>
        {
            new() { Id = "missing-check", Domain = "provenance" },
        };
        var report = ConformanceChecker.Evaluate("test-runtime", checks, new MissingProbeAdapter());
        Assert.False(report.Compliant);
        Assert.Equal(1, report.Failed);
        Assert.Equal("No probe registered for this check.", report.Results[0].Reason);
    }

    [Fact]
    public void Evaluate_ThrowingProbe_Reports_Fail()
    {
        var checks = new List<ConformanceCheckDef>
        {
            new() { Id = "provenance.recorder-exists", Domain = "provenance" },
        };
        var report = ConformanceChecker.Evaluate("test-runtime", checks, new ThrowingAdapter());
        Assert.False(report.Compliant);
        Assert.Equal(1, report.Failed);
        Assert.Contains("Probe threw", report.Results[0].Reason);
    }

    [Fact]
    public void Evaluate_Empty_Checks_Returns_Compliant()
    {
        var report = ConformanceChecker.Evaluate("test-runtime", new List<ConformanceCheckDef>(), new PassAllAdapter());
        Assert.True(report.Compliant);
        Assert.Equal(0, report.Total);
        Assert.Equal(0, report.Passed);
        Assert.Equal(0, report.Failed);
    }
}
