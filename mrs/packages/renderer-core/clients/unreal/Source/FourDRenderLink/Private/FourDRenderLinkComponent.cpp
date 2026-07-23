#include "FourDRenderLinkComponent.h"
#include "WebSocketsModule.h"
#include "JsonObjectConverter.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

UFourDRenderLinkComponent::UFourDRenderLinkComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickGroup = TG_DuringPhysics;
}

void UFourDRenderLinkComponent::BeginPlay()
{
    Super::BeginPlay();
    if (bAutoConnect) Connect();
}

void UFourDRenderLinkComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    Disconnect();
    Super::EndPlay(EndPlayReason);
}

void UFourDRenderLinkComponent::TickComponent(float DeltaTime, ELevelTick TickType,
    FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
}

void UFourDRenderLinkComponent::Connect()
{
    if (bConnected) return;

    if (!FModuleManager::Get().IsModuleLoaded("WebSockets"))
        FModuleManager::Get().LoadModule("WebSockets");

    WebSocket = FWebSocketsModule::Get().CreateWebSocket(ServerUrl);

    WebSocket->OnConnected().AddRaw(this, &UFourDRenderLinkComponent::OnConnected);
    WebSocket->OnConnectionError().AddRaw(this, &UFourDRenderLinkComponent::OnConnectionError);
    WebSocket->OnClosed().AddRaw(this, &UFourDRenderLinkComponent::OnClosed);
    WebSocket->OnMessage().AddRaw(this, &UFourDRenderLinkComponent::OnMessage);

    WebSocket->Connect();
    UE_LOG(LogTemp, Log, TEXT("[4DRL] Connecting to %s"), *ServerUrl);
}

void UFourDRenderLinkComponent::Disconnect()
{
    if (WebSocket && bConnected)
    {
        WebSocket->Close();
        WebSocket.Reset();
    }
    bConnected = false;
}

void UFourDRenderLinkComponent::OnConnected()
{
    bConnected = true;
    UE_LOG(LogTemp, Log, TEXT("[4DRL] Connected to server"));
}

void UFourDRenderLinkComponent::OnConnectionError(const FString& Error)
{
    UE_LOG(LogTemp, Warning, TEXT("[4DRL] Connection error: %s"), *Error);
    bConnected = false;
}

void UFourDRenderLinkComponent::OnClosed(int32 StatusCode, const FString& Reason, bool bWasClean)
{
    UE_LOG(LogTemp, Log, TEXT("[4DRL] Disconnected: %s"), *Reason);
    bConnected = false;
}

void UFourDRenderLinkComponent::OnMessage(const FString& Message)
{
    TSharedPtr<FJsonObject> Json;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Message);
    if (!FJsonSerializer::Deserialize(Reader, Json) || !Json.IsValid()) return;

    const FString Type = Json->GetStringField("type");

    if (Type == "mesh_update")
        HandleMeshUpdate(Message);
    else if (Type == "state_snapshot")
        HandleStateSnapshot(Message);
    else if (Type == "inspect_result")
    {
        int32 PrimId = Json->GetIntegerField("primitiveId");
        OnInspectResult.Broadcast(PrimId, Message);
    }
}

