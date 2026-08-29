#include "kernels/cpu/rt4d_preview.h"

#include "kernels/cpu/rt4d_sha256.h"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <sstream>

namespace {

void putPixel(RT4DPreviewImage& image, int x, int y, uint8_t r, uint8_t g,
               uint8_t b) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
    const size_t i =
        (static_cast<size_t>(y) * static_cast<size_t>(image.width) +
         static_cast<size_t>(x)) *
        3;
    image.rgb[i] = r;
    image.rgb[i + 1] = g;
    image.rgb[i + 2] = b;
}

float edge(float ax, float ay, float bx, float by, float px, float py) {
    return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

void fillTriangle(RT4DPreviewImage& image, float ax, float ay, float bx,
                  float by, float cx, float cy, uint8_t r, uint8_t g,
                  uint8_t b) {
    const float area = edge(ax, ay, bx, by, cx, cy);
    if (std::fabs(area) <= 1.0e-8f) return;
    const float minXf = std::min(ax, std::min(bx, cx));
    const float maxXf = std::max(ax, std::max(bx, cx));
    const float minYf = std::min(ay, std::min(by, cy));
    const float maxYf = std::max(ay, std::max(by, cy));
    const int x0 = std::max(0, static_cast<int>(std::floor(minXf)));
    const int y0 = std::max(0, static_cast<int>(std::floor(minYf)));
    const int x1 = std::min(image.width - 1, static_cast<int>(std::ceil(maxXf)));
    const int y1 =
        std::min(image.height - 1, static_cast<int>(std::ceil(maxYf)));
    for (int y = y0; y <= y1; ++y) {
        for (int x = x0; x <= x1; ++x) {
            const float px = static_cast<float>(x) + 0.5f;
            const float py = static_cast<float>(y) + 0.5f;
            const float w0 = edge(bx, by, cx, cy, px, py) / area;
            const float w1 = edge(cx, cy, ax, ay, px, py) / area;
            const float w2 = edge(ax, ay, bx, by, px, py) / area;
            if (w0 < 0.0f || w1 < 0.0f || w2 < 0.0f) continue;
            putPixel(image, x, y, r, g, b);
        }
    }
}

void project(const RT4DVec3& p, float& x, float& y) {
    x = (p.x + 1.5f) * (static_cast<float>(RT4D_PREVIEW_WIDTH) / 3.0f);
    y = (p.y + 1.5f) * (static_cast<float>(RT4D_PREVIEW_HEIGHT) / 3.0f);
}

}  // namespace

bool rt4dRasterizeSlicePreview(const RT4DPentachoronSlice3D& slice,
                                RT4DPreviewImage& output, std::string* error) {
    (void)error;
    output = {};
    output.width = RT4D_PREVIEW_WIDTH;
    output.height = RT4D_PREVIEW_HEIGHT;
    output.rgb.assign(static_cast<size_t>(output.width) *
                           static_cast<size_t>(output.height) * 3,
                       0);
    output.fixtureType = rt4dSliceTopologyName(slice.topology);
    const uint8_t palette[][3] = {{220, 70, 40},  {40, 160, 80}, {50, 90, 220},
                                    {220, 180, 40}, {160, 60, 180}, {30, 180, 180}};
    for (size_t f = 0; f < slice.faces.size(); ++f) {
        const RT4DSliceTriangle3D& face = slice.faces[f];
        if (face.indices[0] >= slice.vertices.size() ||
            face.indices[1] >= slice.vertices.size() ||
            face.indices[2] >= slice.vertices.size())
            continue;
        float ax, ay, bx, by, cx, cy;
        project(slice.vertices[face.indices[0]], ax, ay);
        project(slice.vertices[face.indices[1]], bx, by);
        project(slice.vertices[face.indices[2]], cx, cy);
        const uint8_t* color = palette[f % 6];
        fillTriangle(output, ax, ay, bx, by, cx, cy, color[0], color[1],
                     color[2]);
    }
    int covered = 0;
    output.minX = output.width;
    output.minY = output.height;
    output.maxX = -1;
    output.maxY = -1;
    for (int y = 0; y < output.height; ++y) {
        for (int x = 0; x < output.width; ++x) {
            const size_t i =
                (static_cast<size_t>(y) * static_cast<size_t>(output.width) +
                 static_cast<size_t>(x)) *
                3;
            if (output.rgb[i] == 0 && output.rgb[i + 1] == 0 &&
                output.rgb[i + 2] == 0)
                continue;
            ++covered;
            output.minX = std::min(output.minX, x);
            output.minY = std::min(output.minY, y);
            output.maxX = std::max(output.maxX, x);
            output.maxY = std::max(output.maxY, y);
        }
    }
    const int total = output.width * output.height;
    output.imageCoverage =
        total > 0 ? static_cast<float>(covered) / static_cast<float>(total)
                   : 0.0f;
    output.pixelSha256 =
        rt4dSha256Hex(rt4dSha256Bytes(output.rgb.data(), output.rgb.size()));
    return true;
}

std::string rt4dPreviewPpm(const RT4DPreviewImage& image) {
    std::ostringstream out;
    out << "P6\n" << image.width << ' ' << image.height << "\n255\n";
    std::string header = out.str();
    header.append(reinterpret_cast<const char*>(image.rgb.data()),
                    image.rgb.size());
    return header;
}

bool rt4dPreviewRgbFromPpm(const std::string& ppm, std::vector<uint8_t>& rgb,
                              std::string* error) {
    const std::string marker = "\n255\n";
    const auto pos = ppm.find(marker);
    if (ppm.compare(0, 3, "P6\n") != 0 || pos == std::string::npos) {
        if (error) *error = "preview is not a P6 PPM";
        return false;
    }
    const size_t start = pos + marker.size();
    rgb.assign(ppm.begin() + static_cast<std::ptrdiff_t>(start), ppm.end());
    if (rgb.size() != static_cast<size_t>(RT4D_PREVIEW_WIDTH) *
                          static_cast<size_t>(RT4D_PREVIEW_HEIGHT) * 3) {
        if (error) *error = "preview RGB payload is truncated";
        return false;
    }
    return true;
}
