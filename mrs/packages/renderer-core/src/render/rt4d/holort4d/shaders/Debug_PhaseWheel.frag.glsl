// Debug_PhaseWheel.frag
// Status: declared. HUD quad 128×128 bottom-right.

layout(location = 0) out vec4 outColor;
layout(location = 0) in vec2 fragUV;
void main() {
    // fragUV is 0..1 inside the HUD quad
    float angle = fragUV.x * 2.0 * 3.14159265; // 0..2π
    float phaseNorm = angle / (2.0 * 3.14159265);
    // Hue wheel
    vec3 color = vec3(
        phaseNorm,
        1.0 - phaseNorm,
        0.5 + 0.5 * sin(angle)
    );
    outColor = vec4(color, 1.0);
}
