#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "IntentRecord.h"
#include "Decision.h"
#include "GovernedMovieCaptureMRQ.generated.h"

class UMoviePipeline;
class UMoviePipelineExecutorBase;

/**
 * MRQ-based movie pipeline for Unreal Engine.
 * Uses Movie Render Queue for high-quality output (ProRes, EXR, etc.).
 * Status: optional — requires MovieRenderPipeline plugins enabled.
 * When available, preferred over viewport PNG capture for cinematic quality.
 */
UCLASS(ClassGroup = (Custom), meta = (BlueprintSpawnableComponent))
class GOVERNEDENGINE_API UGovernedMovieCaptureMRQComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UGovernedMovieCaptureMRQComponent();

	/** Total duration to record in seconds. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Governed|Movie|MRQ")
	float DefaultSeconds = 8.f;

	/** Frame rate for output. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Governed|Movie|MRQ")
	int32 DefaultFps = 30;

	/** Base name for output files. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Governed|Movie|MRQ")
	FString Basename = TEXT("4dce-movie-mrq");

	/** Output format: "proRes", "exr", "png", "jpg". */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Governed|Movie|MRQ")
	FString OutputFormat = TEXT("proRes");

	/** ProRes codec profile when using proRes format. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Governed|Movie|MRQ", meta = (EditCondition = "OutputFormat == \"proRes\""))
	FString ProResProfile = TEXT("4444");

	/** Whether to burn in frame numbers/timecode. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Governed|Movie|MRQ")
	bool bBurnInMetadata = true;

	/** Current recording state. */
	UPROPERTY(BlueprintReadOnly, Category = "Governed|Movie|MRQ")
	bool bIsRecording = false;

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	/** Start governed movie capture via MRQ. Returns true if pipeline started. */
	bool StartGovernedRecord(const FIntentRecord& Intent, const FDecision& Decision, const FEvidenceBundle& Evidence);

	/** Static lookup for component in current play world. */
	static UGovernedMovieCaptureMRQComponent* FindInWorld(UWorld* World);

	/** Check if MRQ is available (plugins loaded). */
	static bool IsMRQAvailable();

private:
	/** Active pipeline instance. */
	UPROPERTY()
	TObjectPtr<UMoviePipeline> ActivePipeline;

	/** Executor handle for monitoring. */
	UPROPERTY()
	TObjectPtr<UMoviePipelineExecutorBase> ActiveExecutor;

	/** Delegate for pipeline completion. */
	FDelegateHandle OnPipelineFinishedHandle;

	FIntentRecord ActiveIntent;
	FDecision ActiveDecision;
	FString OutputDir;
	FString SessionName;
	int32 ActiveFps = 30;

	void OnPipelineFinished(bool bSuccess);
	void WriteManifestAndProvenance(bool bSuccess);
	void BuildPipeline(const FIntentRecord& Intent, const FDecision& Decision, const FEvidenceBundle& Evidence);
};

class GOVERNEDENGINE_API FGovernedMovieCaptureMRQ
{
public:
	/** Try to start MRQ capture. Returns false if MRQ unavailable. */
	static bool TryStart(const FIntentRecord& Intent, const FDecision& Decision, const FEvidenceBundle& Evidence);
};