void UFourDRenderLinkComponent::HandleMeshUpdate(const FString& Json)
{
    TSharedPtr<FJsonObject> Obj;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);
    if (!FJsonSerializer::Deserialize(Reader, Obj) || !Obj.IsValid()) return;

    int32 VertexCount = Obj->GetIntegerField("vertexCount");
    int32 FaceCount = Obj->GetIntegerField("faceCount");
    int32 Frame = Obj->GetIntegerField("frame");

    FString PosBase64 = Obj->GetStringField("positions");
    FString IdxBase64 = Obj->GetStringField("indices");

    TArray<float> Positions;
    Positions.SetNum(VertexCount * 3);
    FBase64::Decode(PosBase64, (uint8*)Positions.GetData(), Positions.Num() * sizeof(float));

    TArray<int32> Indices;
    Indices.SetNum(FaceCount * 3);
    FBase64::Decode(IdxBase64, (uint8*)Indices.GetData(), Indices.Num() * sizeof(int32));

    UWorld* World = GetWorld();
    if (!World) return;

    FActorSpawnParameters SpawnParams;
    SpawnParams.Name = FName(*FString::Printf(TEXT("4D_Mesh_%d"), Frame));

    AActor* MeshActor = World->SpawnActor<AActor>(SpawnParams);
    if (!MeshActor) return;

    UStaticMeshComponent* MeshComp = NewObject<UStaticMeshComponent>(MeshActor);
    MeshComp->RegisterComponent();
    MeshActor->SetRootComponent(MeshComp);

    UStaticMesh* StaticMesh = NewObject<UStaticMesh>(MeshActor);
    if (!StaticMesh) return;

    TArray<FVector3f> Verts;
    Verts.SetNum(VertexCount);
    for (int32 i = 0; i < VertexCount; i++)
        Verts[i] = FVector3f(Positions[i * 3], Positions[i * 3 + 1], Positions[i * 3 + 2]);

    TArray<uint32> Tris;
    Tris.SetNum(FaceCount * 3);
    for (int32 i = 0; i < FaceCount * 3; i++)
        Tris[i] = (uint32)Indices[i];

    FRawMesh RawMesh;
    RawMesh.SetVertexPositions(Verts);
    RawMesh.WedgeIndices = TArray<uint32>(Tris);
    for (int32 i = 0; i < VertexCount; i++)
        RawMesh.WedgeColors.Add(FColor::White);

    TArray<FRawMesh> RawMeshes;
    RawMeshes.Add(RawMesh);

    FStaticMeshRenderData* RenderData = new FStaticMeshRenderData();
    StaticMesh->SetRenderData(RenderData);
    StaticMesh->BuildFromRawMeshes(RawMeshes, true);

    MeshComp->SetStaticMesh(StaticMesh);
    MeshActor->SetActorLabel(FString::Printf(TEXT("4D_Mesh_%d"), Frame));
    SpawnedMeshes.Add(MeshActor);

    OnMeshReceived.Broadcast(Json);
}

void UFourDRenderLinkComponent::HandleStateSnapshot(const FString& Json)
{
    TSharedPtr<FJsonObject> Obj;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);
    if (!FJsonSerializer::Deserialize(Reader, Obj) || !Obj.IsValid()) return;

    const TArray<TSharedPtr<FJsonValue>>* Entities;
    if (!Obj->TryGetArrayField("entities", Entities)) return;

    for (const auto& EntityVal : *Entities)
    {
        const auto Entity = EntityVal->AsObject();
        if (!Entity) continue;

        FString Id = Entity->GetStringField("id");
        TArray<TSharedPtr<FJsonValue>> Pos4 = Entity->GetArrayField("pos4");

        if (Pos4.Num() >= 3)
        {
            FVector Pos(
                Pos4[0]->AsNumber(),
                Pos4[1]->AsNumber(),
                Pos4[2]->AsNumber()
            );

            AActor* Existing = FindObject<AActor>(nullptr, *Id);
            if (Existing)
                Existing->SetActorLocation(Pos);
        }
    }

    OnStateSnapshot.Broadcast(Json);
}

void UFourDRenderLinkComponent::RequestInspect(float ScreenX, float ScreenY,
    float ViewportWidth, float ViewportHeight)
{
    if (!bConnected || !WebSocket) return;

    TSharedPtr<FJsonObject> Req = MakeShareable(new FJsonObject);
    Req->SetStringField("type", "inspect_screen");
    Req->SetNumberField("sx", ScreenX / ViewportWidth);
    Req->SetNumberField("sy", ScreenY / ViewportHeight);
    Req->SetNumberField("width", ViewportWidth);
    Req->SetNumberField("height", ViewportHeight);

    FString Payload;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Payload);
    FJsonSerializer::Serialize(Req.ToSharedRef(), Writer);

    WebSocket->Send(Payload);
}
