#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "FourDMaterialMapper.generated.h"

class UMaterialInstance;

/**
 * Maps 4D / PLP visualization params onto Unreal material instances.
 * Skeleton — Apply* are no-ops until material assets and UE build exist.
 */
UCLASS(BlueprintType)
class FOURDADAPTERRUNTIME_API UFourDMaterialMapper : public UObject
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	void ApplyWEncoding(UMaterialInstance* MatInst, float WDepth);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	void ApplyGhosting(UMaterialInstance* MatInst, float GhostOpacity);
};
