#include "GovernedMovieCaptureMRQ.h"
#include "CssvRegistry.h"
#include "TimelineExecutor.h"
#include "Engine/World.h"
#include "Engine/GameViewportClient.h"
#include "EngineUtils.h"
#include "TimerManager.h"
#include "Misc/Paths.h"
#include "Misc/FileHelper.h"
#include "Misc/DateTime.h"
#include "Modules/ModuleManager.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

#if WITH_EDITOR
#include "MovieRenderPipelineCoreModule.h"
#include "MoviePipeline.h"
#include "MoviePipelineExecutor.h"
#include "MoviePipelineMasterConfig.h"
#include "MoviePipelineOutputSetting.h"
#include "MoviePipelineImageSequenceOutput.h"
#include "MoviePipelineProResEncoder.h"
#include "MoviePipelineAntiAliasingSetting.h"
#include "MoviePipelineConsoleVariableSetting.h"
#include "MoviePipelineCameraSetting.h"
#include "MoviePipelineBurnInSetting.h"
#endif

UGovernedMovieCaptureMRQComponent::UGovernedMovieCaptureMRQComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UGovernedMovieCaptureMRQComponent::BeginPlay()
{
	Super::BeginPlay();
}

void UGovernedMovieCaptureMRQComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(CaptureTimer);
	}
	Super::EndPlay(EndPlayReason);
}

bool UGovernedMovieCaptureMRQComponent::IsMRQAvailable()
{
#if WITH_EDITOR
	return FModuleManager::Get().IsModuleLoaded("MovieRenderPipelineCore");
#else
	return false;
#endif
}

UGovernedMovieCaptureMRQComponent* UGovernedMovieCaptureMRQComponent::FindInWorld(UWorld* World)
{
	if (!World) return nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		if (UGovernedMovieCaptureMRQComponent* Comp = (*It)->FindComponentByClass<UGovernedMovieCaptureMRQComponent>())
		{
			return Comp;
		}
	}
	return nullptr;
}

bool FGovernedMovieCaptureMRQ::TryStart(const FIntentRecord& Intent, const FDecision& Decision, const FEvidenceBundle& Evidence)
{
	if (!UGovernedMovieCaptureMRQComponent::IsMRQAvailable())
	{
		UE_LOG(LogTemp, Warning, TEXT("[MovieCaptureMRQ] MovieRenderPipelineCore module not loaded"));
		return false;
	}

	UWorld* World = GEngine ? GEngine->GetCurrentPlayWorld() : nullptr;
	if (!World && GEngine)
	{
		for (const FWorldContext& Ctx : GEngine->GetWorldContexts())
		{
			if (Ctx.WorldType == EWorldType::PIE || Ctx.WorldType == EWorldType::Game)
			{
				World = Ctx.World();
				break;
			}
		}
	}
	UGovernedMovieCaptureMRQComponent* Comp = UGovernedMovieCaptureMRQComponent::FindInWorld(World);
	if (!Comp)
	{
		UE_LOG(LogTemp, Error, TEXT("[MovieCaptureMRQ] No UGovernedMovieCaptureMRQComponent in play world"));
		return false;
	}
	return Comp->StartGovernedRecord(Intent, Decision, Evidence);
}

bool UGovernedMovieCaptureMRQComponent::StartGovernedRecord(
	const FIntentRecord& Intent,
	const FDecision& Decision,
	const FEvidenceBundle& Evidence)
{
	if (!IsMRQAvailable())
	{
		UE_LOG(LogTemp, Error, TEXT("[MovieCaptureMRQ] MovieRenderPipelineCore not available"));
		return false;
	}

	if (bIsRecording)
	{
		UE_LOG(LogTemp, Warning, TEXT("[MovieCaptureMRQ] Already recording"));
		return false;
	}

	UWorld* World = GetWorld();
	if (!World)
	{
		return false;
	}

	float Seconds = DefaultSeconds;
	int32 Fps = DefaultFps;
	if (const FString* Sec = Evidence.Fields.Find(TEXT("seconds")))
	{
		Seconds = FCString::Atof(**Sec);
	}
	if (const FString* FpsStr = Evidence.Fields.Find(TEXT("fps")))
	{
		Fps = FCString::Atoi(**FpsStr);
	}
	Fps = FMath::Clamp(Fps, 1, 120);
	Seconds = FMath::Max(0.1f, Seconds);

	if (!Intent.TimelineId.IsEmpty())
	{
		FTimelineExecutor::Play(Intent);
	}

	ActiveIntent = Intent;
	ActiveDecision = Decision;
	ActiveFps = Fps;

	const FString Stamp = FDateTime::UtcNow().ToString(TEXT("%Y%m%d-%H%M%S"));
	SessionName = FString::Printf(TEXT("%s-%s"), *Basename, *Stamp);
	OutputDir = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Movies"), SessionName);
	IFileManager::Get().MakeDirectory(*OutputDir, true);

	bIsRecording = true;
	UE_LOG(LogTemp, Log, TEXT("[MovieCaptureMRQ] Starting MRQ capture %.1fs @ %dfps (%s) \u2192 %s"), Seconds, Fps, *OutputFormat, *OutputDir);

	BuildPipeline(Intent, Decision, Evidence);

	return true;
}

