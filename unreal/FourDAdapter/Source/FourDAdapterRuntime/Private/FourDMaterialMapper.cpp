#include "FourDMaterialMapper.h"
#include "Materials/MaterialInstance.h"

void UFourDMaterialMapper::ApplyWEncoding(UMaterialInstance* MatInst, float WDepth)
{
	// Skeleton — set scalar WDepth on MI when M_FourDBase assets exist.
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: ApplyWEncoding not implemented (WDepth=%f)"), WDepth);
	(void)MatInst;
}

void UFourDMaterialMapper::ApplyGhosting(UMaterialInstance* MatInst, float GhostOpacity)
{
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: ApplyGhosting not implemented (GhostOpacity=%f)"), GhostOpacity);
	(void)MatInst;
}
