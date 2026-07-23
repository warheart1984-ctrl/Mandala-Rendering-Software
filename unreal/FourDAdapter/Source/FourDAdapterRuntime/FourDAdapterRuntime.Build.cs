using UnrealBuildTool;

public class FourDAdapterRuntime : ModuleRules
{
	public FourDAdapterRuntime(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"Json",
			"JsonUtilities",
		});

		PrivateDependencyModuleNames.AddRange(new string[] { });

		// ---------------------------------------------------------------------------
		// Optional / declared deps for v1.1 subsystem enhancements — NOT enabled.
		// Uncomment only when building inside a UE project that already links these,
		// and after retargeting UMovieScene4DTrack/Section to real MovieScene bases.
		// There is no CI Unreal evidence that these compile in this repo.
		//
		// PublicDependencyModuleNames.AddRange(new string[]
		// {
		//     "MovieScene",
		//     "MovieSceneTracks",
		//     "WebSockets",   // UFourDLiveLinkClient WS
		//     "Sockets",      // optional TCP fallback
		//     "Networking",
		// });
		// ---------------------------------------------------------------------------
	}
}
