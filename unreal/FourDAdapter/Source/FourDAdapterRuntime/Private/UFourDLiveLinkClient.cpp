#include "UFourDLiveLinkClient.h"

bool UFourDLiveLinkClient::Connect(const FString& Url)
{
	EndpointUrl = Url;
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: LiveLink Connect not implemented (%s)"), *Url);
	return false;
}

void UFourDLiveLinkClient::Disconnect()
{
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: LiveLink Disconnect not implemented"));
}

bool UFourDLiveLinkClient::IsConnected() const
{
	return false;
}

bool UFourDLiveLinkClient::SendProjectionRequest(const FString& WorldId, const FString& ObservationModeId, float Time)
{
	UE_LOG(LogTemp, Warning,
		TEXT("FourDAdapter: SendProjectionRequest not implemented (world=%s mode=%s time=%f)"),
		*WorldId, *ObservationModeId, Time);
	return false;
}

bool UFourDLiveLinkClient::SendShadingData(const TArray<FShadingInput4D>& Inputs)
{
	if (!IsConnected())
	{
		UE_LOG(LogTemp, Verbose,
			TEXT("FourDAdapter: SendShadingData skipped (not connected; count=%d)"),
			Inputs.Num());
		return false;
	}
	if (Inputs.Num() <= 0)
	{
		return false;
	}

	// Skeleton binary append: size-prefixed blob prepared for a future framing path.
	// Does not open sockets or claim delivery.
	TArray<uint8> Blob;
	const int32 Stride = FourDRendererV2::ShadingInput4DStrideBytes;
	const int32 Count = Inputs.Num();
	Blob.Reserve(sizeof(int32) + Count * Stride);
	Blob.Append(reinterpret_cast<const uint8*>(&Count), sizeof(int32));
	for (const FShadingInput4D& In : Inputs)
	{
		const float Pos[4] = { In.Position4D.X, In.Position4D.Y, In.Position4D.Z, In.Position4D.W };
		const float Nrm[4] = { In.Normal4D.X, In.Normal4D.Y, In.Normal4D.Z, In.Normal4D.W };
		const float View[4] = { In.ViewDir4D.X, In.ViewDir4D.Y, In.ViewDir4D.Z, In.ViewDir4D.W };
		Blob.Append(reinterpret_cast<const uint8*>(Pos), sizeof(Pos));
		Blob.Append(reinterpret_cast<const uint8*>(Nrm), sizeof(Nrm));
		Blob.Append(reinterpret_cast<const uint8*>(View), sizeof(View));
		Blob.Append(reinterpret_cast<const uint8*>(&In.MaterialId), sizeof(uint32));
		Blob.Append(reinterpret_cast<const uint8*>(&In.ProjectionPolicyId), sizeof(uint32));
		(void)Stride;
	}

	UE_LOG(LogTemp, Warning,
		TEXT("FourDAdapter: SendShadingData skeleton built %d bytes but transport is not implemented"),
		Blob.Num());
	return false;
}
