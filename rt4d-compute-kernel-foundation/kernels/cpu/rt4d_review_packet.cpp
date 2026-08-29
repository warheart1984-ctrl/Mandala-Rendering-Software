#include "kernels/cpu/rt4d_review_packet.h"

#include "kernels/cpu/rt4d_evidence.h"
#include "kernels/cpu/rt4d_sha256.h"

#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <sstream>
#include <vector>

namespace {

bool extractString(const std::string& json, const std::string& key,
                    std::string& value) {
    const std::string needle = "\"" + key + "\": \"";
    const auto pos = json.find(needle);
    if (pos == std::string::npos) return false;
    const size_t start = pos + needle.size();
    const auto end = json.find('"', start);
    if (end == std::string::npos) return false;
    value = json.substr(start, end - start);
    return true;
}

bool extractNumber(const std::string& json, const std::string& key,
                    double& value) {
    const std::string needle = "\"" + key + "\": ";
    const auto pos = json.find(needle);
    if (pos == std::string::npos) return false;
    value = std::strtod(json.c_str() + pos + needle.size(), nullptr);
    return true;
}

bool extractU64(const std::string& json, const std::string& key,
                 uint64_t& value) {
    const std::string quoted = "\"" + key + "\": \"";
    const auto quotedPos = json.find(quoted);
    if (quotedPos != std::string::npos) {
        value = static_cast<uint64_t>(
            std::strtoull(json.c_str() + quotedPos + quoted.size(), nullptr, 10));
        return true;
    }
    double asDouble = 0;
    if (!extractNumber(json, key, asDouble)) return false;
    value = static_cast<uint64_t>(asDouble);
    return true;
}

std::string artifactJson(const char* name, const RT4DArtifactRef& artifact) {
    std::ostringstream out;
    out << "    \"" << name << "\": {\n"
        << "      \"path\": \"" << rt4dJsonEscape(artifact.path) << "\",\n"
        << "      \"sha256\": \"" << rt4dJsonEscape(artifact.sha256) << "\",\n"
        << "      \"fnv1a64\": \"" << artifact.fnv1a64 << "\"\n"
        << "    }";
    return out.str();
}

bool checkArtifact(const RT4DArtifactRef& artifact, const char* label,
                    std::string* error) {
    if (artifact.path.empty() || artifact.sha256.empty()) {
        if (error) *error = std::string("missing required artifact: ") + label;
        return false;
    }
    if (!std::filesystem::exists(artifact.path)) {
        if (error) *error = std::string("missing file: ") + artifact.path;
        return false;
    }
    std::string hashError;
    const std::string actual =
        rt4dSha256Hex(rt4dSha256File(artifact.path, &hashError));
    if (actual != artifact.sha256) {
        if (error) *error = std::string("sha256 mismatch: ") + label;
        return false;
    }
    return true;
}

RT4DArtifactRef fromPublish(const RT4DPublishResult& published) {
    RT4DArtifactRef ref;
    ref.path = published.path;
    ref.sha256 = published.sha256;
    ref.fnv1a64 = published.fnv1a64;
    return ref;
}

}  // namespace

bool rt4dWriteObj(const RT4DPentachoronSlice3D& slice, std::string& text) {
    std::ostringstream out;
    out << "# rt4d diagnostic slice topology="
        << rt4dSliceTopologyName(slice.topology) << " w=" << slice.sliceW
        << " primitive=" << slice.primitiveId << "\n";
    for (const RT4DVec3& v : slice.vertices)
        out << "v " << v.x << ' ' << v.y << ' ' << v.z << "\n";
    for (const RT4DSliceTriangle3D& face : slice.faces)
        out << "f " << (face.indices[0] + 1) << ' ' << (face.indices[1] + 1)
            << ' ' << (face.indices[2] + 1) << "\n";
    text = out.str();
    return !slice.vertices.empty() || slice.topology == RT4DSliceTopology::empty;
}

