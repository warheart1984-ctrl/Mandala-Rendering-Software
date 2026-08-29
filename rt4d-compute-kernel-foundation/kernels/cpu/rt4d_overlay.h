#pragma once

#include "kernels/cpu/rt4d_review_packet.h"

#include <string>

// Read-only overlay evaluation. Overlay is never ground truth and must not
// mutate review-packet artifacts (sidecar, receipt, preview, obj, manifest).

struct RT4DOverlayRequest {
    std::string outputPath;
    float minCoverage = 0.0f;
    float maxCoverage = 1.0f;
    std::string requiredTopology;
    bool requireNonEmpty = false;
};

struct RT4DOverlayGateResult {
    bool syncPassed = false;
    bool perfPassed = false;
    bool iqPassed = false;
    bool overlayAllowed = false;
    bool wroteView = false;
    std::string reason;
    std::string banner =
        "NON-AUTHORITATIVE READ-ONLY OVERLAY";
};

bool rt4dPathIsProtectedPacketArtifact(const RT4DReviewPacket& packet,
                                          const std::string& path);

RT4DOverlayGateResult rt4dEvaluateOverlayGates(
    const RT4DReviewPacket& packet, const RT4DOverlayRequest& request);

bool rt4dWriteReadOnlyOverlayView(const RT4DReviewPacket& packet,
                                 const RT4DOverlayRequest& request,
                                 RT4DOverlayGateResult& result,
                                 std::string* error);
