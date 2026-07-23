#include "FourDBlueprintLibrary.h"
#include "FourDLineageRegistry.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"

bool UFourDBlueprintLibrary::GetLineageForActor(AActor* Actor, FFourDLineageEntry& OutEntry)
{
	if (!Actor)
	{
		return false;
	}
	UFourDLineageRegistry* Registry = UFourDLineageRegistry::Get(Actor->GetWorld());
	if (!Registry)
	{
		return false;
	}
	return Registry->GetLineage(Actor, OutEntry);
}

void UFourDBlueprintLibrary::SetWSlice(UObject* WorldContextObject, float WMin, float WMax)
{
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: SetWSlice not implemented (%.3f–%.3f)"), WMin, WMax);
	(void)WorldContextObject;
}

void UFourDBlueprintLibrary::SetGhosting(UObject* WorldContextObject, bool bEnabled, int32 NeighborCount, float OpacityFalloff)
{
	UE_LOG(LogTemp, Warning,
		TEXT("FourDAdapter: SetGhosting not implemented (enabled=%d neighbors=%d falloff=%.3f)"),
		bEnabled ? 1 : 0, NeighborCount, OpacityFalloff);
	(void)WorldContextObject;
}

void UFourDBlueprintLibrary::SetWDepthMode(UObject* WorldContextObject, int32 Mode)
{
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: SetWDepthMode not implemented (mode=%d)"), Mode);
	(void)WorldContextObject;
}
