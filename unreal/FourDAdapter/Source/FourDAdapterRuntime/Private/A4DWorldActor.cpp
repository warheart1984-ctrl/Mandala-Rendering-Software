#include "A4DWorldActor.h"
#include "FourDVisualizationComponent.h"
#include "UFourDLiveLinkClient.h"

A4DWorldActor::A4DWorldActor()
{
	PrimaryActorTick.bCanEverTick = false;
	Visualization = CreateDefaultSubobject<UFourDVisualizationComponent>(TEXT("FourDVisualization"));
	LiveLinkClient = CreateDefaultSubobject<UFourDLiveLinkClient>(TEXT("FourDLiveLink"));
}

bool A4DWorldActor::ReloadProjection()
{
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: A4DWorldActor::ReloadProjection not implemented (WorldId=%s)"), *WorldId);
	return false;
}
