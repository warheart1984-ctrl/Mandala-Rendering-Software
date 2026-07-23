#include "FourDSceneLoader.h"
#include "Misc/AssertionMacros.h"

bool UFourDSceneLoader::LoadSceneFromFile(const FString& ScenePath, FScene3D& OutScene)
{
	// Skeleton — parse scene3D JSON/binary when PLP loader is wired.
	OutScene = FScene3D();
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: LoadSceneFromFile not implemented (%s)"), *ScenePath);
	return false;
}

AActor* UFourDSceneLoader::SpawnNodeActor(const FScene3DNode& Node, UWorld* World)
{
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: SpawnNodeActor not implemented (%s)"), *Node.Name);
	return nullptr;
}

UStaticMesh* UFourDSceneLoader::CreateStaticMesh(const FScene3DMesh& Mesh)
{
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: CreateStaticMesh not implemented (%s)"), *Mesh.Name);
	return nullptr;
}

UMaterialInstance* UFourDSceneLoader::CreateMaterialInstance(const FScene3DMaterial& Mat)
{
	UE_LOG(LogTemp, Warning, TEXT("FourDAdapter: CreateMaterialInstance not implemented (%s)"), *Mat.Name);
	return nullptr;
}
