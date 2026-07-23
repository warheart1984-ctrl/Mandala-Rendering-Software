#pragma once

#include "CoreMinimal.h"
#include "Framework/Commands/Commands.h"

/** Editor commands for Import 4D Projection — skeleton registration only. */
class FFourDImporterCommands : public TCommands<FFourDImporterCommands>
{
public:
	FFourDImporterCommands();

	virtual void RegisterCommands() override;

	TSharedPtr<FUICommandInfo> OpenImporter;
	TSharedPtr<FUICommandInfo> OpenSliceController;
};
