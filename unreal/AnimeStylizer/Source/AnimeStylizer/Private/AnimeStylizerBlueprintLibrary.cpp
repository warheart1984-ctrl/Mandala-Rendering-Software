// Copyright 2026 MRS. All Rights Reserved.
// Status: partial — CreatePaletteLUT / LoadStructurePlate / SavePNG implemented;
// ApplyAnimeStylization stores config only (RDG chain TODO / skeleton).

#include "AnimeStylizerBlueprintLibrary.h"
#include "AnimeStylizerModule.h"
#include "Engine/TextureRenderTarget2D.h"
#include "Engine/Texture2D.h"
#include "Components/SceneCaptureComponent2D.h"
#include "IImageWrapper.h"
#include "IImageWrapperModule.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Modules/ModuleManager.h"
#include "TextureResource.h"

UTextureRenderTarget2D* UAnimeStylizerBlueprintLibrary::ApplyAnimeStylization(
    UObject* WorldContextObject,
    UTextureRenderTarget2D* SourceRT,
    const FAnimeStylizerConfig& Config
)
{
    (void)WorldContextObject;

    if (!SourceRT)
    {
        UE_LOG(LogAnimeStylizer, Warning, TEXT("ApplyAnimeStylization: SourceRT is null"));
        return nullptr;
    }

    if (FAnimeStylizerModule::IsAvailable())
    {
        FAnimeStylizerModule::Get().Config = Config;
    }

    // skeleton: full outline→cel→LUT→grade→TAA RDG chain not wired.
    // Operator path until then: Post Process Material from Content/Materials/AnimeStylizerMaterialNodes.txt
    UE_LOG(LogAnimeStylizer, Log,
        TEXT("ApplyAnimeStylization: config stored (skeleton). Use PP material path or complete RDG wiring."));

    return SourceRT;
}

UTextureRenderTarget2D* UAnimeStylizerBlueprintLibrary::CaptureSceneAnimeStylized(
    UObject* WorldContextObject,
    USceneCaptureComponent2D* CaptureComponent,
    const FAnimeStylizerConfig& Config
)
{
    if (!CaptureComponent)
    {
        UE_LOG(LogAnimeStylizer, Warning, TEXT("CaptureSceneAnimeStylized: CaptureComponent is null"));
        return nullptr;
    }

    if (!CaptureComponent->TextureTarget)
    {
        UE_LOG(LogAnimeStylizer, Warning, TEXT("CaptureSceneAnimeStylized: no TextureTarget"));
        return nullptr;
    }

    CaptureComponent->CaptureScene();
    return ApplyAnimeStylization(WorldContextObject, CaptureComponent->TextureTarget, Config);
}

UTexture2D* UAnimeStylizerBlueprintLibrary::CreatePaletteLUT(const TArray<FLinearColor>& Colors)
{
    if (Colors.Num() < 2)
    {
        UE_LOG(LogAnimeStylizer, Warning, TEXT("CreatePaletteLUT: need at least 2 color stops"));
        return nullptr;
    }

    const int32 LUTSize = 256;
    UTexture2D* LUTTexture = UTexture2D::CreateTransient(LUTSize, 1, PF_B8G8R8A8);
    if (!LUTTexture || !LUTTexture->GetPlatformData() || LUTTexture->GetPlatformData()->Mips.Num() == 0)
    {
        return nullptr;
    }

    TArray<FColor> PixelData;
    PixelData.SetNumUninitialized(LUTSize);

    for (int32 i = 0; i < LUTSize; ++i)
    {
        const float t = float(i) / float(LUTSize - 1);
        const float Segment = t * float(Colors.Num() - 1);
        int32 Index = FMath::FloorToInt(Segment);
        const float Alpha = Segment - float(Index);
        Index = FMath::Clamp(Index, 0, Colors.Num() - 2);
        const FLinearColor Color = FMath::Lerp(Colors[Index], Colors[Index + 1], Alpha);
        PixelData[i] = Color.ToFColor(false);
    }

    FTexture2DMipMap& Mip = LUTTexture->GetPlatformData()->Mips[0];
    void* Data = Mip.BulkData.Lock(LOCK_READ_WRITE);
    FMemory::Memcpy(Data, PixelData.GetData(), PixelData.Num() * sizeof(FColor));
    Mip.BulkData.Unlock();

    LUTTexture->SRGB = false;
    LUTTexture->CompressionSettings = TC_VectorDisplacementmap;
    LUTTexture->Filter = TF_Linear;
    LUTTexture->MipGenSettings = TMGS_NoMipmaps;
    LUTTexture->UpdateResource();

    UE_LOG(LogAnimeStylizer, Log, TEXT("CreatePaletteLUT: %d stops → 256x1"), Colors.Num());
    return LUTTexture;
}

