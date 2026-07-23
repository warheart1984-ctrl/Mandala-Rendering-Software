#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "FourDLineageEntry.h"
#include "FourDBlueprintLibrary.generated.h"

/**
 * Blueprint surface for W-slice / ghosting / lineage queries.
 * Skeleton — Set* helpers are stubs (NotImplemented).
 */
UCLASS()
class FOURDADAPTERRUNTIME_API UFourDBlueprintLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	static bool GetLineageForActor(AActor* Actor, FFourDLineageEntry& OutEntry);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter", meta = (WorldContext = "WorldContextObject"))
	static void SetWSlice(UObject* WorldContextObject, float WMin, float WMax);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter", meta = (WorldContext = "WorldContextObject"))
	static void SetGhosting(UObject* WorldContextObject, bool bEnabled, int32 NeighborCount, float OpacityFalloff);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter", meta = (WorldContext = "WorldContextObject"))
	static void SetWDepthMode(UObject* WorldContextObject, int32 Mode);
};
