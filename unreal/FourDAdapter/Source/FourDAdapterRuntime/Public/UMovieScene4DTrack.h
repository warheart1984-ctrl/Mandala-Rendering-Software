#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "UMovieScene4DTrack.generated.h"

class UMovieScene4DSection;

/**
 * Declared Sequencer track for 4D observation channels.
 * Skeleton: UObject base until MovieScene deps enabled; then retarget to UMovieSceneNameableTrack.
 * CreateNewSection / SupportsType declared; evaluation roadmap.
 */
UCLASS(BlueprintType)
class FOURDADAPTERRUNTIME_API UMovieScene4DTrack : public UObject
{
	GENERATED_BODY()

public:
	/** Declared: create UMovieScene4DSection — skeleton returns nullptr. */
	UFUNCTION(BlueprintCallable, Category = "4D Adapter|Sequencer")
	UMovieScene4DSection* CreateNewSection();

	/** Declared: true only for UMovieScene4DSection. */
	UFUNCTION(BlueprintCallable, Category = "4D Adapter|Sequencer")
	bool SupportsType(UClass* SectionClass) const;

	UPROPERTY()
	TArray<TObjectPtr<UMovieScene4DSection>> Sections;
};
