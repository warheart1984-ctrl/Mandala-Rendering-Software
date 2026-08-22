// Debug_HoloTiles.frag
// Status: declared. Cornell sanity scene: mrs/demo/scene-configs/cornell4d.json
// No Polar screenshot.

layout(location = 0) in vec2 fragUV;
layout(location = 0) out vec4 outColor;
layout(rgba16f, binding = 0) uniform sampler2D rt4dColorTex;
layout(std140, binding = 1) uniform DebugUBO {
    uint holoResX;
    uint holoResY;
    uint tileSizeX;
    uint tileSizeY;
    uint debugMode; // 0=grid, 1=intensity, 2=phase
};
layout(std430, binding = 2) buffer HoloField {
    ComplexFieldPixel field[];
};

void main() {
    vec4 base = texture(rt4dColorTex, fragUV);
    uint px = uint(fragUV.x * float(holoResX));
    uint py = uint(fragUV.y * float(holoResY));
    uint idx = py * holoResX + px;
    // Tile border detection
    uint localX = px % tileSizeX;
    uint localY = py % tileSizeY;
    bool onBorder = (localX == 0u || localY == 0u);
    vec4 overlay = base;
    // Wavefield intensity
    vec2 E = vec2(field[idx].real, field[idx].imag);
    float intensity = length(E);
    // Phase
    float phase = atan(E.y, E.x); // [-pi, pi]
    float phaseNorm = (phase + 3.14159265) / (2.0 * 3.14159265);
    if (debugMode == 1u) {
        // Heatmap tint
        vec3 heat = vec3(intensity) * vec3(1.0, 0.5, 0.1);
        overlay.rgb = mix(overlay.rgb, overlay.rgb + heat, 0.3);
    }
    else if (debugMode == 2u) {
        // Phase → hue
        overlay.rgb = vec3(phaseNorm, 1.0 - phaseNorm, 0.5);
    }
    if (onBorder) {
        overlay.rgb = vec3(0.0, 1.0, 0.0); // neon green tile grid
    }
    outColor = overlay;
}