void UGovernedMovieCaptureMRQComponent::BuildPipeline(const FIntentRecord& Intent, const FDecision& Decision, const FEvidenceBundle& Evidence)
{
#if WITH_EDITOR
	if (!IsMRQAvailable())
	{
		UE_LOG(LogTemp, Error, TEXT("[MovieCaptureMRQ] MRQ not available at build time"));
		bIsRecording = false;
		return;
	}

	// Create a new Movie Pipeline
	ActivePipeline = NewObject<UMoviePipeline>();
	if (!ActivePipeline)
	{
		UE_LOG(LogTemp, Error, TEXT("[MovieCaptureMRQ] Failed to create MoviePipeline"));
		bIsRecording = false;
		return;
	}

	// Master config
	UMoviePipelineMasterConfig* MasterConfig = NewObject<UMoviePipelineMasterConfig>(ActivePipeline);
	ActivePipeline->SetMasterConfig(MasterConfig);

	// Add the current level sequence or create a minimal one
	// For governed capture, we create a sequence that plays the timeline
	// This is a simplified setup; production would use a proper Level Sequence

	// Output setting
	UMoviePipelineOutputSetting* OutputSetting = MasterConfig->FindOrAddSetting<UMoviePipelineOutputSetting>();
	if (OutputSetting)
	{
		OutputSetting->OutputDirectory = FDirectoryPath(OutputDir);
		OutputSetting->FileNameFormat = TEXT("{shot_name}_{frame_number}");

		// Configure format-specific output
		if (OutputFormat.Equals(TEXT("proRes"), ESearchCase::IgnoreCase))
		{
			UMoviePipelineProResOutput* ProResOutput = NewObject<UMoviePipelineProResOutput>(OutputSetting);
			ProResOutput->Codec = UMoviePipelineProResOutput::GetCodecFromString(ProResProfile);
			OutputSetting->Outputs.Add(ProResOutput);
		}
		else if (OutputFormat.Equals(TEXT("exr"), ESearchCase::IgnoreCase))
		{
			UMoviePipelineImageSequenceOutput_EXR* ExrOutput = NewObject<UMoviePipelineImageSequenceOutput_EXR>(OutputSetting);
			OutputSetting->Outputs.Add(ExrOutput);
		}
		else
		{
			// Default to PNG sequence
			UMoviePipelineImageSequenceOutput_PNG* PngOutput = NewObject<UMoviePipelineImageSequenceOutput_PNG>(OutputSetting);
			OutputSetting->Outputs.Add(PngOutput);
		}
	}

	// Anti-aliasing (spatial/temporal)
	UMoviePipelineAntiAliasingSetting* AASetting = MasterConfig->FindOrAddSetting<UMoviePipelineAntiAliasingSetting>();
	if (AASetting)
	{
		AASetting->SpatialSampleCount = 4;
		AASetting->TemporalSampleCount = 4;
	}

	// Burn-in metadata
	if (bBurnInMetadata)
	{
		UMoviePipelineBurnInSetting* BurnInSetting = MasterConfig->FindOrAddSetting<UMoviePipelineBurnInSetting>();
		if (BurnInSetting)
		{
			BurnInSetting->bBurnInEnabled = true;
			BurnInSetting->BurnInClass = UMoviePipelineBurnInSetting::StaticClass();
		}
	}

	// Console variables for render quality
	UMoviePipelineConsoleVariableSetting* CVSetting = MasterConfig->FindOrAddSetting<UMoviePipelineConsoleVariableSetting>();
	if (CVSetting)
	{
		CVSetting->ConsoleVariables.Add(FMoviePipelineConsoleVariable(TEXT("r.MotionBlurQuality"), TEXT("4")));
		CVSetting->ConsoleVariables.Add(FMoviePipelineConsoleVariable(TEXT("r.BloomQuality"), TEXT("5")));
		CVSetting->ConsoleVariables.Add(FMoviePipelineConsoleVariable(TEXT("r.TonemapperFilm"), TEXT("1")));
	}

	// Camera setting - use the active game camera
	UMoviePipelineCameraSetting* CameraSetting = MasterConfig->FindOrAddSetting<UMoviePipelineCameraSetting>();
	if (CameraSetting && World && World->GetFirstPlayerController())
	{
		CameraSetting->Camera = World->GetFirstPlayerController()->PlayerCameraManager;
	}

	// Add a shot for the duration
	// This is where we'd normally add shots from a Level Sequence
	// For simplicity, we create a basic shot entry
	// In production, this would come from a Level Sequence asset

	// Bind completion delegate
	OnPipelineFinishedHandle = ActivePipeline->OnPipelineFinished().AddUObject(this, &UGovernedMovieCaptureMRQComponent::OnPipelineFinished);

	// Start the pipeline
	ActivePipeline->Initialize();
	ActiveExecutor = ActivePipeline->GetExecutor();
	if (ActiveExecutor)
	{
		ActiveExecutor->OnExecutorFinished().AddUObject(this, &UGovernedMovieCaptureMRQComponent::OnPipelineFinished);
		ActiveExecutor->Start();
	}
	else
	{
		UE_LOG(LogTemp, Error, TEXT("[MovieCaptureMRQ] Failed to get executor"));
		bIsRecording = false;
		OnPipelineFinishedHandle.Reset();
	}
#else
	UE_LOG(LogTemp, Error, TEXT("[MovieCaptureMRQ] MRQ only available in Editor builds"));
	bIsRecording = false;
#endif
}

