#pragma once

#include "CoreMinimal.h"
#include "Framework/Commands/Commands.h"

/** Editor commands for 4D Debugger — skeleton registration only. */
class FFourDDebuggerCommands : public TCommands<FFourDDebuggerCommands>
{
public:
	FFourDDebuggerCommands();

	virtual void RegisterCommands() override;

	TSharedPtr<FUICommandInfo> OpenDebugger;
	TSharedPtr<FUICommandInfo> RefreshLineage;
	TSharedPtr<FUICommandInfo> FocusSelectedLineage;
	TSharedPtr<FUICommandInfo> ToggleGhosting;
	TSharedPtr<FUICommandInfo> RequestLiveReproject;
	TSharedPtr<FUICommandInfo> ClearVisualization;
};
