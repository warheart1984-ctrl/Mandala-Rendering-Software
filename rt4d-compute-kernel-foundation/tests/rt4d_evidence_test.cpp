#include "kernels/cpu/rt4d_evidence.h"
#include "kernels/cpu/rt4d_kernel_contract.h"
#include "kernels/cpu/rt4d_review_packet.h"
#include "kernels/cpu/rt4d_sha256.h"

#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <string>
#include <system_error>
#ifndef _WIN32
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace {

int fail(const char* message) {
    std::fprintf(stderr, "[evidence] FAIL: %s\n", message);
    return 1;
}

bool hexEq(const std::string& actual, const char* expected) {
    return actual == expected;
}

std::filesystem::path uniqueRoot() {
    const auto root =
        std::filesystem::temp_directory_path() /
        ("rt4d-evidence-" + std::to_string(
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
    if (!hexEq(rt4dSha256Hex(rt4dSha256Bytes("abc", 3)),
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"))
        return fail("sha256(abc) mismatch");
    if (!hexEq(rt4dSha256Hex(rt4dSha256Bytes("", 0)),
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"))
        return fail("sha256(empty) mismatch");

    const std::string a55(55, 'a');
    const std::string a56(56, 'a');
    const std::string a64(64, 'a');
    if (!hexEq(rt4dSha256Hex(rt4dSha256Bytes(a55.data(), a55.size())),
                "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318"))
        return fail("sha256 remain=55 padding mismatch");
    if (!hexEq(rt4dSha256Hex(rt4dSha256Bytes(a56.data(), a56.size())),
                "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a"))
        return fail("sha256 remain=56 extra-block padding mismatch");
    if (!hexEq(rt4dSha256Hex(rt4dSha256Bytes(a64.data(), a64.size())),
                "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb"))
        return fail("sha256 remain=0 padding mismatch");

    const uint64_t fnv = rt4dFnv1a64Bytes("abc", 3);
    if (fnv == 0) return fail("fnv1a64 produced a zero debug hash");
    if (rt4dSha256Hex(rt4dSha256Bytes("abc", 3)) == std::to_string(fnv))
        return fail("fnv must not be interchangeable with sha256");
    if (rt4dJsonEscape("a\"b\\c") != "a\\\"b\\\\c")
        return fail("json escape is incorrect");

    const auto root = uniqueRoot();
    const std::string first = (root / "artifact.txt").string();
    const RT4DPublishResult published = rt4dPublishText(first, "hello-evidence\n");
    if (published.status != RT4DPublishStatus::published)
        return fail("first publish should succeed");
    const RT4DPublishResult overwrite = rt4dPublishText(first, "hello-again\n");
    if (overwrite.status != RT4DPublishStatus::overwrite_rejected)
        return fail("overwrite was not rejected");

    const RT4DPublishResult empty = rt4dPublishText((root / "empty.txt").string(), "");
    if (empty.status != RT4DPublishStatus::empty_or_truncated)
        return fail("empty publish was not rejected");

#ifndef _WIN32
    const RT4DPublishResult diskFull = rt4dPublishText("/dev/full", "disk-full-probe\n");
    if (diskFull.status != RT4DPublishStatus::disk_full)
        return fail("linux /dev/full did not classify as disk_full");

    if (geteuid() != 0) {
        const auto locked = root / "locked";
        std::filesystem::create_directories(locked);
        if (chmod(locked.string().c_str(), 0555) != 0)
            return fail("could not lock directory");
        const RT4DPublishResult unwritable =
            rt4dPublishText((locked / "nope.txt").string(), "cannot-write\n");
        chmod(locked.string().c_str(), 0755);
        if (unwritable.status != RT4DPublishStatus::unwritable)
            return fail("unwritable directory did not classify as unwritable");
    }
#endif

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
                                 7,
                                 0,
                                 0,
                                 0});
    const std::string packetDir = (root / "packet").string();
    RT4DReviewPacket packet;
    std::string error;
    if (!rt4dBuildSliceReviewPacket(asset, 0, 0.25f, packetDir, packet, &error))
        return fail(error.c_str());
    if (!rt4dVerifyReviewPacket(packet, &error))
        return fail(error.c_str());

    const auto previewSize = std::filesystem::file_size(packet.preview.path);
    std::filesystem::resize_file(packet.preview.path, previewSize / 2);
    if (rt4dVerifyReviewPacket(packet, &error))
        return fail("truncated preview was accepted");
    if (error.find("sha256") == std::string::npos &&
        error.find("truncated") == std::string::npos)
        return fail("truncated preview error was not integrity-related");

    RT4DFailureReceipt failure;
    failure.operation = "verify_review_packet";
    failure.path = packet.preview.path;
    failure.status = "empty_or_truncated";
    failure.detail = error;
    const std::string failurePath = (root / "failure.json").string();
    if (!rt4dWriteFailureReceipt(failurePath, failure, &error))
        return fail("failure receipt was not published");
    if (!std::filesystem::exists(failurePath))
        return fail("failure receipt missing");

    std::fprintf(stderr, "[evidence] PASS: sha256, publish governance, verifier\n");
    return 0;
}
