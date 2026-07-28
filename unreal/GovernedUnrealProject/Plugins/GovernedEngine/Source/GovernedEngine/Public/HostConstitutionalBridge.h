#pragma once

#include "CoreMinimal.h"

/**
 * HostConstitutionalBridge — thin Unreal stub for MultiHost constitutional routing.
 * STATUS: **skeleton** product host. Authoritative SoT is
 * engine/runtime/hosts/HostConstitutionalRouter.js (node:test **enforced**).
 * PIE / MRQ CI is NOT claimed.
 */
struct GOVERNEDENGINE_API FHostConstitutionalBridge
{
	static constexpr const TCHAR* GpuPrint = TEXT("gpu.print");
	static constexpr const TCHAR* SetDeterminismRequired = TEXT("setDeterminismRequired");
	static constexpr const TCHAR* InjectEvidence = TEXT("injectEvidence");
	static constexpr const TCHAR* RenderAssist = TEXT("renderAssist");

	/** Soft local UX check only — not a substitute for JS SoT. */
	static bool SoftRouteDenyGpuPrint(const FString& Action)
	{
		return Action.Equals(GpuPrint) || Action.Equals(TEXT("print.gpu"));
	}

	static bool SoftRouteDenySecretEvidence(const TMap<FString, FString>& Evidence)
	{
		return Evidence.Contains(TEXT("apiKey")) || Evidence.Contains(TEXT("api_key"));
	}
};
