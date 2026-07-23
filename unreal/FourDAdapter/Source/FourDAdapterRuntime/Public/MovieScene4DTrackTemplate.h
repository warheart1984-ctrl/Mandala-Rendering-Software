#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "MovieScene4DTrackTemplate.generated.h"

/**
 * Declared evaluation template: scrub → Evaluate → UFourDSequencerController::Apply4DState.
 * Skeleton — not a real FMovieSceneEvalTemplate until MovieScene is linked.
 * Live preview architecture is declared/roadmap — no UE evidence.
 */
USTRUCT()
struct FOURDADAPTERRUNTIME_API FMovieScene4DTrackTemplate
{
	GENERATED_BODY()

	float WMin = 0.f;
	float WMax = 1.f;
	bool bGhostingEnabled = false;
	int32 GhostNeighborCount = 1;
	float GhostOpacity = 0.35f;
	int32 WDepthMode = 0;

	/** Declared Evaluate — skeleton no-op. */
	void Evaluate(UObject* WorldContextObject) const;
};
