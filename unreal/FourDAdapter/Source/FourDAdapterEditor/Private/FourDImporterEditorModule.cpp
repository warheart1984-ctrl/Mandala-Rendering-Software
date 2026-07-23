#include "FourDAdapterEditor.h"
#include "FourDImporterCommands.h"
#include "FourDImporterStyle.h"
#include "FourDDebuggerCommands.h"
#include "FourDDebuggerStyle.h"
#include "FourDViewportOverlay.h"
#include "Modules/ModuleManager.h"
#include "ToolMenus.h"

#define LOCTEXT_NAMESPACE "FFourDAdapterEditorModule"

void FFourDAdapterEditorModule::StartupModule()
{
	FFourDImporterStyle::Initialize();
	FFourDImporterCommands::Register();
	FFourDDebuggerStyle::Initialize();
	FFourDDebuggerCommands::Register();
	RegisterMenus();
	RegisterDebuggerTabSpawner();
	FFourDViewportOverlay::Register();
	UE_LOG(LogTemp, Log, TEXT("FourDAdapterEditor: skeleton module started (importer + debugger stubs; UI not interactive)"));
}

void FFourDAdapterEditorModule::ShutdownModule()
{
	FFourDViewportOverlay::Unregister();
	UnregisterDebuggerTabSpawner();
	UnregisterMenus();
	FFourDDebuggerCommands::Unregister();
	FFourDDebuggerStyle::Shutdown();
	FFourDImporterCommands::Unregister();
	FFourDImporterStyle::Shutdown();
}

void FFourDAdapterEditorModule::RegisterMenus()
{
	// Skeleton — ToolMenus entries for Import / Debugger when editor host is available.
}

void FFourDAdapterEditorModule::UnregisterMenus()
{
}

void FFourDAdapterEditorModule::RegisterDebuggerTabSpawner()
{
	// Skeleton — FGlobalTabmanager::RegisterNomadTabSpawner("FourDAdapter.Debugger", ...)
	// would spawn SFourDDebuggerPanel. Not registered here without WorkspaceMenuStructure deps verified.
	UE_LOG(LogTemp, Log, TEXT("FourDAdapterEditor: debugger tab spawner stub (not registered)"));
}

void FFourDAdapterEditorModule::UnregisterDebuggerTabSpawner()
{
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FFourDAdapterEditorModule, FourDAdapterEditor)
