#include "kernels/cpu/rt4d_review_packet.h"

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

int main(int argc, char** argv) {
    if (argc < 3) {
        std::fprintf(stderr,
                     "usage: rt4d_slice_inspector inspect <manifest.json>\n"
                     "       rt4d_slice_inspector list <index.json>\n");
        return 1;
    }
    const std::string mode = argv[1];
    std::string error;
    if (mode == "inspect") {
        RT4DReviewPacket packet;
        if (!rt4dLoadReviewPacketManifest(argv[2], packet, &error)) {
            std::fprintf(stderr, "[rt4d-inspector] FAIL: %s\n", error.c_str());
            return 1;
        }
        std::fprintf(stdout,
                       "sliceId=%s\nprimitiveId=%u\ntopology=%s\n"
                       "hypervolume4=%.10f\nsliceVolume3=%.10f\n"
                       "sliceW=%.6f\nimageCoverage=%.6f\n"
                       "author=%s\nlicense=%s\ncreationTool=%s\n"
                       "sourceHash=%s\nartistReviewed=%s\n"
                       "rendererPixelAuthority=false\noverlayAuthoritative=false\n"
                       "obj=%s\npreview=%s\nreceipt=%s\nsidecar=%s\n",
                       packet.sliceId.c_str(), packet.primitiveId,
                       packet.topology.c_str(), packet.hypervolume4,
                       packet.sliceVolume3, static_cast<double>(packet.sliceW),
                       static_cast<double>(packet.imageCoverage),
                       packet.author.c_str(), packet.license.c_str(),
                       packet.creationTool.c_str(), packet.sourceHash.c_str(),
                       packet.artistReviewed ? "true" : "false",
                       packet.obj.path.c_str(), packet.preview.path.c_str(),
                       packet.receipt.path.c_str(), packet.sidecar.path.c_str());
        return 0;
    }
    if (mode == "list") {
        std::vector<RT4DPacketIndexEntry> entries;
        if (!rt4dLoadPacketIndex(argv[2], entries, &error)) {
            std::fprintf(stderr, "[rt4d-inspector] FAIL: %s\n", error.c_str());
            return 1;
        }
        std::fprintf(stdout, "packetCount=%zu\n", entries.size());
        for (const RT4DPacketIndexEntry& entry : entries) {
            std::fprintf(stdout, "%s %u %s %s\n", entry.sliceId.c_str(),
                           entry.primitiveId, entry.topology.c_str(),
                           entry.manifestPath.c_str());
        }
        return 0;
    }
    std::fprintf(stderr, "[rt4d-inspector] FAIL: unknown mode\n");
    return 1;
}
