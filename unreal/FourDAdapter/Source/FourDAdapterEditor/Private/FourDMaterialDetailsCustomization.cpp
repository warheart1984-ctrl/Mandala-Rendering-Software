#include "CoreMinimal.h"
#include "IDetailCustomization.h"

/**
 * FFourDMaterialDetailsCustomization — Details panel stub for W material params.
 * Declared: WDepth, WGradientTex, GhostOpacity, WDepthMode.
 */
class FFourDMaterialDetailsCustomization : public IDetailCustomization
{
public:
	static TSharedRef<IDetailCustomization> MakeInstance()
	{
		return MakeShareable(new FFourDMaterialDetailsCustomization);
	}

	virtual void CustomizeDetails(IDetailLayoutBuilder& DetailBuilder) override
	{
		(void)DetailBuilder;
	}
};
