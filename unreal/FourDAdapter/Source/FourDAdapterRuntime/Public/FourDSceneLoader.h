#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "FourDScene3DTypes.h"
#include "FourDSceneLoader.generated.h"

class UStaticMesh;
class UMaterialInstance;

/**
 * Loads PLP scene3D and prepares Unreal Actors / meshes / materials.
 * Does not compute 4D — consumes projected artifacts only.
 * Skeleton: methods return failure / nullptr until implemented against UE.
 */
UCLASS(BlueprintType)
class FOURDADAPTERRUNTIME_API UFourDSceneLoader : public UObject
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	bool LoadSceneFromFile(const FString& ScenePath, FScene3D& OutScene);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	AActor* SpawnNodeActor(const FScene3DNode& Node, UWorld* World);

	UStaticMesh* CreateStaticMesh(const FScene3DMesh& Mesh);
	UMaterialInstance* CreateMaterialInstance(const FScene3DMaterial& Mat);
};
