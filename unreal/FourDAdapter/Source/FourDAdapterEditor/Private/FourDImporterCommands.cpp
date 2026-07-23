#include "FourDImporterCommands.h"
#include "FourDImporterStyle.h"

#define LOCTEXT_NAMESPACE "FFourDImporterCommands"

FFourDImporterCommands::FFourDImporterCommands()
	: TCommands<FFourDImporterCommands>(
		TEXT("FourDImporter"),
		NSLOCTEXT("Contexts", "FourDImporter", "4D Adapter Importer"),
		NAME_None,
		FFourDImporterStyle::GetStyleSetName())
{
}

void FFourDImporterCommands::RegisterCommands()
{
	UI_COMMAND(OpenImporter, "Import 4D Projection", "Open the FourD scene3D + lineageBundle importer (skeleton).", EUserInterfaceActionType::Button, FInputChord());
	UI_COMMAND(OpenSliceController, "4D Slice Controller", "Open the W-slice / ghosting controller (skeleton).", EUserInterfaceActionType::Button, FInputChord());
}

#undef LOCTEXT_NAMESPACE
