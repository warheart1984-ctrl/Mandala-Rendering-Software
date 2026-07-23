#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "FourDSequencerController.generated.h"

/**
 * Bridge from Sequencer template evaluation to viz / Blueprint Set* helpers.
 * Skeleton — Apply4DState forwards to UFourDBlueprintLibrary stubs.
 */
UCLASS()
class FOURDADAPTERRUNTIME_API UFourDSequencerController : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "4D Adapter|Sequencer", meta = (WorldContext = "WorldContextObject"))
	static void Apply4DState(
		UObject* WorldContextObject,
		float WMin,
		float WMax,
		bool bGhostingEnabled,
		int32 GhostNeighborCount,
		float GhostOpacity,
		int32 WDepthMode);
};
