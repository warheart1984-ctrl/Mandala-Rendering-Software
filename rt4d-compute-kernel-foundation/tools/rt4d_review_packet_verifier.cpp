#include "kernels/cpu/rt4d_review_packet.h"

#include <cstdio>
#include <string>

int main(int argc, char** argv) {
    if (argc != 2) {
        std::fprintf(stderr,
                     "usage: rt4d_review_packet_verifier <manifest.json>\n");
        return 1;
    }
    RT4DReviewPacket packet;
    std::string error;
    if (!rt4dVerifyReviewPacketFromManifest(argv[1], packet, &error)) {
        std::fprintf(stderr, "[rt4d-verifier] FAIL: %s\n", error.c_str());
        return 1;
    }
    std::fprintf(stdout,
                   "[rt4d-verifier] PASS: sliceId=%s topology=%s "
                   "hypervolume4=%.8f sliceVolume3=%.8f overlayAuthoritative=false\n",
                   packet.sliceId.c_str(), packet.topology.c_str(),
                   packet.hypervolume4, packet.sliceVolume3);
    return 0;
}
