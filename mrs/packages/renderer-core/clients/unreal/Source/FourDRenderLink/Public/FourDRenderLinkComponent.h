#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "IWebSocket.h"
#include "FourDRenderLinkComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnMeshReceived, const FString&, MeshJson);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnStateSnapshot, const FString&, SnapshotJson);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnInspectResult, int32, PrimitiveId, const FString&, ResultJson);

UCLASS(ClassGroup = (Rendering), meta = (BlueprintSpawnableComponent))
class FOURDRENDERLINK_API UFourDRenderLinkComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UFourDRenderLinkComponent();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Render Link")
    FString ServerUrl = "ws://127.0.0.1:9487";

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Render Link")
    bool bAutoConnect = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "4D Render Link")
    bool bDrawDebugMeshes = true;

    UPROPERTY(BlueprintAssignable, Category = "4D Render Link")
    FOnMeshReceived OnMeshReceived;

    UPROPERTY(BlueprintAssignable, Category = "4D Render Link")
    FOnStateSnapshot OnStateSnapshot;

    UPROPERTY(BlueprintAssignable, Category = "4D Render Link")
    FOnInspectResult OnInspectResult;

    UFUNCTION(BlueprintCallable, Category = "4D Render Link")
    void Connect();

    UFUNCTION(BlueprintCallable, Category = "4D Render Link")
    void Disconnect();

    UFUNCTION(BlueprintCallable, Category = "4D Render Link")
    bool IsConnected() const { return bConnected; }

    UFUNCTION(BlueprintCallable, Category = "4D Render Link")
    void RequestInspect(float ScreenX, float ScreenY, float ViewportWidth, float ViewportHeight);

    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

protected:
    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
    TSharedPtr<IWebSocket> WebSocket;
    bool bConnected = false;
    TArray<AActor*> SpawnedMeshes;

    void OnConnected();
    void OnConnectionError(const FString& Error);
    void OnClosed(int32 StatusCode, const FString& Reason, bool bWasClean);
    void OnMessage(const FString& Message);
    void HandleMeshUpdate(const FString& Json);
    void HandleStateSnapshot(const FString& Json);
};
