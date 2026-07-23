#pragma once

#include "CoreMinimal.h"
#include "Styling/SlateStyle.h"

/** Editor style set stub for 4D Debugger. */
class FFourDDebuggerStyle
{
public:
	static void Initialize();
	static void Shutdown();
	static FName GetStyleSetName();

private:
	static TSharedPtr<FSlateStyleSet> StyleInstance;
};