std::string rt4dReviewPacketManifestJson(const RT4DReviewPacket& packet) {
    std::ostringstream out;
    out << "{\n"
        << "  \"schema\": \"" << rt4dJsonEscape(packet.schema) << "\",\n"
        << "  \"schemaVersion\": \"" << rt4dJsonEscape(packet.schemaVersion)
        << "\",\n"
        << "  \"sliceId\": \"" << rt4dJsonEscape(packet.sliceId) << "\",\n"
        << "  \"primitiveId\": " << packet.primitiveId << ",\n"
        << "  \"topology\": \"" << rt4dJsonEscape(packet.topology) << "\",\n"
        << "  \"hypervolume4\": " << packet.hypervolume4 << ",\n"
        << "  \"sliceVolume3\": " << packet.sliceVolume3 << ",\n"
        << "  \"sliceW\": " << packet.sliceW << ",\n"
        << "  \"imageCoverage\": " << packet.imageCoverage << ",\n"
        << "  \"boundingBox\": [" << packet.previewMinX << ", "
        << packet.previewMinY << ", " << packet.previewMaxX << ", "
        << packet.previewMaxY << "],\n"
        << "  \"fixtureType\": \"" << rt4dJsonEscape(packet.fixtureType)
        << "\",\n"
        << "  \"artifacts\": {\n"
        << artifactJson("obj", packet.obj) << ",\n"
        << artifactJson("receipt", packet.receipt) << ",\n"
        << artifactJson("preview", packet.preview) << ",\n"
        << artifactJson("sidecar", packet.sidecar) << "\n"
        << "  },\n"
        << "  \"author\": \"" << rt4dJsonEscape(packet.author) << "\",\n"
        << "  \"license\": \"" << rt4dJsonEscape(packet.license) << "\",\n"
        << "  \"creationTool\": \"" << rt4dJsonEscape(packet.creationTool)
        << "\",\n"
        << "  \"sourceHash\": \"" << rt4dJsonEscape(packet.sourceHash) << "\",\n"
        << "  \"artistReviewed\": " << (packet.artistReviewed ? "true" : "false")
        << ",\n"
        << "  \"rendererPixelAuthority\": false,\n"
        << "  \"overlayAuthoritative\": false\n"
        << "}\n";
    return out.str();
}

bool rt4dLoadReviewPacketManifest(const std::string& path,
                                 RT4DReviewPacket& packet, std::string* error) {
    std::ifstream input(path);
    if (!input) {
        if (error) *error = "cannot open review packet manifest";
        return false;
    }
    const std::string json((std::istreambuf_iterator<char>(input)),
                             std::istreambuf_iterator<char>());
    packet = {};
    packet.manifest.path = path;
    std::string hashError;
    packet.manifest.sha256 = rt4dSha256Hex(rt4dSha256File(path, &hashError));
    if (!extractString(json, "schema", packet.schema) ||
        !extractString(json, "sliceId", packet.sliceId) ||
        !extractString(json, "topology", packet.topology)) {
        if (error) *error = "manifest missing required fields";
        return false;
    }
    double primitive = 0;
    extractNumber(json, "primitiveId", primitive);
    packet.primitiveId = static_cast<uint32_t>(primitive);
    extractNumber(json, "hypervolume4", packet.hypervolume4);
    extractNumber(json, "sliceVolume3", packet.sliceVolume3);
    double sliceW = 0;
    extractNumber(json, "sliceW", sliceW);
    packet.sliceW = static_cast<float>(sliceW);
    double coverage = 0;
    extractNumber(json, "imageCoverage", coverage);
    packet.imageCoverage = static_cast<float>(coverage);
    extractString(json, "fixtureType", packet.fixtureType);
    extractString(json, "schemaVersion", packet.schemaVersion);
    extractString(json, "author", packet.author);
    extractString(json, "license", packet.license);
    extractString(json, "creationTool", packet.creationTool);
    extractString(json, "sourceHash", packet.sourceHash);
    // Parse nested artifact paths in order by searching after each key.
    auto extractArtifact = [&](const char* key, RT4DArtifactRef& artifact) {
        const std::string needle = std::string("\"") + key + "\": {";
        const auto pos = json.find(needle);
        if (pos == std::string::npos) return false;
        const std::string region = json.substr(pos, 400);
        extractString(region, "path", artifact.path);
        extractString(region, "sha256", artifact.sha256);
        extractU64(region, "fnv1a64", artifact.fnv1a64);
        return !artifact.path.empty();
    };
    extractArtifact("obj", packet.obj);
    extractArtifact("receipt", packet.receipt);
    extractArtifact("preview", packet.preview);
    extractArtifact("sidecar", packet.sidecar);
    packet.artistReviewed =
        json.find("\"artistReviewed\": true") != std::string::npos;
    packet.rendererPixelAuthority =
        json.find("\"rendererPixelAuthority\": true") != std::string::npos;
    packet.overlayAuthoritative =
        json.find("\"overlayAuthoritative\": true") != std::string::npos;
    return packet.schema == "rt4d-review-packet/0.1";
}

