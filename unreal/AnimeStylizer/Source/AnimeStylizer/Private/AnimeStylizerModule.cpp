// Copyright 2026 MRS. All Rights Reserved.
// Status: skeleton — shader directory mapping + pass Register/Unregister stubs.

#include "AnimeStylizerModule.h"
#include "AnimeOutlinePass.h"
#include "AnimeCelShadingPass.h"
#include "AnimeColorGradePass.h"
#include "AnimeTemporalAAPass.h"
#include "Interfaces/IPluginManager.h"
#include "Misc/Paths.h"
#include "ShaderCore.h"

DEFINE_LOG_CATEGORY(LogAnimeStylizer);

void FAnimeStylizerModule::StartupModule()
{
    UE_LOG(LogAnimeStylizer, Log, TEXT("AnimeStylizer starting (skeleton/partial — Unreal host is skeleton)"));

    TSharedPtr<IPlugin> Plugin = IPluginManager::Get().FindPlugin(TEXT("AnimeStylizer"));
    if (Plugin.IsValid())
    {
        const FString PluginShaderDir = FPaths::Combine(Plugin->GetBaseDir(), TEXT("Shaders"));
        AddShaderSourceDirectoryMapping(TEXT("/Plugin/AnimeStylizer"), PluginShaderDir);
    }
    else
    {
        UE_LOG(LogAnimeStylizer, Warning, TEXT("AnimeStylizer plugin descriptor not found; shader mapping skipped"));
    }

    RegisterRenderPasses();
}

void FAnimeStylizerModule::ShutdownModule()
{
    UnregisterRenderPasses();
    UE_LOG(LogAnimeStylizer, Log, TEXT("AnimeStylizer shut down"));
}

void FAnimeStylizerModule::RegisterRenderPasses()
{
    // partial: Register() only marks shaders for future RDG insertion — no engine PP hook yet.
    FAnimeOutlinePass::Register();
    FAnimeCelShadingPass::Register();
    FAnimeColorGradePass::Register();
    FAnimeTemporalAAPass::Register();
}

void FAnimeStylizerModule::UnregisterRenderPasses()
{
    FAnimeTemporalAAPass::Unregister();
    FAnimeColorGradePass::Unregister();
    FAnimeCelShadingPass::Unregister();
    FAnimeOutlinePass::Unregister();
}

IMPLEMENT_MODULE(FAnimeStylizerModule, AnimeStylizer)
