// Debug_WSlice.comp
// Status: declared.
// pixelId % holoResX is valid only when frameWidth == holoResX (aligned same-res).
// Scaled mode must use BinPaths holoX/Y — do not silently mismatch.

layout(local_size_x = 16, local_size_y = 16) in;
layout(std140, binding = 0) uniform DebugUBO {
    uint holoResX;
    uint holoResY;
    float wMin;
    float wMax;
};
layout(std430, binding = 1) buffer PathBuffer {
    PathSample paths[];
};
layout(std430, binding = 5) buffer WSliceField {
    float wSlice[]; // per hologram pixel
};
void main() {
    uint idx = gl_GlobalInvocationID.x;
    PathSample p = paths[idx];
    // map W to [0,1]
    float wNorm = clamp((p.w - wMin) / (wMax - wMin), 0.0, 1.0);
    // project to hologram pixel
    uint px = p.pixelId % holoResX;
    uint py = p.pixelId / holoResX;
    uint pixelIndex = py * holoResX + px;
    atomicAdd(wSlice[pixelIndex], wNorm);
}
