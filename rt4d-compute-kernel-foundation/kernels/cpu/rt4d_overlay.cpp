#include "kernels/cpu/rt4d_overlay.h"

#include "kernels/cpu/rt4d_evidence.h"

#include <filesystem>
#include <sstream>
#include <system_error>

namespace {

bool samePath(const std::string& a, const std::string& b) {
    if (a.empty() || b.empty()) return false;
    std::error_code error;
    const auto left = std::filesystem::weakly_canonical(a, error);
    const auto right = std::filesystem::weakly_canonical(b, error);
    if (error) return a == b;
    return left == right;
}

}  // namespace

bool rt4dPathIsProtectedPacketArtifact(const RT4DReviewPacket& packet,
                                          const std::string& path) {
    return samePath(path, packet.obj.path) ||
           samePath(path, packet.receipt.path) ||
           samePath(path, packet.preview.path) ||
           samePath(path, packet.sidecar.path) ||
           samePath(path, packet.manifest.path);
}

RT4DOverlayGateResult rt4dEvaluateOverlayGates(
    const RT4DReviewPacket& packet, const RT4DOverlayRequest& request) {
    RT4DOverlayGateResult result;
    if (rt4dPathIsProtectedPacketArtifact(packet, request.outputPath)) {
        result.reason =
            "overlay output path is a protected review-packet artifact";
        return result;
    }
    std::string verifyError;
    result.syncPassed = rt4dVerifyReviewPacket(packet, &verifyError);
    if (!result.syncPassed && result.reason.empty())
        result.reason = verifyError.empty() ? "review packet failed verification"
                                            : verifyError;

    result.perfPassed = packet.imageCoverage >= request.minCoverage &&
                         packet.imageCoverage <= request.maxCoverage;
    if (!result.perfPassed && result.reason.empty())
        result.reason = "preview coverage is outside the overlay perf gate";

    bool topologyOk = true;
    if (request.requireNonEmpty && packet.topology == "empty")
        topologyOk = false;
    if (!request.requiredTopology.empty() &&
        packet.topology != request.requiredTopology)
        topologyOk = false;
    result.iqPassed = topologyOk;
    if (!result.iqPassed && result.reason.empty())
        result.reason = "slice topology failed the overlay IQ gate";

    result.overlayAllowed =
        result.syncPassed && result.perfPassed && result.iqPassed;
    if (result.overlayAllowed)
        result.reason = "overlay gates passed; view is non-authoritative";
    return result;
}

bool rt4dWriteReadOnlyOverlayView(const RT4DReviewPacket& packet,
                                 const RT4DOverlayRequest& request,
                                 RT4DOverlayGateResult& result,
                                 std::string* error) {
    result = rt4dEvaluateOverlayGates(packet, request);
    if (rt4dPathIsProtectedPacketArtifact(packet, request.outputPath)) {
        if (error)
            *error = "refusing to write overlay onto a review-packet artifact";
        return false;
    }
    std::ostringstream json;
    json << "{\n"
         << "  \"schema\": \"rt4d-overlay-view/0.1\",\n"
         << "  \"mode\": \"diagnostic_only\",\n"
         << "  \"banner\": \"" << rt4dJsonEscape(result.banner) << "\",\n"
         << "  \"overlayAuthoritative\": false,\n"
         << "  \"rendererPixelAuthority\": false,\n"
         << "  \"overlayAllowed\": "
         << (result.overlayAllowed ? "true" : "false") << ",\n"
         << "  \"gates\": {\n"
         << "    \"sync\": " << (result.syncPassed ? "true" : "false")
         << ",\n"
         << "    \"perf\": " << (result.perfPassed ? "true" : "false")
         << ",\n"
         << "    \"iq\": " << (result.iqPassed ? "true" : "false") << "\n"
         << "  },\n"
         << "  \"sliceId\": \"" << rt4dJsonEscape(packet.sliceId) << "\",\n"
         << "  \"topology\": \"" << rt4dJsonEscape(packet.topology) << "\",\n"
         << "  \"hypervolume4\": " << packet.hypervolume4 << ",\n"
         << "  \"sliceVolume3\": " << packet.sliceVolume3 << ",\n"
         << "  \"imageCoverage\": " << packet.imageCoverage << ",\n"
         << "  \"manifestPath\": \"" << rt4dJsonEscape(packet.manifest.path)
         << "\",\n"
         << "  \"reason\": \"" << rt4dJsonEscape(result.reason) << "\"\n"
         << "}\n";
    const RT4DPublishResult published =
        rt4dPublishText(request.outputPath, json.str());
    if (published.status != RT4DPublishStatus::published) {
        if (error) *error = published.detail;
        result.wroteView = false;
        return false;
    }
    result.wroteView = true;
    return true;
}
