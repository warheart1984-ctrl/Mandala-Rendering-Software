using UnrealBuildTool;

public class GovernedEngine : ModuleRules
{
	public GovernedEngine(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"Json",
			"JsonUtilities",
			"ImageWrapper",
			"RHI",
			"RenderCore",
			"ProceduralMeshComponent",
			"MovieRenderPipelineCore",
			"MovieRenderPipelineRenderPasses",
		});

		PrivateDependencyModuleNames.AddRange(new string[] { });

		// Shared constitutional headers under repo /engine (repo root is 6 levels above ModuleDirectory)
		var RepoRoot = System.IO.Path.GetFullPath(
			System.IO.Path.Combine(ModuleDirectory, "..", "..", "..", "..", "..", ".."));
		var SharedEngine = System.IO.Path.Combine(RepoRoot, "engine");

		PublicIncludePaths.AddRange(new string[]
		{
			System.IO.Path.Combine(SharedEngine, "runtime"),
			System.IO.Path.Combine(SharedEngine, "scripting"),
			System.IO.Path.Combine(SharedEngine, "governance"),
			System.IO.Path.Combine(SharedEngine, "dto"),
			System.IO.Path.Combine(SharedEngine, "world"),
			System.IO.Path.Combine(SharedEngine, "timeline"),
			System.IO.Path.Combine(SharedEngine, "conformance"),
		});

		// Editor-only dependencies for automation tests
		if (Target.Type == TargetType.Editor)
		{
			PrivateDependencyModuleNames.AddRange(new string[]
			{
				"UnrealEd",
				"LevelSequence",
				"MovieScene",
				"MovieRenderPipelineCore",
				"MovieRenderPipelineRenderPasses",
				"MovieRenderPipelineEditor",
				"AutomationController",
				"AutomationTest",
				"AutomationUtils",
			});
		}
	}
}