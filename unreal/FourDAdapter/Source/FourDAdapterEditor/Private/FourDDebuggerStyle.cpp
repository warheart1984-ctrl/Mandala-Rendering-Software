#include "FourDDebuggerStyle.h"
#include "Styling/SlateStyleRegistry.h"

TSharedPtr<FSlateStyleSet> FFourDDebuggerStyle::StyleInstance;

void FFourDDebuggerStyle::Initialize()
{
	if (!StyleInstance.IsValid())
	{
		StyleInstance = MakeShareable(new FSlateStyleSet(GetStyleSetName()));
		FSlateStyleRegistry::RegisterSlateStyle(*StyleInstance);
	}
}

void FFourDDebuggerStyle::Shutdown()
{
	if (StyleInstance.IsValid())
	{
		FSlateStyleRegistry::UnRegisterSlateStyle(*StyleInstance);
		StyleInstance.Reset();
	}
}

FName FFourDDebuggerStyle::GetStyleSetName()
{
	static FName StyleName(TEXT("FourDDebuggerStyle"));
	return StyleName;
}
