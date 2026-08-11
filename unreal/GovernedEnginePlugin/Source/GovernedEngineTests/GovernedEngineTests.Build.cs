using UnrealBuildTool;

public class GovernedEngineTests : ModuleRules
{
	public GovernedEngineTests(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"GovernedEngine",
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"AutomationController",
			"AutomationTest",
			"AutomationUtils",
			"UnrealEd",
			"LevelSequence",
			"MovieScene",
			"MovieRenderPipelineCore",
			"MovieRenderPipelineRenderPasses",
			"MovieRenderPipelineEditor",
		});

		// Only build for Editor target
		if (Target.Type != TargetType.Editor)
		{
			bBuildEditor = true;
		}
	}
}