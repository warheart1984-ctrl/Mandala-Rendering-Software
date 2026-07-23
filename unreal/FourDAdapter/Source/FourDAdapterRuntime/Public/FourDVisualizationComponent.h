#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "FourDLineageEntry.h"
#include "FourDVisualizationComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FFourDOnWBandChanged, float, WMin, float, WMax);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FFourDOnGhostNeighborChanged, int32, NeighborCount, float, Opacity);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FFourDOnProjectionModeChanged, FString, ObservationModeId);

/**
 * W-slice / ghosting / W-depth visualization for a projected scene.
 * Skeleton — BeginPlay cache and Set* apply paths log only.
 * Declared events: OnWBandEntered/Exited, OnGhostNeighborChanged, OnProjectionModeChanged.
 */
UCLASS(ClassGroup = (FourD), meta = (BlueprintSpawnableComponent))
class FOURDADAPTERRUNTIME_API UFourDVisualizationComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UFourDVisualizationComponent();

	virtual void BeginPlay() override;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter")
	float WMin = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter")
	float WMax = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter")
	bool bGhostingEnabled = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter")
	int32 GhostNeighborCount = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter")
	float GhostOpacity = 0.35f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter")
	int32 WDepthMode = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter")
	FString ObservationModeId;

	UPROPERTY(BlueprintAssignable, Category = "4D Adapter")
	FFourDOnWBandChanged OnWBandEntered;

	UPROPERTY(BlueprintAssignable, Category = "4D Adapter")
	FFourDOnWBandChanged OnWBandExited;

	UPROPERTY(BlueprintAssignable, Category = "4D Adapter")
	FFourDOnGhostNeighborChanged OnGhostNeighborChanged;

	UPROPERTY(BlueprintAssignable, Category = "4D Adapter")
	FFourDOnProjectionModeChanged OnProjectionModeChanged;

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	void SetWSlice(float InWMin, float InWMax);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	void SetGhosting(bool bEnabled, int32 NeighborCount, float Opacity);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	void SetWDepthMode(int32 Mode);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	bool GetLineage(AActor* Actor, FFourDLineageEntry& OutEntry) const;

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	void ApplyVisualization();

protected:
	/** Cached lineage snapshot — filled in BeginPlay when registry is wired. */
	UPROPERTY(Transient)
	TArray<FFourDLineageEntry> CachedLineage;
};
