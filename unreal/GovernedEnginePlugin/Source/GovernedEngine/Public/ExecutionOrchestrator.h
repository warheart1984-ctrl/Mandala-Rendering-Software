#pragma once

#include "CoreMinimal.h"
#include "IntentRecord.h"
#include "Decision.h"
#include "EvidenceBundle.h"
#include "ExecutionOrchestrator.generated.h"

/**
 * Execution Orchestrator: evaluates CKL governance \u2192 runs timeline or movie capture.
 * Static namespace functions; no UObject overhead.
 */
class GOVERNEDENGINE_API FExecutionOrchestrator
{
public:
	/** Execute governed intent (timeline or movie). */
	static void Execute(const FIntentRecord& Intent);

	/** Execute governed movie capture with explicit duration/fps. */
	static void ExecuteMovie(const FIntentRecord& Intent, float Seconds, int32 Fps);
};