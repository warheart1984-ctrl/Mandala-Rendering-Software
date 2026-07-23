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
	}
}
