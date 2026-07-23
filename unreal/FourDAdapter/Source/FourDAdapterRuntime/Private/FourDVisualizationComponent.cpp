#include "FourDVisualizationComponent.h"
#include "FourDBlueprintLibrary.h"

UFourDVisualizationComponent::UFourDVisualizationComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UFourDVisualizationComponent::BeginPlay()
{
	Super::BeginPlay();
	// Skeleton — cache lineage from UFourDLineageRegistry when import populates it.
	CachedLineage.Reset();
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: Visualization BeginPlay lineage cache not implemented"));
}

void UFourDVisualizationComponent::SetWSlice(float InWMin, float InWMax)
{
	const float PrevMin = WMin;
	const float PrevMax = WMax;
	WMin = InWMin;
	WMax = InWMax;
	ApplyVisualization();
	OnWBandExited.Broadcast(PrevMin, PrevMax);
	OnWBandEntered.Broadcast(WMin, WMax);
}

void UFourDVisualizationComponent::SetGhosting(bool bEnabled, int32 NeighborCount, float Opacity)
{
	bGhostingEnabled = bEnabled;
	GhostNeighborCount = NeighborCount;
	GhostOpacity = Opacity;
	ApplyVisualization();
	OnGhostNeighborChanged.Broadcast(GhostNeighborCount, GhostOpacity);
}

void UFourDVisualizationComponent::SetWDepthMode(int32 Mode)
{
	WDepthMode = Mode;
	ApplyVisualization();
}

bool UFourDVisualizationComponent::GetLineage(AActor* Actor, FFourDLineageEntry& OutEntry) const
{
	return UFourDBlueprintLibrary::GetLineageForActor(Actor, OutEntry);
}

void UFourDVisualizationComponent::ApplyVisualization()
{
	// Skeleton — UFourDMaterialMapper / optional CS_WEncoding (roadmap) when UE host exists.
	UE_LOG(LogTemp, Warning,
		TEXT("FourDAdapter: ApplyVisualization not implemented (W=[%f,%f] mode=%d)"),
		WMin, WMax, WDepthMode);
}