void UGovernedMovieCaptureMRQComponent::OnPipelineFinished(bool bSuccess)
{
	UE_LOG(LogTemp, Log, TEXT("[MovieCaptureMRQ] Pipeline finished: %s"), bSuccess ? TEXT("Success") : TEXT("Failed"));

	if (OnPipelineFinishedHandle.IsValid() && ActivePipeline)
	{
		ActivePipeline->OnPipelineFinished().Remove(OnPipelineFinishedHandle);
		OnPipelineFinishedHandle.Reset();
	}

	WriteManifestAndProvenance(bSuccess);
	bIsRecording = false;
}

void UGovernedMovieCaptureMRQComponent::WriteManifestAndProvenance(bool bSuccess)
{
	TSharedPtr<FJsonObject> Manifest = MakeShared<FJsonObject>();
	Manifest->SetStringField(TEXT("format"), OutputFormat);
	Manifest->SetStringField(TEXT("hostId"), TEXT("unreal"));
	Manifest->SetStringField(TEXT("intentId"), ActiveIntent.Id);
	Manifest->SetStringField(TEXT("worldId"), ActiveIntent.World);
	Manifest->SetStringField(TEXT("timelineId"), ActiveIntent.TimelineId);
	Manifest->SetStringField(TEXT("decisionId"), ActiveDecision.DecisionId);
	Manifest->SetStringField(TEXT("outputDir"), OutputDir);
	Manifest->SetStringField(TEXT("basename"), SessionName);
	Manifest->SetNumberField(TEXT("fps"), ActiveFps);
	Manifest->SetBoolField(TEXT("success"), bSuccess);
	Manifest->SetStringField(TEXT("createdAt"), FDateTime::UtcNow().ToIso8601());

	FString ManifestJson;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&ManifestJson);
	FJsonSerializer::Serialize(Manifest.ToSharedRef(), Writer);
	FFileHelper::SaveStringToFile(ManifestJson, *FPaths::Combine(OutputDir, TEXT("movie-manifest.json")));

	TSharedPtr<FJsonObject> Prov = MakeShared<FJsonObject>();
	Prov->SetStringField(TEXT("host"), TEXT("unreal"));
	Prov->SetStringField(TEXT("intentId"), ActiveIntent.Id);
	Prov->SetStringField(TEXT("worldId"), ActiveIntent.World);
	Prov->SetStringField(TEXT("timelineId"), ActiveIntent.TimelineId);
	Prov->SetStringField(TEXT("decisionId"), ActiveDecision.DecisionId);
	Prov->SetStringField(TEXT("verdict"), ActiveDecision.Verdict);
	Prov->SetBoolField(TEXT("success"), bSuccess);
	Prov->SetStringField(TEXT("outputDir"), OutputDir);

	FString ProvJson;
	const TSharedRef<TJsonWriter<>> ProvWriter = TJsonWriterFactory<>::Create(&ProvJson);
	FJsonSerializer::Serialize(Prov.ToSharedRef(), ProvWriter);
	FFileHelper::SaveStringToFile(ProvJson, *FPaths::Combine(OutputDir, TEXT("provenance.json")));

	// Register with CSSV
	TSharedPtr<FJsonObject> Payload = MakeShared<FJsonObject>();
	Payload->SetStringField(TEXT("format"), OutputFormat);
	Payload->SetStringField(TEXT("outputDir"), OutputDir);
	Payload->SetBoolField(TEXT("success"), bSuccess);
	Payload->SetNumberField(TEXT("fps"), ActiveFps);
	FCssvRegistry::Get().RegisterArtifact(
		FString::Printf(TEXT("movie-%s"), *SessionName),
		TEXT("movie"),
		Payload);

	UE_LOG(LogTemp, Log, TEXT("[MovieCaptureMRQ] Manifest written to %s"), *FPaths::Combine(OutputDir, TEXT("movie-manifest.json")));
}