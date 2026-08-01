// Copyright 2026 MRS. All Rights Reserved.
// Status: skeleton — module lifecycle + config holder; RDG chain not hooked into engine PP.

#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleInterface.h"
#include "Modules/ModuleManager.h"
#include "AnimeStylizerTypes.h"

class FAnimeStylizerModule : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;

    /** Register pass stubs (logs only until RDG is wired). Status: skeleton. */
    void RegisterRenderPasses();
    void UnregisterRenderPasses();

    void SetEnabled(bool bInEnabled) { bEnabled = bInEnabled; }
    bool IsEnabled() const { return bEnabled; }

    FAnimeStylizerConfig Config;

    static FAnimeStylizerModule& Get()
    {
        return FModuleManager::LoadModuleChecked<FAnimeStylizerModule>(TEXT("AnimeStylizer"));
    }

    static bool IsAvailable()
    {
        return FModuleManager::Get().IsModuleLoaded(TEXT("AnimeStylizer"));
    }

private:
    bool bEnabled = false;
};

DECLARE_LOG_CATEGORY_EXTERN(LogAnimeStylizer, Log, All);
