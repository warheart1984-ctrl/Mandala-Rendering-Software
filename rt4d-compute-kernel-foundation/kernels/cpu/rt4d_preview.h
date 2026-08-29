#pragma once

#include "kernels/cpu/rt4d_slice.h"

#include <cstdint>
#include <string>
#include <vector>

constexpr int RT4D_PREVIEW_WIDTH = 64;
constexpr int RT4D_PREVIEW_HEIGHT = 64;

struct RT4DPreviewImage {
    int width = RT4D_PREVIEW_WIDTH;
    int height = RT4D_PREVIEW_HEIGHT;
    std::vector<uint8_t> rgb;  // width * height * 3, row-major
    float imageCoverage = 0.0f;
    int minX = 0;
    int minY = 0;
    int maxX = -1;
    int maxY = -1;
    std::string fixtureType;
    std::string pixelSha256;
};

// Deterministic CPU-only raster. Fixed camera and lighting. Not ground truth.
bool rt4dRasterizeSlicePreview(const RT4DPentachoronSlice3D& slice,
                                RT4DPreviewImage& output, std::string* error);

std::string rt4dPreviewPpm(const RT4DPreviewImage& image);
bool rt4dPreviewRgbFromPpm(const std::string& ppm, std::vector<uint8_t>& rgb,
                              std::string* error);
