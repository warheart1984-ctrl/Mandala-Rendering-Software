#include "SFourDDebuggerPanel.h"
#include "SFourDWAxisWidget.h"
#include "Widgets/Text/STextBlock.h"
#include "Widgets/SBoxPanel.h"

#define LOCTEXT_NAMESPACE "SFourDDebuggerPanel"

void SFourDDebuggerPanel::Construct(const FArguments& InArgs)
{
	// Skeleton — sections declared in UNREAL_4D_DEBUGGER.md; not interactive.
	ChildSlot
	[
		SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight().Padding(4)
		[
			SNew(STextBlock)
			.Text(LOCTEXT("Title", "4D Debugger (skeleton — not interactive)"))
		]
		+ SVerticalBox::Slot().AutoHeight().Padding(4)
		[
			SNew(SFourDWAxisWidget)
		]
	];
}

#undef LOCTEXT_NAMESPACE
