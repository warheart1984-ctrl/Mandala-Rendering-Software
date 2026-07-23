using UnrealBuildTool;

public class FourDAdapterEditor : ModuleRules
{
	public FourDAdapterEditor(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"UnrealEd",
			"FourDAdapterRuntime",
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Slate",
			"SlateCore",
			"InputCore",
			"EditorStyle",
			"PropertyEditor",
			"ToolMenus",
		});

		// Optional / declared (v1.1) — NOT enabled; uncomment in a local UE project as needed:
		// "WorkspaceMenuStructure", "EditorWidgets", "Sequencer", "MovieSceneTools"
	}
}
