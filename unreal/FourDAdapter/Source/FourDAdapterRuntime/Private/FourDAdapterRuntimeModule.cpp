#include "FourDAdapterRuntime.h"
#include "Modules/ModuleManager.h"

#define LOCTEXT_NAMESPACE "FFourDAdapterRuntimeModule"

void FFourDAdapterRuntimeModule::StartupModule()
{
	// Skeleton: no runtime subsystems registered until UE host build.
}

void FFourDAdapterRuntimeModule::ShutdownModule()
{
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FFourDAdapterRuntimeModule, FourDAdapterRuntime)
