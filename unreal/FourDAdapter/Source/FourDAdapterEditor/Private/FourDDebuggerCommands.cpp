#include "FourDDebuggerCommands.h"

#define LOCTEXT_NAMESPACE "FourDDebuggerCommands"

FFourDDebuggerCommands::FFourDDebuggerCommands()
	: TCommands<FFourDDebuggerCommands>(
		TEXT("FourDDebugger"),
		LOCTEXT("FourDDebugger", "4D Debugger"),
		NAME_None,
		FName("FourDDebuggerStyle"))
{
}

void FFourDDebuggerCommands::RegisterCommands()
{
	UI_COMMAND(OpenDebugger, "4D Debugger", "Open the 4D Debugger tab (skeleton)", EUserInterfaceActionType::Button, FInputChord());
	UI_COMMAND(RefreshLineage, "Refresh Lineage", "Re-query lineage registry (skeleton)", EUserInterfaceActionType::Button, FInputChord());
	UI_COMMAND(FocusSelectedLineage, "Focus Selected Lineage", "Sync panel to selection (skeleton)", EUserInterfaceActionType::Button, FInputChord());
	UI_COMMAND(ToggleGhosting, "Toggle Ghosting", "Toggle ghosting (skeleton)", EUserInterfaceActionType::Button, FInputChord());
	UI_COMMAND(RequestLiveReproject, "Request Live Reproject", "Send ProjectionRequest if connected (skeleton)", EUserInterfaceActionType::Button, FInputChord());
	UI_COMMAND(ClearVisualization, "Clear Visualization", "Reset W-slice / mode (skeleton)", EUserInterfaceActionType::Button, FInputChord());
}

#undef LOCTEXT_NAMESPACE
