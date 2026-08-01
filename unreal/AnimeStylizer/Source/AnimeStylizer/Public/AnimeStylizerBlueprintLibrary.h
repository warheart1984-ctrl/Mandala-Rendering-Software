// Copyright 2026 MRS. All Rights Reserved.
// Status: partial — BP API surface declared; Apply/Capture RDG path is skeleton.

#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "Engine/TextureRenderTarget2D.h"
#include "Engine/Texture2D.h"
#include "Components/SceneCaptureComponent2D.h"
#include "AnimeStylizerTypes.h"
#include "AnimeStylizerBlueprintLibrary.generated.h"

UCLASS()
class ANIMESTYLIZER_API UAnimeStylizerBlueprintLibrary : public UBlueprintFunctionLibrary
{
    GENERATED_BODY()

public:
    /** Apply anime stylization to a render target. Status: skeleton (config stored; no full RDG chain). */
    UFUNCTION(BlueprintCallable, Category = "Anime Stylizer", meta = (WorldContext = "WorldContextObject"))
    static UTextureRenderTarget2D* ApplyAnimeStylization(
        UObject* WorldContextObject,
        UTextureRenderTarget2D* SourceRT,
        const FAnimeStylizerConfig& Config
    );

    /** Capture scene then apply stylization. Status: partial (captures; stylize pass skeleton). */
    UFUNCTION(BlueprintCallable, Category = "Anime Stylizer", meta = (WorldContext = "WorldContextObject"))
    static UTextureRenderTarget2D* CaptureSceneAnimeStylized(
        UObject* WorldContextObject,
        USceneCaptureComponent2D* CaptureComponent,
        const FAnimeStylizerConfig& Config
    );

    /** Create 256×1 palette LUT from color stops. Status: partial. */
    UFUNCTION(BlueprintCallable, Category = "Anime Stylizer")
    static UTexture2D* CreatePaletteLUT(const TArray<FLinearColor>& Colors);

    /**
     * Load structure plate PNG (Engine3D/RT4D plate).
     * Contract: docs/4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md
     * Status: partial.
     */
    UFUNCTION(BlueprintCallable, Category = "Anime Stylizer")
    static UTexture2D* LoadStructurePlate(const FString& FilePath);

    /** Save render target to PNG. Status: partial. */
    UFUNCTION(BlueprintCallable, Category = "Anime Stylizer")
    static bool SaveRenderTargetToPNG(UTextureRenderTarget2D* RenderTarget, const FString& FilePath);

    UFUNCTION(BlueprintPure, Category = "Anime Stylizer")
    static FAnimeStylizerConfig GetDefaultAnimeConfig();

    UFUNCTION(BlueprintCallable, Category = "Anime Stylizer")
    static void SetAnimeStylizationEnabled(bool bEnabled);

    UFUNCTION(BlueprintPure, Category = "Anime Stylizer")
    static bool IsAnimeStylizationEnabled();
};
