#include "SFourDWAxisWidget.h"

void SFourDWAxisWidget::Construct(const FArguments& InArgs)
{
}

int32 SFourDWAxisWidget::OnPaint(
	const FPaintArgs& Args,
	const FGeometry& AllottedGeometry,
	const FSlateRect& MyCullingRect,
	FSlateWindowElementList& OutDrawElements,
	int32 LayerId,
	const FWidgetStyle& InWidgetStyle,
	bool bParentEnabled) const
{
	// Skeleton — declared: draw W axis + active [WMin,WMax] band. No paint evidence.
	return LayerId;
}

FVector2D SFourDWAxisWidget::ComputeDesiredSize(float) const
{
	return FVector2D(200.f, 24.f);
}
