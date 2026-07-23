#include "UMovieScene4DTrack.h"
#include "UMovieScene4DSection.h"

UMovieScene4DSection* UMovieScene4DTrack::CreateNewSection()
{
	// Skeleton — NewObject<UMovieScene4DSection> when MovieScene ownership rules are wired.
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: UMovieScene4DTrack::CreateNewSection not implemented"));
	return nullptr;
}

bool UMovieScene4DTrack::SupportsType(UClass* SectionClass) const
{
	return SectionClass != nullptr && SectionClass->IsChildOf(UMovieScene4DSection::StaticClass());
}
