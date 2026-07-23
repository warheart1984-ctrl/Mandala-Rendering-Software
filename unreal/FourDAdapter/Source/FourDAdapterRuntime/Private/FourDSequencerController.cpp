#include "FourDSequencerController.h"
#include "FourDBlueprintLibrary.h"

void UFourDSequencerController::Apply4DState(
	UObject* WorldContextObject,
	float WMin,
	float WMax,
	bool bGhostingEnabled,
	int32 GhostNeighborCount,
	float GhostOpacity,
	int32 WDepthMode)
{
	// Skeleton — Blueprint library Set* are themselves stubs (no material/compute evidence).
	UFourDBlueprintLibrary::SetWSlice(WorldContextObject, WMin, WMax);
	UFourDBlueprintLibrary::SetGhosting(WorldContextObject, bGhostingEnabled, GhostNeighborCount, GhostOpacity);
	UFourDBlueprintLibrary::SetWDepthMode(WorldContextObject, WDepthMode);
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: Apply4DState forwarded to Blueprint stubs (no Sequencer live preview)"));
}
