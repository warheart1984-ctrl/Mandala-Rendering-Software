#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"

/**
 * SFourDImporterWindow — editor window stub.
 * Declared UX: file pickers for scene3D + lineageBundle, Import Projection button, summary.
 * Not interactive until implemented against a UE editor host.
 */
class SFourDImporterWindow : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SFourDImporterWindow) {}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs)
	{
		(void)InArgs;
		// Skeleton placeholder — no Slate children wired.
	}
};
