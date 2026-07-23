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
