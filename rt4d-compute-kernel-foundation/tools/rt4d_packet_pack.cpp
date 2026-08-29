#include "kernels/cpu/rt4d_kernel_contract.h"
#include "kernels/cpu/rt4d_review_packet.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

int main(int argc, char** argv) {
    if (argc < 5) {
        std::fprintf(stderr,
                     "usage: rt4d_packet_pack <sidecar.rt4d> <packetDir> "
                     "<index.json> <w> [w...]\n");
        return 1;
    }
    RT4DPentachoronAsset4D asset;
    std::string error;
    if (!rt4dLoadPentachoronSidecar(argv[1], asset, &error)) {
        std::fprintf(stderr, "[rt4d-pack] FAIL: %s\n", error.c_str());
        return 1;
    }
    std::vector<RT4DPacketIndexEntry> entries;
    for (int i = 4; i < argc; ++i) {
        const float w = std::strtof(argv[i], nullptr);
        const std::string packetDir =
            std::string(argv[2]) + "/w" + argv[i];
        RT4DReviewPacket packet;
        if (!rt4dBuildSliceReviewPacket(asset, 0, w, packetDir, packet,
                                         &error)) {
            std::fprintf(stderr, "[rt4d-pack] FAIL: %s\n", error.c_str());
            return 1;
        }
        entries.push_back(rt4dIndexEntryFromPacket(packet, packetDir));
    }
    if (!rt4dWritePacketIndex(argv[3], entries, &error)) {
        std::fprintf(stderr, "[rt4d-pack] FAIL: %s\n", error.c_str());
        return 1;
    }
    std::fprintf(stdout, "[rt4d-pack] PASS: packets=%zu index=%s\n",
                   entries.size(), argv[3]);
    return 0;
}
