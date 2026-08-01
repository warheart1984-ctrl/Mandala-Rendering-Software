// Copyright 2026 MRS. All Rights Reserved.
// Status: skeleton

#include "AnimeCelShadingPass.h"
#include "AnimeStylizerModule.h"

void FAnimeCelShadingPass::Register()
{
    UE_LOG(LogAnimeStylizer, Log, TEXT("AnimeCelShadingPass registered (skeleton — RDG not wired)"));
}

void FAnimeCelShadingPass::Unregister()
{
    UE_LOG(LogAnimeStylizer, Log, TEXT("AnimeCelShadingPass unregistered"));
}

void FAnimeCelShadingPass::AddPassStub(const FAnimeStylizerConfig& Config)
{
    UE_LOG(LogAnimeStylizer, Warning,
        TEXT("AnimeCelShadingPass::AddPassStub — bands=%d (wire AnimeCelShading.usf for RDG)"),
        Config.CelBands);
}
