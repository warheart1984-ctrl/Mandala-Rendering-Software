#include "MovieScene4DTrackTemplate.h"
#include "FourDSequencerController.h"

void FMovieScene4DTrackTemplate::Evaluate(UObject* WorldContextObject) const
{
	// Declared path: → UFourDSequencerController::Apply4DState → materials / global slice.
	// Skeleton — no Sequencer live preview claimed.
	UFourDSequencerController::Apply4DState(
		WorldContextObject,
		WMin,
		WMax,
		bGhostingEnabled,
		GhostNeighborCount,
		GhostOpacity,
		WDepthMode);
}
