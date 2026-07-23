#include "FourDAdapterEditor.h"
#include "FourDImporterCommands.h"
#include "FourDImporterStyle.h"
#include "Modules/ModuleManager.h"
#include "ToolMenus.h"

#define LOCTEXT_NAMESPACE "FFourDAdapterEditorModule"

void FFourDAdapterEditorModule::StartupModule()
{
	FFourDImporterStyle::Initialize();
	FFourDImporterCommands::Register();
	RegisterMenus();
	// Skeleton: details customizations and tab spawners deferred until UE host open.
	UE_LOG(LogTemp, Log, TEXT("FourDAdapterEditor: skeleton module started (menus/commands registered; UI stubs not interactive)"));
}

void FFourDAdapterEditorModule::ShutdownModule()
{
	UnregisterMenus();
	FFourDImporterCommands::Unregister();
	FFourDImporterStyle::Shutdown();
}

void FFourDAdapterEditorModule::RegisterMenus()
{
	// Skeleton — ToolMenus entry for "Import 4D Projection" when editor host is available.
}

void FFourDAdapterEditorModule::UnregisterMenus()
{
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FFourDAdapterEditorModule, FourDAdapterEditor)
