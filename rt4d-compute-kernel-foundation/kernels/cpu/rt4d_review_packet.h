#pragma once

#include "kernels/cpu/rt4d_preview.h"
#include "kernels/cpu/rt4d_slice.h"

#include <string>
#include <vector>

struct RT4DArtifactRef {
    std::string path;
    std::string sha256;
    uint64_t fnv1a64 = 0;
};

struct RT4DReviewPacket {
    std::string schema = "rt4d-review-packet/0.1";
    std::string schemaVersion = "1";
    std::string sliceId;
    uint32_t primitiveId = 0;
    std::string topology;
    double hypervolume4 = 0.0;
    double sliceVolume3 = 0.0;
    float sliceW = 0.0f;
    float imageCoverage = 0.0f;
    int previewMinX = 0;
    int previewMinY = 0;
    int previewMaxX = -1;
    int previewMaxY = -1;
    std::string fixtureType;
    RT4DArtifactRef obj;
    RT4DArtifactRef receipt;
    RT4DArtifactRef preview;
    RT4DArtifactRef sidecar;
    RT4DArtifactRef manifest;
    std::string author = "system";
    std::string license = "MIT";
    std::string creationTool = "rt4d-diagnostic-cli";
    std::string sourceHash;
    bool artistReviewed = false;
    bool rendererPixelAuthority = false;
    bool overlayAuthoritative = false;
};

struct RT4DPacketIndexEntry {
    std::string sliceId;
    uint32_t primitiveId = 0;
    std::string topology;
    std::string schemaVersion;
    std::string packetDir;
    std::string manifestPath;
    std::string previewPath;
    std::string sidecarPath;
    std::string receiptPath;
};

bool rt4dWriteObj(const RT4DPentachoronSlice3D& slice, std::string& text);
std::string rt4dReviewPacketManifestJson(const RT4DReviewPacket& packet);
bool rt4dLoadReviewPacketManifest(const std::string& path,
                                  RT4DReviewPacket& packet, std::string* error);
bool rt4dVerifyReviewPacket(const RT4DReviewPacket& packet, std::string* error);
bool rt4dVerifyReviewPacketFromManifest(const std::string& manifestPath,
                                          RT4DReviewPacket& packet,
                                          std::string* error);

bool rt4dBuildSliceReviewPacket(const RT4DPentachoronAsset4D& asset,
                                 size_t primitiveIndex, float sliceW,
                                 const std::string& packetDir,
                                 RT4DReviewPacket& packet, std::string* error);

RT4DPacketIndexEntry rt4dIndexEntryFromPacket(const RT4DReviewPacket& packet,
                                               const std::string& packetDir);

bool rt4dWritePacketIndex(const std::string& path,
                             const std::vector<RT4DPacketIndexEntry>& entries,
                             std::string* error);
bool rt4dLoadPacketIndex(const std::string& path,
                           std::vector<RT4DPacketIndexEntry>& entries,
                           std::string* error);