bool rt4dVerifyReviewPacket(const RT4DReviewPacket& packet, std::string* error) {
    if (packet.schema != "rt4d-review-packet/0.1") {
        if (error) *error = "unsupported review packet schema";
        return false;
    }
    if (packet.overlayAuthoritative || packet.rendererPixelAuthority) {
        if (error) *error = "packet claimed renderer or overlay authority";
        return false;
    }
    if (!checkArtifact(packet.obj, "obj", error)) return false;
    if (!checkArtifact(packet.receipt, "receipt", error)) return false;
    if (!checkArtifact(packet.preview, "preview", error)) return false;
    if (!checkArtifact(packet.sidecar, "sidecar", error)) return false;
    if (packet.author.empty() || packet.license.empty() ||
        packet.creationTool.empty() || packet.sourceHash.empty()) {
        if (error) *error = "missing provenance fields";
        return false;
    }
    std::ifstream previewIn(packet.preview.path, std::ios::binary);
    const std::string previewBytes((std::istreambuf_iterator<char>(previewIn)),
                                     std::istreambuf_iterator<char>());
    std::vector<uint8_t> rgb;
    std::string rgbError;
    if (!rt4dPreviewRgbFromPpm(previewBytes, rgb, &rgbError)) {
        if (error) *error = rgbError;
        return false;
    }
    std::ifstream receiptIn(packet.receipt.path);
    const std::string receiptJson((std::istreambuf_iterator<char>(receiptIn)),
                                    std::istreambuf_iterator<char>());
    std::string claimedPixelSha;
    if (extractString(receiptJson, "previewPixelSha256", claimedPixelSha)) {
        const std::string actualPixelSha =
            rt4dSha256Hex(rt4dSha256Bytes(rgb.data(), rgb.size()));
        if (actualPixelSha != claimedPixelSha) {
            if (error) *error = "preview raw-RGB sha256 mismatch";
            return false;
        }
    }
    return true;
}

bool rt4dVerifyReviewPacketFromManifest(const std::string& manifestPath,
                                          RT4DReviewPacket& packet,
                                          std::string* error) {
    if (!rt4dLoadReviewPacketManifest(manifestPath, packet, error)) return false;
    return rt4dVerifyReviewPacket(packet, error);
}

RT4DPacketIndexEntry rt4dIndexEntryFromPacket(const RT4DReviewPacket& packet,
                                               const std::string& packetDir) {
    RT4DPacketIndexEntry entry;
    entry.sliceId = packet.sliceId;
    entry.primitiveId = packet.primitiveId;
    entry.topology = packet.topology;
    entry.schemaVersion = packet.schemaVersion;
    entry.packetDir = packetDir;
    entry.manifestPath = packet.manifest.path.empty()
                             ? packetDir + "/manifest.json"
                             : packet.manifest.path;
    entry.previewPath = packet.preview.path;
    entry.sidecarPath = packet.sidecar.path;
    entry.receiptPath = packet.receipt.path;
    return entry;
}