UTexture2D* UAnimeStylizerBlueprintLibrary::LoadStructurePlate(const FString& FilePath)
{
    if (!FPaths::FileExists(FilePath))
    {
        UE_LOG(LogAnimeStylizer, Warning, TEXT("LoadStructurePlate: not found: %s"), *FilePath);
        return nullptr;
    }

    TArray<uint8> FileData;
    if (!FFileHelper::LoadFileToArray(FileData, *FilePath))
    {
        UE_LOG(LogAnimeStylizer, Warning, TEXT("LoadStructurePlate: failed to read %s"), *FilePath);
        return nullptr;
    }

    IImageWrapperModule& ImageWrapperModule = FModuleManager::LoadModuleChecked<IImageWrapperModule>(TEXT("ImageWrapper"));
    TSharedPtr<IImageWrapper> ImageWrapper = ImageWrapperModule.CreateImageWrapper(EImageFormat::PNG);
    if (!ImageWrapper.IsValid() || !ImageWrapper->SetCompressed(FileData.GetData(), FileData.Num()))
    {
        UE_LOG(LogAnimeStylizer, Warning, TEXT("LoadStructurePlate: PNG decode failed"));
        return nullptr;
    }

    TArray64<uint8> RawData;
    if (!ImageWrapper->GetRaw(ERGBFormat::BGRA, 8, RawData))
    {
        return nullptr;
    }

    UTexture2D* Texture = UTexture2D::CreateTransient(ImageWrapper->GetWidth(), ImageWrapper->GetHeight(), PF_B8G8R8A8);
    if (!Texture || !Texture->GetPlatformData() || Texture->GetPlatformData()->Mips.Num() == 0)
    {
        return nullptr;
    }

    void* TextureData = Texture->GetPlatformData()->Mips[0].BulkData.Lock(LOCK_READ_WRITE);
    FMemory::Memcpy(TextureData, RawData.GetData(), static_cast<SIZE_T>(RawData.Num()));
    Texture->GetPlatformData()->Mips[0].BulkData.Unlock();
    Texture->UpdateResource();

    UE_LOG(LogAnimeStylizer, Log, TEXT("LoadStructurePlate: %s (%dx%d)"),
        *FilePath, Texture->GetSizeX(), Texture->GetSizeY());
    return Texture;
}

bool UAnimeStylizerBlueprintLibrary::SaveRenderTargetToPNG(UTextureRenderTarget2D* RenderTarget, const FString& FilePath)
{
    if (!RenderTarget)
    {
        return false;
    }

    FTextureRenderTargetResource* Resource = RenderTarget->GameThread_GetRenderTargetResource();
    if (!Resource)
    {
        return false;
    }

    TArray<FColor> Bitmap;
    if (!Resource->ReadPixels(Bitmap))
    {
        return false;
    }

    const FIntPoint Size(RenderTarget->SizeX, RenderTarget->SizeY);
    IImageWrapperModule& ImageWrapperModule = FModuleManager::LoadModuleChecked<IImageWrapperModule>(TEXT("ImageWrapper"));
    TSharedPtr<IImageWrapper> ImageWrapper = ImageWrapperModule.CreateImageWrapper(EImageFormat::PNG);
    if (!ImageWrapper.IsValid())
    {
        return false;
    }

    ImageWrapper->SetRaw(Bitmap.GetData(), Bitmap.Num() * sizeof(FColor), Size.X, Size.Y, ERGBFormat::BGRA, 8);
    const TArray64<uint8>& PNGData = ImageWrapper->GetCompressed(100);
    if (PNGData.Num() == 0)
    {
        return false;
    }

    return FFileHelper::SaveArrayToFile(PNGData, *FilePath);
}

FAnimeStylizerConfig UAnimeStylizerBlueprintLibrary::GetDefaultAnimeConfig()
{
    return FAnimeStylizerConfig{};
}

void UAnimeStylizerBlueprintLibrary::SetAnimeStylizationEnabled(bool bEnabled)
{
    if (FAnimeStylizerModule::IsAvailable())
    {
        FAnimeStylizerModule::Get().SetEnabled(bEnabled);
    }
}

bool UAnimeStylizerBlueprintLibrary::IsAnimeStylizationEnabled()
{
    return FAnimeStylizerModule::IsAvailable() && FAnimeStylizerModule::Get().IsEnabled();
}
