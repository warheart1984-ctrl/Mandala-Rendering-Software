#include "CoreMinimal.h"
#include "IDetailCustomization.h"

/**
 * FFourDLineageDetailsCustomization — Details panel stub for lineage fields.
 * Declared: Node4D / Mesh4D / Camera4D / Slice3D, W band, projection type.
 */
class FFourDLineageDetailsCustomization : public IDetailCustomization
{
public:
	static TSharedRef<IDetailCustomization> MakeInstance()
	{
		return MakeShareable(new FFourDLineageDetailsCustomization);
	}

	virtual void CustomizeDetails(IDetailLayoutBuilder& DetailBuilder) override
	{
		(void)DetailBuilder;
		// Skeleton — no property rows registered.
	}
};