bool rt4dBuildSliceReviewPacket(const RT4DPentachoronAsset4D& asset,
                                size_t primitiveIndex, float sliceW,
                                const std::string& packetDir,
                                RT4DReviewPacket& packet, std::string* error) {
    if (primitiveIndex >= asset.primitives.size()) {
        if (error) *error = "primitive index out of range";
        return false;
    }
    std::error_code fsError;
    std::filesystem::create_directories(packetDir, fsError);
    if (fsError) {
        if (error) *error = fsError.message();
        return false;
    }
    const RT4DPentachoronPrimitive4D& primitive =
        asset.primitives[primitiveIndex];
    RT4DPentachoronSlice3D slice;
    if (!rt4dSlicePentachoronAtW(primitive, sliceW, slice, error)) return false;
    RT4DPreviewImage preview;
    if (!rt4dRasterizeSlicePreview(slice, preview, error)) return false;
    std::string objText;
    rt4dWriteObj(slice, objText);
    if (slice.topology == RT4DSliceTopology::empty)
        objText = "# empty diagnostic slice\n";

    packet = {};
    packet.sliceId = "slice-" + std::to_string(primitive.id) + "-w" +
                      std::to_string(static_cast<int>(sliceW * 1000.0f));
    packet.primitiveId = primitive.id;
    packet.topology = rt4dSliceTopologyName(slice.topology);
    packet.hypervolume4 = slice.hypervolume4;
    packet.sliceVolume3 = slice.sliceVolume3;
    packet.sliceW = sliceW;
    packet.imageCoverage = preview.imageCoverage;
    packet.previewMinX = preview.minX;
    packet.previewMinY = preview.minY;
    packet.previewMaxX = preview.maxX;
    packet.previewMaxY = preview.maxY;
    packet.fixtureType = preview.fixtureType;
    packet.artistReviewed = asset.artistReviewed;
    packet.sourceHash = asset.sourceHash;
    if (packet.sourceHash.empty())
        packet.sourceHash = rt4dSha256Hex(
            rt4dSha256Bytes(objText.data(), objText.size()));
    packet.author = asset.author.empty() ? "system" : asset.author;
    packet.license = asset.license.empty() ? "MIT" : asset.license;
    packet.creationTool = "rt4d-diagnostic-cli";

    const std::string objPath = packetDir + "/slice.obj";
    const std::string previewPath = packetDir + "/preview.ppm";
    const std::string receiptPath = packetDir + "/receipt.json";
    const std::string sidecarCopy = packetDir + "/sidecar.rt4d";
    const std::string manifestPath = packetDir + "/manifest.json";

    auto publishOrFail = [&](const std::string& path, const std::string& text,
                              RT4DArtifactRef& ref) {
        const RT4DPublishResult published = rt4dPublishText(path, text);
        if (published.status != RT4DPublishStatus::published) {
            if (error) *error = published.detail;
            return false;
        }
        ref = fromPublish(published);
        return true;
    };

    if (!publishOrFail(objPath, objText, packet.obj)) return false;
    if (!publishOrFail(previewPath, rt4dPreviewPpm(preview), packet.preview))
        return false;

    std::ostringstream receipt;
    receipt << "{\n"
            << "  \"schema\": \"rt4d-slice-receipt/0.1\",\n"
            << "  \"mode\": \"diagnostic_only\",\n"
            << "  \"sliceId\": \"" << rt4dJsonEscape(packet.sliceId) << "\",\n"
            << "  \"primitiveId\": " << packet.primitiveId << ",\n"
            << "  \"topology\": \"" << packet.topology << "\",\n"
            << "  \"hypervolume4\": " << packet.hypervolume4 << ",\n"
            << "  \"sliceVolume3\": " << packet.sliceVolume3 << ",\n"
            << "  \"sliceW\": " << packet.sliceW << ",\n"
            << "  \"imageCoverage\": " << packet.imageCoverage << ",\n"
            << "  \"fixtureType\": \"" << packet.fixtureType << "\",\n"
            << "  \"previewPixelSha256\": \"" << preview.pixelSha256 << "\",\n"
            << "  \"author\": \"" << rt4dJsonEscape(packet.author) << "\",\n"
            << "  \"license\": \"" << rt4dJsonEscape(packet.license) << "\",\n"
            << "  \"creationTool\": \"" << rt4dJsonEscape(packet.creationTool)
            << "\",\n"
            << "  \"sourceHash\": \"" << rt4dJsonEscape(packet.sourceHash)
            << "\",\n"
            << "  \"artistReviewed\": "
            << (packet.artistReviewed ? "true" : "false") << ",\n"
            << "  \"rendererPixelAuthority\": false\n"
            << "}\n";
    if (!publishOrFail(receiptPath, receipt.str(), packet.receipt)) return false;

    std::ostringstream sidecarText;
    sidecarText << "schema rt4d-pentachoron-sidecar/0.1\n"
                 << "provenance "
                 << (asset.provenance.empty()
                         ? "generated_diagnostic_fixture_declared_unreviewed"
                         : asset.provenance)
                 << "\n"
                 << "artist_reviewed "
                 << (asset.artistReviewed ? "true" : "false") << "\n";
    const RT4DPentachoronPrimitive4D& p = primitive;
    sidecarText << "pentachoron " << p.id << ' ' << p.vertex0.x << ' '
                 << p.vertex0.y << ' ' << p.vertex0.z << ' ' << p.vertex0.w
                 << ' ' << p.vertex1.x << ' ' << p.vertex1.y << ' '
                 << p.vertex1.z << ' ' << p.vertex1.w << ' ' << p.vertex2.x
                 << ' ' << p.vertex2.y << ' ' << p.vertex2.z << ' '
                 << p.vertex2.w << ' ' << p.vertex3.x << ' ' << p.vertex3.y
                 << ' ' << p.vertex3.z << ' ' << p.vertex3.w << ' '
                 << p.vertex4.x << ' ' << p.vertex4.y << ' ' << p.vertex4.z
                 << ' ' << p.vertex4.w << "\n";
    if (!publishOrFail(sidecarCopy, sidecarText.str(), packet.sidecar))
        return false;

    const std::string manifest = rt4dReviewPacketManifestJson(packet);
    if (!publishOrFail(manifestPath, manifest, packet.manifest)) return false;
    return true;
}

