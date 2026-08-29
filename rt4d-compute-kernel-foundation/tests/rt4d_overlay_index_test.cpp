#include "kernels/cpu/rt4d_kernel_contract.h"
#include "kernels/cpu/rt4d_overlay.h"
#include "kernels/cpu/rt4d_sha256.h"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <string>
#include <system_error>
#include <vector>
#ifndef _WIN32
#include <unistd.h>
#endif

namespace {

int fail(const char* message) {
    std::fprintf(stderr, "[overlay-index] FAIL: %s\n", message);
    return 1;
}

std::filesystem::path uniqueRoot() {
    const auto root =
        std::filesystem::temp_directory_path() /
        ("rt4d-overlay-" +
         std::to_string(
#ifndef _WIN32
             getpid()
#else
             0
#endif
                 ));
    std::error_code error;
    std::filesystem::remove_all(root, error);
    std::filesystem::create_directories(root);
    return root;
}

}  // namespace

int main() {
    RT4DPentachoronAsset4D asset;
    asset.schema = "rt4d-pentachoron-sidecar/0.1";
    asset.provenance = "generated_diagnostic_fixture_declared_unreviewed";
    asset.author = "system";
    asset.license = "MIT";
    asset.creationTool = "rt4d-diagnostic-cli";
    asset.primitives.push_back({{0, 0, 0, 0},
                                 {1, 0, 0, 0},
                                 {0, 1, 0, 0},
                                 {0, 0, 1, 0},
                                 {0, 0, 0, 1},
                                 9,
                                 0,
                                 0,
                                 0});

    const auto root = uniqueRoot();
    std::string error;
    RT4DReviewPacket tetra;
    const std::string tetraDir = (root / "tetra").string();
    if (!rt4dBuildSliceReviewPacket(asset, 0, 0.25f, tetraDir, tetra, &error))
        return fail(error.c_str());
    RT4DReviewPacket empty;
    const std::string emptyDir = (root / "empty").string();
    if (!rt4dBuildSliceReviewPacket(asset, 0, 2.0f, emptyDir, empty, &error))
        return fail(error.c_str());

    std::vector<RT4DPacketIndexEntry> entries = {
        rt4dIndexEntryFromPacket(tetra, tetraDir),
        rt4dIndexEntryFromPacket(empty, emptyDir)};
    const std::string indexPath = (root / "index.json").string();
    if (!rt4dWritePacketIndex(indexPath, entries, &error))
        return fail(error.c_str());
    std::vector<RT4DPacketIndexEntry> loaded;
    if (!rt4dLoadPacketIndex(indexPath, loaded, &error) || loaded.size() != 2 ||
        loaded[0].sliceId != tetra.sliceId || loaded[1].topology != "empty")
        return fail("review-packet index did not round-trip");

    std::string sidecarHashError;
    const std::string sidecarBefore =
        rt4dSha256Hex(rt4dSha256File(tetra.sidecar.path, &sidecarHashError));
    RT4DOverlayRequest forbidden;
    forbidden.outputPath = tetra.sidecar.path;
    forbidden.requireNonEmpty = true;
    forbidden.requiredTopology = "tetrahedron";
    RT4DOverlayGateResult denied = rt4dEvaluateOverlayGates(tetra, forbidden);
    if (denied.overlayAllowed)
        return fail("overlay was allowed onto a sidecar path");
    if (rt4dWriteReadOnlyOverlayView(tetra, forbidden, denied, &error))
        return fail("overlay wrote onto a protected packet artifact");
    const std::string sidecarAfter =
        rt4dSha256Hex(rt4dSha256File(tetra.sidecar.path, &sidecarHashError));
    if (sidecarBefore != sidecarAfter)
        return fail("overlay mutated a sidecar");

    forbidden.outputPath = tetra.receipt.path;
    if (rt4dWriteReadOnlyOverlayView(tetra, forbidden, denied, &error))
        return fail("overlay wrote onto a receipt");
    forbidden.outputPath = tetra.manifest.path;
    if (rt4dWriteReadOnlyOverlayView(tetra, forbidden, denied, &error))
        return fail("overlay wrote onto a manifest");

    RT4DOverlayRequest allowed;
    allowed.outputPath = (root / "overlay-view.json").string();
    allowed.requireNonEmpty = true;
    allowed.requiredTopology = "tetrahedron";
    allowed.minCoverage = 0.0f;
    allowed.maxCoverage = 1.0f;
    RT4DOverlayGateResult view;
    if (!rt4dWriteReadOnlyOverlayView(tetra, allowed, view, &error) ||
        !view.overlayAllowed || !view.wroteView)
        return fail("read-only overlay view was not written");
    std::ifstream overlayIn(allowed.outputPath);
    const std::string overlayJson((std::istreambuf_iterator<char>(overlayIn)),
                                    std::istreambuf_iterator<char>());
    if (overlayJson.find("NON-AUTHORITATIVE READ-ONLY OVERLAY") ==
            std::string::npos ||
        overlayJson.find("\"overlayAuthoritative\": false") == std::string::npos ||
        overlayJson.find("\"rendererPixelAuthority\": false") ==
            std::string::npos)
        return fail("overlay view missing non-authoritative banner");

    RT4DOverlayRequest emptyGate = allowed;
    emptyGate.outputPath = (root / "overlay-empty.json").string();
    emptyGate.requireNonEmpty = true;
    emptyGate.requiredTopology.clear();
    RT4DOverlayGateResult emptyResult;
    if (!rt4dWriteReadOnlyOverlayView(empty, emptyGate, emptyResult, &error))
        return fail("empty-gate overlay view was not written");
    if (emptyResult.overlayAllowed || emptyResult.iqPassed)
        return fail("empty topology did not fail the IQ gate");

    tetra.overlayAuthoritative = true;
    std::string verifyError;
    if (rt4dVerifyReviewPacket(tetra, &verifyError))
        return fail("packet claiming overlay authority was accepted");

    std::fprintf(stderr,
                   "[overlay-index] PASS: index inspect, overlay read-only gates\n");
    return 0;
}
