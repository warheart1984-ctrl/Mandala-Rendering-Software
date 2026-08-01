// Copyright 2026 MRS. All Rights Reserved.
// Status: skeleton — palette LUT + sat/contrast/gamma.
// Algorithm sketch: Shaders/AnimeColorGrade.usf

#pragma once

#include "CoreMinimal.h"
#include "AnimeStylizerTypes.h"

class FAnimeColorGradePass
{
public:
    static void Register();
    static void Unregister();
    static void AddPassStub(const FAnimeStylizerConfig& Config);
};