bool rt4dWritePacketIndex(const std::string& path,
                            const std::vector<RT4DPacketIndexEntry>& entries,
                            std::string* error) {
    std::ostringstream json;
    json << "{\n  \"schema\": \"rt4d-review-index/0.1\",\n  \"mode\": "
            "\"diagnostic_only\",\n  \"packets\": [\n";
    for (size_t i = 0; i < entries.size(); ++i) {
        const RT4DPacketIndexEntry& e = entries[i];
        json << "    {\"sliceId\": \"" << rt4dJsonEscape(e.sliceId)
             << "\", \"primitiveId\": " << e.primitiveId << ", \"topology\": \""
             << rt4dJsonEscape(e.topology) << "\", \"schemaVersion\": \""
             << rt4dJsonEscape(e.schemaVersion) << "\", \"packetDir\": \""
             << rt4dJsonEscape(e.packetDir) << "\", \"manifestPath\": \""
             << rt4dJsonEscape(e.manifestPath) << "\", \"previewPath\": \""
             << rt4dJsonEscape(e.previewPath) << "\", \"sidecarPath\": \""
             << rt4dJsonEscape(e.sidecarPath) << "\", \"receiptPath\": \""
             << rt4dJsonEscape(e.receiptPath) << "\"}";
        if (i + 1 != entries.size()) json << ",";
        json << "\n";
    }
    json << "  ]\n}\n";
    const RT4DPublishResult published = rt4dPublishText(path, json.str());
    if (published.status != RT4DPublishStatus::published) {
        if (error) *error = published.detail;
        return false;
    }
    return true;
}

bool rt4dLoadPacketIndex(const std::string& path,
                            std::vector<RT4DPacketIndexEntry>& entries,
                            std::string* error) {
    std::ifstream input(path);
    if (!input) {
        if (error) *error = "cannot open review index";
        return false;
    }
    const std::string json((std::istreambuf_iterator<char>(input)),
                             std::istreambuf_iterator<char>());
    entries.clear();
    size_t pos = 0;
    while (true) {
        const auto slicePos = json.find("\"sliceId\": \"", pos);
        if (slicePos == std::string::npos) break;
        RT4DPacketIndexEntry entry;
        const std::string region = json.substr(slicePos, 800);
        extractString(region, "sliceId", entry.sliceId);
        double primitive = 0;
        extractNumber(region, "primitiveId", primitive);
        entry.primitiveId = static_cast<uint32_t>(primitive);
        extractString(region, "topology", entry.topology);
        extractString(region, "schemaVersion", entry.schemaVersion);
        extractString(region, "packetDir", entry.packetDir);
        extractString(region, "manifestPath", entry.manifestPath);
        extractString(region, "previewPath", entry.previewPath);
        extractString(region, "sidecarPath", entry.sidecarPath);
        extractString(region, "receiptPath", entry.receiptPath);
        entries.push_back(entry);
        pos = slicePos + 12;
    }
    return true;
}
