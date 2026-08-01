// Copyright 2026 MRS. All Rights Reserved.
// Status: skeleton

#include "AnimeOutlinePass.h"
#include "AnimeStylizerModule.h"

void FAnimeOutlinePass::Register()
{
    UE_LOG(LogAnimeStylizer, Log, TEXT("AnimeOutlinePass registered (skeleton — RDG not wired)"));
}

void FAnimeOutlinePass::Unregister()
{
    UE_LOG(LogAnimeStylizer, Log, TEXT("AnimeOutlinePass unregistered"));
}

void FAnimeOutlinePass::AddPassStub(const FAnimeStylizerConfig& Config)
{
    UE_LOG(LogAnimeStylizer, Warning,
        TEXT("AnimeOutlinePass::AddPassStub — thickness=%.2f (wire AnimeOutline.usf for RDG)"),
        Config.OutlineThickness);
}
