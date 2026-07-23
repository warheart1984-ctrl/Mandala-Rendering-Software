#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "UMovieScene4DSection.generated.h"

/**
 * Declared Sequencer section — channel UPROPERTYs for W / ghost / depth mode.
 * Skeleton: UObject until UMovieSceneSection base is linked.
 */
UCLASS(BlueprintType)
class FOURDADAPTERRUNTIME_API UMovieScene4DSection : public UObject
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter|Channels")
	float WMin = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter|Channels")
	float WMax = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter|Channels")
	float GhostOpacity = 0.35f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter|Channels")
	int32 GhostNeighborCount = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter|Channels")
	int32 WDepthMode = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter")
	FString ObservationModeId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter")
	float ObservationTime = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter")
	bool bRequestLiveReproject = false;
};
