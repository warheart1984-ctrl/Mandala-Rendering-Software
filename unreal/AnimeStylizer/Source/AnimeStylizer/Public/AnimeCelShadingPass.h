// Copyright 2026 MRS. All Rights Reserved.
// Status: skeleton — 2–8 band toon + shadow tint + highlight.
// Algorithm sketch: Shaders/AnimeCelShading.usf

#pragma once

#include "CoreMinimal.h"
#include "AnimeStylizerTypes.h"

class FAnimeCelShadingPass
{
public:
    static void Register();
    static void Unregister();
    static void AddPassStub(const FAnimeStylizerConfig& Config);
};
