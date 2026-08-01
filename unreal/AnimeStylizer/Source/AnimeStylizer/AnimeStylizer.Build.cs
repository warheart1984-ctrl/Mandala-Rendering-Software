// Copyright 2026 MRS. All Rights Reserved.
// Status: skeleton — Build.cs matches MRS Unreal host patterns; no CI Unreal compile evidence in this repo.

using UnrealBuildTool;
using System.IO;

public class AnimeStylizer : ModuleRules
{
    public AnimeStylizer(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "RenderCore",
            "RHI",
            "Projects",
            "ImageWrapper",
        });

        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "RenderCore",
            "RHI",
            "ShaderCore",
            "ImageWrapper",
        });

        // Optional renderer / RDG wiring — enable inside a real UE project when landing full passes.
        // PrivateDependencyModuleNames.Add("Renderer");

        if (Target.bBuildEditor)
        {
            PrivateDependencyModuleNames.Add("UnrealEd");
        }

        // Plugin Shaders/ live next to Source/; mapped at runtime via AddShaderSourceDirectoryMapping.
        string PluginShaders = Path.GetFullPath(Path.Combine(ModuleDirectory, "..", "..", "Shaders"));
        if (Directory.Exists(PluginShaders))
        {
            // Informational only — mapping is done in AnimeStylizerModule.cpp
        }

        CppStandard = CppStandardVersion.Cpp17;
    }
}
