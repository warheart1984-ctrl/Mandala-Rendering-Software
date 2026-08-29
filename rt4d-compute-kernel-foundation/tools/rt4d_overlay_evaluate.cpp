#include "kernels/cpu/rt4d_overlay.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

int main(int argc, char** argv) {
    if (argc < 3) {
        std::fprintf(stderr,
                     "usage: rt4d_overlay_evaluate <manifest.json> <overlay.json> "
                     "[--require-topology NAME] [--require-non-empty] "
                     "[--min-coverage F] [--max-coverage F]\n");
        return 1;
    }
    RT4DReviewPacket packet;
    std::string error;
    if (!rt4dVerifyReviewPacketFromManifest(argv[1], packet, &error)) {
        std::fprintf(stderr, "[rt4d-overlay] FAIL: %s\n", error.c_str());
        return 1;
    }
    RT4DOverlayRequest request;
    request.outputPath = argv[2];
    for (int i = 3; i < argc; ++i) {
        if (std::strcmp(argv[i], "--require-non-empty") == 0)
            request.requireNonEmpty = true;
        else if (std::strcmp(argv[i], "--require-topology") == 0 && i + 1 < argc)
            request.requiredTopology = argv[++i];
        else if (std::strcmp(argv[i], "--min-coverage") == 0 && i + 1 < argc)
            request.minCoverage = std::strtof(argv[++i], nullptr);
        else if (std::strcmp(argv[i], "--max-coverage") == 0 && i + 1 < argc)
            request.maxCoverage = std::strtof(argv[++i], nullptr);
        else {
            std::fprintf(stderr, "[rt4d-overlay] FAIL: unknown argument\n");
            return 1;
        }
    }
    RT4DOverlayGateResult result;
    if (!rt4dWriteReadOnlyOverlayView(packet, request, result, &error)) {
        std::fprintf(stderr, "[rt4d-overlay] FAIL: %s\n",
                       error.empty() ? result.reason.c_str() : error.c_str());
        return 1;
    }
    std::fprintf(stdout,
                   "[rt4d-overlay] %s overlayAllowed=%s sync=%s perf=%s iq=%s "
                   "overlayAuthoritative=false\n",
                   result.banner.c_str(),
                   result.overlayAllowed ? "true" : "false",
                   result.syncPassed ? "true" : "false",
                   result.perfPassed ? "true" : "false",
                   result.iqPassed ? "true" : "false");
    return result.overlayAllowed ? 0 : 2;
}
