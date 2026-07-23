#include "FourDImporterStyle.h"
#include "Styling/SlateStyleRegistry.h"
#include "Interfaces/IPluginManager.h"

TSharedPtr<FSlateStyleSet> FFourDImporterStyle::StyleInstance;

void FFourDImporterStyle::Initialize()
{
	if (StyleInstance.IsValid())
	{
		return;
	}
	StyleInstance = MakeShareable(new FSlateStyleSet(GetStyleSetName()));
	// Skeleton — no Content/ icons bundled yet.
	FSlateStyleRegistry::RegisterSlateStyle(*StyleInstance);
}

void FFourDImporterStyle::Shutdown()
{
	if (!StyleInstance.IsValid())
	{
		return;
	}
	FSlateStyleRegistry::UnRegisterSlateStyle(*StyleInstance);
	ensure(StyleInstance.IsUnique());
	StyleInstance.Reset();
}

FName FFourDImporterStyle::GetStyleSetName()
{
	static FName StyleName(TEXT("FourDImporterStyle"));
	return StyleName;
}
