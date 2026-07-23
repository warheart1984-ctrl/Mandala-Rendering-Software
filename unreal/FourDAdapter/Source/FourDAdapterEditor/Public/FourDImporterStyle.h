#pragma once

#include "CoreMinimal.h"
#include "Styling/SlateStyle.h"

/** Editor style set stub for FourD importer / slice UI. */
class FFourDImporterStyle
{
public:
	static void Initialize();
	static void Shutdown();
	static FName GetStyleSetName();

private:
	static TSharedPtr<FSlateStyleSet> StyleInstance;
};
