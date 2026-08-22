// Debug_WSlice.frag
// Status: declared. High W → blue, low W → red.

layout(location = 0) in vec2 fragUV;
layout(location = 0) out vec4 outColor;
layout(std140, binding = 0) uniform DebugUBO {
    uint holoResX;
    uint holoResY;
};
layout(std430, binding = 5) buffer WSliceField {
    float wSlice[];
};
void main() {
    uint px = uint(fragUV.x * float(holoResX));
    uint py = uint(fragUV.y * float(holoResY));
    uint idx = py * holoResX + px;
    float wVal = wSlice[idx];
    // map W influence to color
    outColor = vec4(wVal, 0.2, 1.0 - wVal, 1.0);
}
