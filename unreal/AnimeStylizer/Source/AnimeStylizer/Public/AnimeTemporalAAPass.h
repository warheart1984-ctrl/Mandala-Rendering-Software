// Copyright 2026 MRS. All Rights Reserved.
// Status: skeleton — velocity reproject + neighborhood clamp.
// Algorithm sketch: Shaders/AnimeTemporalAA.usf

#pragma once

#include "CoreMinimal.h"
#include "AnimeStylizerTypes.h"

class FAnimeTemporalAAPass
{
public:
    static void Register();
    static void Unregister();
    static void AddPassStub(const FAnimeStylizerConfig& Config);
};
