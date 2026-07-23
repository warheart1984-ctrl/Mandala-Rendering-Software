#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "A4DWorldActor.generated.h"

class UFourDVisualizationComponent;
class UFourDLiveLinkClient;
class UScene3DAsset;
class ULineageBundleAsset;

/**
 * Root actor for one PLP projection session in a level.
 * Skeleton — does not load or spawn projected content yet.
 * Unreal does not compute 4D; consumes scene3D + lineageBundle only.
 */
UCLASS(BlueprintType)
class FOURDADAPTERRUNTIME_API A4DWorldActor : public AActor
{
	GENERATED_BODY()

public:
	A4DWorldActor();

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "4D Adapter")
	FString WorldId;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "4D Adapter")
	TSoftObjectPtr<UScene3DAsset> Scene3DAsset;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "4D Adapter")
	TSoftObjectPtr<ULineageBundleAsset> LineageBundleAsset;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "4D Adapter")
	TObjectPtr<UFourDVisualizationComponent> Visualization;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "4D Adapter")
	TObjectPtr<UFourDLiveLinkClient> LiveLinkClient;

	/** Declared: load assets / files and spawn projected actors. Skeleton returns false. */
	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	bool ReloadProjection();
};
