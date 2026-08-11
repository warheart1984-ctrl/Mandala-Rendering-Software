// GovernedEngineTests — automation tests for CKL governance, MRQ movie capture, conformance
// Runs in Editor PIE context; CI invokes via UnrealEditor-Cmd.exe -run=GovernedEngineTests

#include "CoreMinimal.h"
#include "Misc/AutomationTest.h"
#include "GovernedEngineModule.h"
#include "CKL.h"
#include "Decision.h"
#include "IntentRecord.h"
#include "GovernedMovieCapture.h"
#include "GovernedMovieCaptureMRQ.h"
#include "CssvRegistry.h"
#include "TimelineExecutor.h"

#if WITH_EDITOR

// ============================================================================
// CKL Governance Tests
// ============================================================================

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FGovernedEngineCKLTest, "GovernedEngine.CKL.BasicGovernance",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGovernedEngineCKLTest::RunTest(const FString& Parameters)
{
	// Load policies from repo default
	FGovernanceKernel& Kernel = FGovernanceKernel::Get();
	
	FIntentRecord Intent;
	Intent.Id = TEXT("test-intent-001");
	Intent.Type = TEXT("play_timeline");
	Intent.Kind = TEXT("play_timeline");
	Intent.Actor = TEXT("runtime.unreal");
	Intent.World = TEXT("world-test");
	Intent.TimelineId = TEXT("test-timeline");

	FEvidenceBundle Evidence = FEvidenceBundle::Empty();
	Evidence.bEmpty = false;
	Evidence.Timestamp = FDateTime::UtcNow().ToIso8601();
	Evidence.Fields.Add(TEXT("evidenceId"), TEXT("ev-test-001"));
	Evidence.Fields.Add(TEXT("evidenceIds"), TEXT("ev-test-001"));

	FDecision Decision = Kernel.EvaluateIntent(Intent, Evidence);

	// With valid world, should allow
	TestTrue(TEXT("CKL allows play_timeline with world"), Decision.bAllowed);
	TestEqual(TEXT("Verdict is allow"), Decision.Verdict, TEXT("allow"));

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FGovernedEngineCKLNoWorldTest, "GovernedEngine.CKL.DenyNoWorld",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGovernedEngineCKLNoWorldTest::RunTest(const FString& Parameters)
{
	FGovernanceKernel& Kernel = FGovernanceKernel::Get();
	
	FIntentRecord Intent;
	Intent.Id = TEXT("test-intent-002");
	Intent.Type = TEXT("play_timeline");
	Intent.Kind = TEXT("play_timeline");
	Intent.Actor = TEXT("runtime.unreal");
	Intent.World = TEXT(""); // Empty world
	Intent.TimelineId = TEXT("test-timeline");

	FEvidenceBundle Evidence = FEvidenceBundle::Empty();
	Evidence.bEmpty = false;

	FDecision Decision = Kernel.EvaluateIntent(Intent, Evidence);

	// Without world, should deny
	TestFalse(TEXT("CKL denies play_timeline without world"), Decision.bAllowed);
	TestTrue(TEXT("Violation includes policy-play-timeline-requires-world"), 
		Decision.Violations.Contains(TEXT("policy-play-timeline-requires-world")));

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FGovernedEngineCKLAscensionDriftTest, "GovernedEngine.CKL.AscensionDriftThrottle",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGovernedEngineCKLAscensionDriftTest::RunTest(const FString& Parameters)
{
	FGovernanceKernel& Kernel = FGovernanceKernel::Get();
	
	FIntentRecord Intent;
	Intent.Id = TEXT("test-intent-003");
	Intent.Type = TEXT("mythar_ascension");
	Intent.Kind = TEXT("mythar_ascension");
	Intent.Actor = TEXT("runtime.unreal");
	Intent.World = TEXT("world-mythar-plains");
	Intent.TimelineId = TEXT("mythar_ascension");
	Intent.Params.Add(TEXT("driftScore"), 0.9); // High drift

	FEvidenceBundle Evidence = FEvidenceBundle::Empty();
	Evidence.bEmpty = false;
	Evidence.Timestamp = FDateTime::UtcNow().ToIso8601();
	Evidence.Fields.Add(TEXT("evidenceId"), TEXT("ev-ascension-001"));
	Evidence.Fields.Add(TEXT("evidenceIds"), TEXT("ev-ascension-001,ev-ascension-002"));
	Evidence.Fields.Add(TEXT("driftScore"), TEXT("0.9"));

	FDecision Decision = Kernel.EvaluateIntent(Intent, Evidence);

	// High drift should throttle speed
	TestTrue(TEXT("CKL allows ascension with dual evidence"), Decision.bAllowed);
	TestTrue(TEXT("ParamAdjust contains speed throttle"), Decision.ParamAdjust.Contains(TEXT("speed")));
	if (Decision.ParamAdjust.Contains(TEXT("speed")))
	{
		double SpeedValue = 1.0;
		Decision.ParamAdjust[TEXT("speed")].TryGetValue(SpeedValue);
		TestTrue(TEXT("Speed throttled below 1.0"), SpeedValue < 1.0);
	}

	return true;
}

// ============================================================================
// MRQ Movie Capture Tests
// ============================================================================

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FGovernedEngineMRQTest, "GovernedEngine.MRQ.GovernedMovieCaptureMRQ",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGovernedEngineMRQTest::RunTest(const FString& Parameters)
{
	// Verify MRQ component can be constructed
	UGovernedMovieCaptureMRQComponent* Comp = NewObject<UGovernedMovieCaptureMRQComponent>();
	TestNotNull(TEXT("MRQ component constructible"), Comp);

	// Check default values
	TestEqual(TEXT("DefaultSeconds"), Comp->DefaultSeconds, 8.0f);
	TestEqual(TEXT("DefaultFps"), Comp->DefaultFps, 30);
	TestEqual(TEXT("OutputFormat"), Comp->OutputFormat, TEXT("proRes"));

	// Test MRQ availability check
	bool bAvailable = UGovernedMovieCaptureMRQComponent::IsMRQAvailable();
	UE_LOG(LogTemp, Log, TEXT("[MRQTest] MRQ Available: %s"), bAvailable ? TEXT("true") : TEXT("false"));
	
	// In CI with nullrhi, MRQ may not be available - that's OK for this test
	TestTrue(TEXT("IsMRQAvailable runs without crash"), true);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FGovernedEngineMovieCaptureFallbackTest, "GovernedEngine.MRQ.FallbackToPNG",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGovernedEngineMovieCaptureFallbackTest::RunTest(const FString& Parameters)
{
	// Test that fallback path exists
	UGovernedMovieCaptureComponent* PngComp = NewObject<UGovernedMovieCaptureComponent>();
	TestNotNull(TEXT("PNG capture component constructible"), PngComp);

	TestEqual(TEXT("DefaultSeconds"), PngComp->DefaultSeconds, 8.0f);
	TestEqual(TEXT("DefaultFps"), PngComp->DefaultFps, 30);

	return true;
}

// ============================================================================
// CSSV Registry Tests
// ============================================================================

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FGovernedEngineCSSVTest, "GovernedEngine.CSSV.RegistryOperations",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGovernedEngineCSSVTest::RunTest(const FString& Parameters)
{
	FCssvRegistry& Registry = FCssvRegistry::Get();
	
	// Register artifact
	FCssvArtifactRecord Artifact;
	Artifact.Id = TEXT("test-artifact-001");
	Artifact.ArtifactType = TEXT("test");
	Artifact.Payload = MakeShared<FJsonObject>();
	Artifact.Payload->SetStringField(TEXT("testKey"), TEXT("testValue"));
	
	Registry.RegisterArtifact(Artifact);
	
	// Register transition
	FCssvTransitionRecord Transition;
	Transition.Id = TEXT("test-transition-001");
	Transition.FromStateId = TEXT("state-0000");
	Transition.ToStateId = TEXT("state-0001");
	Transition.Authority = TEXT("runtime.unreal");
	Transition.TimeSeconds = FPlatformTime::Seconds();
	
	Registry.RegisterTransition(Transition);
	
	// Register frame
	FFrameProvenance Frame;
	Frame.IntentId = TEXT("test-intent");
	Frame.TimelineId = TEXT("test-timeline");
	Frame.WorldId = TEXT("test-world");
	Frame.TimeSeconds = 1.0;
	Frame.Parameters.Add(TEXT("speed"), 1.5);
	
	Registry.RegisterFrame(Frame);
	
	// Export snapshot
	TSharedPtr<FJsonObject> Snapshot = Registry.ExportSnapshot();
	TestNotNull(TEXT("Snapshot exportable"), Snapshot);
	
	if (Snapshot.IsValid())
	{
		TestTrue(TEXT("Snapshot has artifacts"), Snapshot->HasField(TEXT("artifacts")));
		TestTrue(TEXT("Snapshot has transitions"), Snapshot->HasField(TEXT("transitions")));
		TestTrue(TEXT("Snapshot has frames"), Snapshot->HasField(TEXT("frames")));
	}
	
	return true;
}

// ============================================================================
// Conformance Tests (mirror browser conformance profile)
// ============================================================================

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FGovernedEngineConformanceProvenanceRecorder, "GovernedEngine.Conformance.ProvenanceRecorderExists",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGovernedEngineConformanceProvenanceRecorder::RunTest(const FString& Parameters)
{
	// Clear and test recorder
	FFrameProvenance Frame;
	Frame.IntentId = TEXT("test");
	Frame.TimelineId = TEXT("test");
	Frame.WorldId = TEXT("test");
	Frame.TimeSeconds = 0.0;
	Frame.Parameters.Add(TEXT("speed"), 1.0);
	
	// Should have static methods
	FProvenanceRecorder::Record(Frame);
	TArray<FFrameProvenance> Frames = FProvenanceRecorder::GetFrames();
	TestTrue(TEXT("Recorder has frames"), Frames.Num() > 0);
	FProvenanceRecorder::Clear();
	
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FGovernedEngineConformanceReplayDeterministic, "GovernedEngine.Conformance.ReplayDeterministic",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGovernedEngineConformanceReplayDeterministic::RunTest(const FString& Parameters)
{
	TArray<FFrameProvenance> Frames;
	Frames.Add(FFrameProvenance{ .Parameters = { { TEXT("speed"), 1.5 } } });
	Frames.Add(FFrameProvenance{ .Parameters = { { TEXT("speed"), 2.5 } } });
	
	TArray<double> Captured;
	FReplayCaptureTarget Target;
	Target.OnSpeed = [&](double V) { Captured.Add(V); };
	
	FReplayService::Replay(Frames, Target);
	
	TestEqual(TEXT("Replay captures correct count"), Captured.Num(), 2);
	TestTrue(TEXT("First speed matches"), FMath::Abs(Captured[0] - 1.5) < 0.001);
	TestTrue(TEXT("Second speed matches"), FMath::Abs(Captured[1] - 2.5) < 0.001);
	
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FGovernedEngineConformanceTimelineWorldRequired, "GovernedEngine.Conformance.TimelineWorldRequired",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGovernedEngineConformanceTimelineWorldRequired::RunTest(const FString& Parameters)
{
	FGovernanceKernel& Kernel = FGovernanceKernel::Get();
	
	FIntentRecord Intent;
	Intent.Id = TEXT("conformance-test");
	Intent.Type = TEXT("play_timeline");
	Intent.Kind = TEXT("play_timeline");
	Intent.Actor = TEXT("runtime.unreal");
	Intent.World = TEXT(""); // Missing world
	Intent.TimelineId = TEXT("test-timeline");

	FEvidenceBundle Evidence = FEvidenceBundle::Empty();
	Evidence.bEmpty = false;

	FDecision Decision = Kernel.EvaluateIntent(Intent, Evidence);
	
	TestFalse(TEXT("CKL denies play_timeline without world"), Decision.bAllowed);
	
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FGovernedEngineConformanceCKLPolicyLoad, "GovernedEngine.Conformance.CKLPolicyLoad",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGovernedEngineConformanceCKLPolicyLoad::RunTest(const FString& Parameters)
{
	FGovernanceKernel& Kernel = FGovernanceKernel::Get();
	
	// Should have loaded default policies (at least 5 base + Amendment VII/VIII)
	FPolicySet Set = Kernel.GetCKL().GetPoliciesForWorld(TEXT("test-world"));
	TestTrue(TEXT("CKL has >= 12 policies (base + VII + VIII)"), Set.Policies.Num() >= 12);
	
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FGovernedEngineConformanceCSRGovernanceTrace, "GovernedEngine.Conformance.CSRGovernanceTrace",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGovernedEngineConformanceCSRGovernanceTrace::RunTest(const FString& Parameters)
{
	FGovernanceKernel& Kernel = FGovernanceKernel::Get();
	
	FIntentRecord Intent;
	Intent.Id = TEXT("csr-test");
	Intent.Type = TEXT("play_timeline");
	Intent.Kind = TEXT("play_timeline");
	Intent.Actor = TEXT("runtime.unreal");
	Intent.World = TEXT("world-test");
	Intent.TimelineId = TEXT("test-timeline");

	FEvidenceBundle Evidence = FEvidenceBundle::Empty();
	Evidence.bEmpty = false;

	FDecision Decision = Kernel.EvaluateIntent(Intent, Evidence);
	
	TestTrue(TEXT("Decision allows with provenance"), Decision.bAllowed);
	TestTrue(TEXT("AttachProvenance is true"), Decision.AttachProvenance);
	
	return true;
}

#endif // WITH_EDITOR