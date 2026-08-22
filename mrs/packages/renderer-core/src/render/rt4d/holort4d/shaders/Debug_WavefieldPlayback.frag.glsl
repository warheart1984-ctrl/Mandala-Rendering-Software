// Debug_WavefieldPlayback.frag
// Status: declared. Bounce time-lapse, not wall-clock.
// historyIndex = bounceId * (holoResX * holoResY) + pixelIndex

layout(location = 0) in vec2 fragUV;
layout(location = 0) out vec4 outColor;
layout(std140, binding = 0) uniform PlaybackUBO {
    uint holoResX;
    uint holoResY;
    uint bounceId;
};
layout(std430, binding = 4) buffer WavefieldHistory {
    ComplexFieldPixel history[];
};
void main() {
    uint px = uint(fragUV.x * float(holoResX));
    uint py = uint(fragUV.y * float(holoResY));
    uint idx = bounceId * (holoResX * holoResY) + py * holoResX + px;
    vec2 E = vec2(history[idx].real, history[idx].imag);
    float phase = atan(E.y, E.x);
    float phaseNorm = (phase + 3.14159265) / (2.0 * 3.14159265);
    outColor = vec4(phaseNorm, 1.0 - phaseNorm, 0.5, 1.0);
}
