// Copyright 2026 MRS. All Rights Reserved.
// Status: skeleton

#include "AnimeTemporalAAPass.h"
#include "AnimeStylizerModule.h"

void FAnimeTemporalAAPass::Register()
{
    UE_LOG(LogAnimeStylizer, Log, TEXT("AnimeTemporalAAPass registered (skeleton — RDG not wired)"));
}

void FAnimeTemporalAAPass::Unregister()
{
    UE_LOG(LogAnimeStylizer, Log, TEXT("AnimeTemporalAAPass unregistered"));
}

void FAnimeTemporalAAPass::AddPassStub(const FAnimeStylizerConfig& Config)
{
    UE_LOG(LogAnimeStylizer, Warning,
        TEXT("AnimeTemporalAAPass::AddPassStub — enabled=%d (wire AnimeTemporalAA.usf for RDG)"),
        Config.bEnableTemporalAA ? 1 : 0);
}
