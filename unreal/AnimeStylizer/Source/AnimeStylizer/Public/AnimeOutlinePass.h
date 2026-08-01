// Copyright 2026 MRS. All Rights Reserved.
// Status: skeleton — API shell for 8-neighbor Sobel depth+normal outline.
// Algorithm sketch: Shaders/AnimeOutline.usf

#pragma once

#include "CoreMinimal.h"
#include "AnimeStylizerTypes.h"

/**
 * Outline pass (declared design).
 * TODO(partial): wire global shader + FRDGBuilder inside a UE project with Renderer deps.
 *
 * Intended signature (when RDG lands):
 *   AddPass(FRDGBuilder&, const FSceneTextures&, const FViewInfo&, const FAnimeStylizerConfig&)
 */
class FAnimeOutlinePass
{
public:
    static void Register();
    static void Unregister();

    /** skeleton: no-op until RDG wiring. */
    static void AddPassStub(const FAnimeStylizerConfig& Config);
};
