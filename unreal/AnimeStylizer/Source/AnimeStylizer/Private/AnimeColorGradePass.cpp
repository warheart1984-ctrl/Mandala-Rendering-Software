// Copyright 2026 MRS. All Rights Reserved.
// Status: skeleton

#include "AnimeColorGradePass.h"
#include "AnimeStylizerModule.h"

void FAnimeColorGradePass::Register()
{
    UE_LOG(LogAnimeStylizer, Log, TEXT("AnimeColorGradePass registered (skeleton — RDG not wired)"));
}

void FAnimeColorGradePass::Unregister()
{
    UE_LOG(LogAnimeStylizer, Log, TEXT("AnimeColorGradePass unregistered"));
}

void FAnimeColorGradePass::AddPassStub(const FAnimeStylizerConfig& Config)
{
    UE_LOG(LogAnimeStylizer, Warning,
        TEXT("AnimeColorGradePass::AddPassStub — sat=%.2f contrast=%.2f gamma=%.2f"),
        Config.Saturation, Config.Contrast, Config.Gamma);
}
