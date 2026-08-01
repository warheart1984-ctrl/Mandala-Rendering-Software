// Copyright 2026 MRS. All Rights Reserved.
// Status: partial — Blueprint-exposed config struct; runtime gates not enforced.

#pragma once

#include "CoreMinimal.h"
#include "Engine/Texture.h"
#include "AnimeStylizerTypes.generated.h"

/**
 * Anime stylization configuration (zero diffusion / no API keys).
 * Structure plate blend hooks Engine3D/RT4D plates — see
 * docs/4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md
 */
USTRUCT(BlueprintType)
struct ANIMESTYLIZER_API FAnimeStylizerConfig
{
    GENERATED_BODY()

    // Outline (8-neighbor Sobel depth+normal) — shader algorithm: partial; RDG wire: skeleton
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Outline")
    float OutlineThickness = 1.5f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Outline")
    FLinearColor OutlineColor = FLinearColor(0.05f, 0.05f, 0.05f, 1.0f);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Outline", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float OutlineDepthThreshold = 0.05f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Outline", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float OutlineNormalThreshold = 0.3f;

    // Cel shading — 2–8 band toon + shadow tint + highlight
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Cel Shading", meta = (ClampMin = "2", ClampMax = "8"))
    int32 CelBands = 3;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Cel Shading", meta = (ClampMin = "0.0", ClampMax = "0.1"))
    float ShadowBias = 0.001f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Cel Shading")
    FLinearColor ShadowTint = FLinearColor(0.2f, 0.2f, 0.3f, 1.0f);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Cel Shading", meta = (ClampMin = "0.5", ClampMax = "2.0"))
    float HighlightIntensity = 1.2f;

    // Palette LUT 256×1 + color grade
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Color Grade")
    TObjectPtr<UTexture> PaletteLUT = nullptr;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Color Grade", meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float PaletteIntensity = 1.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Color Grade", meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float Saturation = 1.1f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Color Grade", meta = (ClampMin = "0.0", ClampMax = "2.0"))
    float Contrast = 1.15f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Color Grade", meta = (ClampMin = "0.1", ClampMax = "3.0"))
    float Gamma = 1.0f;

    // Temporal AA — velocity reproject + neighborhood clamp
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Temporal AA")
    bool bEnableTemporalAA = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Temporal AA", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float TAAJitterScale = 0.5f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Temporal AA", meta = (ClampMin = "1.0", ClampMax = "8.0"))
    float TAASampleCount = 4.0f;

    // Structure plate (Engine3D / RT4D overlay) — LoadStructurePlate hook
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Structure")
    bool bUseStructurePlate = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Structure")
    TObjectPtr<UTexture> StructurePlate = nullptr;

    /** 0 = pure structure plate, 1 = pure anime stylization. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Structure", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float StructureBlend = 0.3f;
};
