#pragma once

#include "CoreMinimal.h"

/**
 * Declared editor viewport overlay for W-band / live / lineage HUD.
 * Skeleton — Register/Unregister no-ops; no draw evidence.
 */
class FFourDViewportOverlay
{
public:
	static void Register();
	static void Unregister();
};
