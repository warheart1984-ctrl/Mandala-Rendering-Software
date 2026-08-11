#include "Modules/ModuleManager.h"

class FGovernedEngineTestsModule : public IModuleInterface
{
public:
	virtual void StartupModule() override {}
	virtual void ShutdownModule() override {}
};

IMPLEMENT_MODULE(FGovernedEngineTestsModule, GovernedEngineTests)