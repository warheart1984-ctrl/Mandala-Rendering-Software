#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "UFourDLiveLinkClient.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FFourDOnProjectionResponse, const FString&, Status, const FString&, PayloadJson);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FFourDOnProjectionError, const FString&, Message);

/**
 * Declared WS/TCP client for ProjectionRequest → ProjectionResponse (scene3D + lineageBundle).
 * Skeleton — does not open sockets. Unreal does not compute 4D.
 * See docs/4d-engine/v1/adapters/UNREAL_LIVE_PROJECTION.md
 */
UCLASS(BlueprintType)
class FOURDADAPTERRUNTIME_API UFourDLiveLinkClient : public UObject
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Adapter")
	FString EndpointUrl;

	UPROPERTY(BlueprintAssignable, Category = "4D Adapter")
	FFourDOnProjectionResponse OnProjectionResponse;

	UPROPERTY(BlueprintAssignable, Category = "4D Adapter")
	FFourDOnProjectionError OnProjectionError;

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	bool Connect(const FString& Url);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	void Disconnect();

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	bool IsConnected() const;

	/**
	 * Declared ProjectionRequest: { type, worldId, observationModeId, time, params }.
	 * Skeleton returns false without sending.
	 */
	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	bool SendProjectionRequest(const FString& WorldId, const FString& ObservationModeId, float Time);
};
