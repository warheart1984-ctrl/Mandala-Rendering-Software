#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"

/**
 * Declared 4D Debugger Slate panel — layout in UNREAL_4D_DEBUGGER.md.
 * Skeleton: Construct empty; not interactive.
 */
class SFourDDebuggerPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SFourDDebuggerPanel) {}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
};
