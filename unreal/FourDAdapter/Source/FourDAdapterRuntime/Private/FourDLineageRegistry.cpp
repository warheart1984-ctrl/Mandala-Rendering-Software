#include "FourDLineageRegistry.h"
#include "Engine/World.h"

UFourDLineageRegistry* UFourDLineageRegistry::Get(UWorld* World)
{
	// Skeleton — world-subsystem / game-instance ownership deferred.
	if (!World)
	{
		return nullptr;
	}
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: UFourDLineageRegistry::Get not implemented"));
	return nullptr;
}

void UFourDLineageRegistry::RegisterLineage(UObject* Object, const FFourDLineageEntry& Entry)
{
	if (!Object)
	{
		return;
	}
	Entries.Add(Object, Entry);
}

bool UFourDLineageRegistry::GetLineage(UObject* Object, FFourDLineageEntry& OutEntry) const
{
	if (!Object)
	{
		return false;
	}
	if (const FFourDLineageEntry* Found = Entries.Find(Object))
	{
		OutEntry = *Found;
		return true;
	}
	return false;
}

void UFourDLineageRegistry::QueryByWBand(float WMin, float WMax, TArray<UObject*>& OutObjects) const
{
	OutObjects.Reset();
	for (const TPair<TWeakObjectPtr<UObject>, FFourDLineageEntry>& Pair : Entries)
	{
		if (!Pair.Key.IsValid())
		{
			continue;
		}
		const FFourDLineageEntry& E = Pair.Value;
		if (E.WMax >= WMin && E.WMin <= WMax)
		{
			OutObjects.Add(Pair.Key.Get());
		}
	}
}
