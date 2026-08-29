#include "kernels/cpu/rt4d_kernel_contract.h"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <string>
#include <system_error>
#ifndef _WIN32
#include <unistd.h>
#endif

namespace {

int fail(const char* message) {
    std::fprintf(stderr, "[sidecar] FAIL: %s\n", message);
    return 1;
}

std::filesystem::path uniqueRoot() {
    const auto root =
        std::filesystem::temp_directory_path() /
        ("rt4d-sidecar-" +
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

bool writeFile(const std::string& path, const std::string& text) {
    std::ofstream output(path, std::ios::binary | std::ios::trunc);
    if (!output) return false;
    output << text;
    return static_cast<bool>(output);
}

bool loadFails(const std::string& path, const char* needle) {
    RT4DPentachoronAsset4D asset;
    std::string error;
    if (rt4dLoadPentachoronSidecar(path, asset, &error)) return false;
    return needle == nullptr || error.find(needle) != std::string::npos ||
           !error.empty();
}

}  // namespace

int main(int argc, char** argv) {
    if (argc != 2) return fail("expected sidecar-v1 fixture path");
    RT4DPentachoronAsset4D original;
    std::string error;
    if (!rt4dLoadPentachoronSidecar(argv[1], original, &error) ||
        original.schema != "rt4d-pentachoron-sidecar/0.1" ||
        original.provenance.empty())
        return fail("v1 fixture did not load");

    const auto root = uniqueRoot();
    const std::string v2 = (root / "migrated-v2.rt4d").string();
    if (!rt4dMigratePentachoronSidecarV1ToV2(argv[1], v2, &error))
        return fail(error.c_str());
    RT4DPentachoronAsset4D migrated;
    if (!rt4dLoadPentachoronSidecar(v2, migrated, &error) ||
        migrated.schema != "rt4d-pentachoron-sidecar/0.2" ||
        migrated.schemaVersion != "2" ||
        migrated.migrationPath != "rt4d-pentachoron-sidecar/0.1->0.2" ||
        migrated.provenance != original.provenance ||
        migrated.author.empty() || migrated.license.empty() ||
        migrated.creationTool.empty() || migrated.sourceHash.empty() ||
        migrated.primitives.size() != original.primitives.size())
        return fail("v1 to v2 migration dropped provenance or schema fields");

    const std::string missing = (root / "missing-schema.rt4d").string();
    writeFile(missing,
               "provenance generated_diagnostic_fixture_declared_unreviewed\n"
               "artist_reviewed false\n"
               "pentachoron 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1\n");
    if (!loadFails(missing, nullptr))
        return fail("missing schema was accepted");

    const std::string junk = (root / "extra-junk.rt4d").string();
    writeFile(junk,
               "schema rt4d-pentachoron-sidecar/0.1\n"
               "provenance generated_diagnostic_fixture_declared_unreviewed\n"
               "artist_reviewed false\n"
               "surprise 1\n"
               "pentachoron 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1\n");
    if (!loadFails(junk, "unknown"))
        return fail("unknown sidecar record was accepted");

    const std::string nanFile = (root / "nan.rt4d").string();
    writeFile(nanFile,
               "schema rt4d-pentachoron-sidecar/0.1\n"
               "provenance generated_diagnostic_fixture_declared_unreviewed\n"
               "artist_reviewed false\n"
               "pentachoron 1 0 0 0 0 nan 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1\n");
    if (!loadFails(nanFile, nullptr))
        return fail("NaN vertex was accepted");

    const std::string truncated = (root / "truncated.rt4d").string();
    writeFile(truncated,
               "schema rt4d-pentachoron-sidecar/0.1\n"
               "provenance generated_diagnostic_fixture_declared_unreviewed\n"
               "artist_reviewed false\n"
               "pentachoron 1 0 0 0 0 1 0 0\n");
    if (!loadFails(truncated, nullptr))
        return fail("truncated pentachoron record was accepted");

    const std::string dup = (root / "dup-provenance.rt4d").string();
    writeFile(dup,
               "schema rt4d-pentachoron-sidecar/0.1\n"
               "provenance generated_diagnostic_fixture_declared_unreviewed\n"
               "provenance other\n"
               "artist_reviewed false\n"
               "pentachoron 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1\n");
    if (!loadFails(dup, "duplicate"))
        return fail("duplicate provenance was accepted");

    const std::string native = (root / "native-v2.rt4d").string();
    writeFile(native,
               "schema rt4d-pentachoron-sidecar/0.2\n"
               "schemaVersion 2\n"
               "migrationPath native\n"
               "provenance generated_diagnostic_fixture_declared_unreviewed\n"
               "author system\n"
               "license MIT\n"
               "creationTool rt4d-diagnostic-cli\n"
               "sourceHash "
               "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n"
               "artist_reviewed false\n"
               "pentachoron 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1\n");
    RT4DPentachoronAsset4D nativeAsset;
    if (!rt4dLoadPentachoronSidecar(native, nativeAsset, &error) ||
        nativeAsset.migrationPath != "native")
        return fail("native sidecar-v2 did not load");

    const std::string noProvenanceV2 = (root / "v2-no-provenance.rt4d").string();
    writeFile(noProvenanceV2,
               "schema rt4d-pentachoron-sidecar/0.2\n"
               "schemaVersion 2\n"
               "migrationPath native\n"
               "author system\n"
               "license MIT\n"
               "creationTool rt4d-diagnostic-cli\n"
               "sourceHash "
               "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n"
               "artist_reviewed false\n"
               "pentachoron 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1\n");
    if (!loadFails(noProvenanceV2, nullptr))
        return fail("sidecar-v2 without provenance was accepted");

    std::fprintf(stderr, "[sidecar] PASS: fuzz corpus and v1->v2 provenance\n");
    return 0;
}
