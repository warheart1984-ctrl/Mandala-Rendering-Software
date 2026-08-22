// HoloRT4D_PhaseEncode.comp
// Status: declared GPU. CPU encodePhaseOnly is partial.
// Non-atomic. Run only after HoloField SSBO is stable.

layout(local_size_x = 16, local_size_y = 16) in;
layout(std140, binding = 0) uniform HoloCameraUBO {
    uint resX;
    uint resY;
};
layout(std430, binding = 1) buffer HoloFieldBuffer {
    ComplexFieldPixel field[];
};
layout(r16f, binding = 2) uniform image2D phaseImage;
void main() {
    ivec2 pixel = ivec2(gl_GlobalInvocationID.xy);
    if (pixel.x >= int(resX) || pixel.y >= int(resY)) return;
    uint idx = uint(pixel.y) * resX + uint(pixel.x);
    float phase = atan(field[idx].imag, field[idx].real);
    float phaseNorm = (phase + 3.14159265) / (2.0 * 3.14159265);
    imageStore(phaseImage, pixel, vec4(phaseNorm, 0.0, 0.0, 1.0));
}
