#pragma once

#include "CoreMinimal.h"
#include "Widgets/SLeafWidget.h"

/**
 * Declared W-axis band widget for debugger.
 * Skeleton OnPaint — no meaningful draw until UE host verifies.
 */
class SFourDWAxisWidget : public SLeafWidget
{
public:
	SLATE_BEGIN_ARGS(SFourDWAxisWidget) {}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	virtual int32 OnPaint(
		const FPaintArgs& Args,
		const FGeometry& AllottedGeometry,
		const FSlateRect& MyCullingRect,
		FSlateWindowElementList& OutDrawElements,
		int32 LayerId,
		const FWidgetStyle& InWidgetStyle,
		bool bParentEnabled) const override;

	virtual FVector2D ComputeDesiredSize(float) const override;
};
