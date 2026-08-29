#include "kernels/cpu/rt4d_kernel_contract.h"

#include "kernels/cpu/rt4d_evidence.h"
#include "kernels/cpu/rt4d_sha256.h"

#include <sstream>

bool rt4dMigratePentachoronSidecarV1ToV2(const std::string& sourcePath,
                                          const std::string& destinationPath,
                                          std::string* error) {
    RT4DPentachoronAsset4D asset;
    if (!rt4dLoadPentachoronSidecar(sourcePath, asset, error)) return false;
    if (asset.schema != "rt4d-pentachoron-sidecar/0.1") {
        if (error) *error = "migration requires sidecar-v1";
        return false;
    }
    if (asset.provenance.empty()) {
        if (error) *error = "refusing to drop provenance during migration";
        return false;
    }
    std::string hashError;
    const std::string sourceHash =
        rt4dSha256Hex(rt4dSha256File(sourcePath, &hashError));
    std::ostringstream text;
    text << "schema rt4d-pentachoron-sidecar/0.2\n"
         << "schemaVersion 2\n"
         << "migrationPath rt4d-pentachoron-sidecar/0.1->0.2\n"
         << "provenance " << asset.provenance << "\n"
         << "author system\n"
         << "license MIT\n"
         << "creationTool rt4d-diagnostic-cli\n"
         << "sourceHash " << sourceHash << "\n"
         << "artist_reviewed " << (asset.artistReviewed ? "true" : "false")
         << "\n";
    for (const RT4DPentachoronPrimitive4D& primitive : asset.primitives) {
        text << "pentachoron " << primitive.id << ' ' << primitive.vertex0.x
             << ' ' << primitive.vertex0.y << ' ' << primitive.vertex0.z << ' '
             << primitive.vertex0.w << ' ' << primitive.vertex1.x << ' '
             << primitive.vertex1.y << ' ' << primitive.vertex1.z << ' '
             << primitive.vertex1.w << ' ' << primitive.vertex2.x << ' '
             << primitive.vertex2.y << ' ' << primitive.vertex2.z << ' '
             << primitive.vertex2.w << ' ' << primitive.vertex3.x << ' '
             << primitive.vertex3.y << ' ' << primitive.vertex3.z << ' '
             << primitive.vertex3.w << ' ' << primitive.vertex4.x << ' '
             << primitive.vertex4.y << ' ' << primitive.vertex4.z << ' '
             << primitive.vertex4.w << "\n";
    }
    const RT4DPublishResult published = rt4dPublishText(destinationPath, text.str());
    if (published.status != RT4DPublishStatus::published) {
        if (error) *error = published.detail;
        return false;
    }
    RT4DPentachoronAsset4D migrated;
    if (!rt4dLoadPentachoronSidecar(destinationPath, migrated, error))
        return false;
    if (migrated.provenance != asset.provenance) {
        if (error) *error = "migration dropped provenance";
        return false;
    }
    return true;
}
