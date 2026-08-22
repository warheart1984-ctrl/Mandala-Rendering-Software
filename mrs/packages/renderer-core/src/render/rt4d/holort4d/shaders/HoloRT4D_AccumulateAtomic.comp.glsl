// HoloRT4D_AccumulateAtomic.comp
// Status: declared. Baseline float SSBO atomicAdd.
// Polar float atomic: declared hardware gap. Integer fallback declared, not silent.

layout(local_size_x = 64) in;
layout(std140, binding = 0) uniform HoloCameraUBO { /* ... */ };
struct PathSample { /* ... */ };
layout(std430, binding = 1) buffer PathBuffer {
    PathSample paths[];
};
layout(std430, binding = 2) buffer HoloFieldBuffer {
    ComplexFieldPixel field[];
};
void main() {
    uint idx = gl_GlobalInvocationID.x;
    PathSample p = paths[idx];
    // camera-aligned: pixelIndex from pixelId (no world-to-plane)
    uint pixelIndex = /* j * resX + i */;
    float lam = (p.wl > 0.0) ? p.wl : lambda;
    float kLocal = 2.0 * 3.14159265 / lam;
    float phase = kLocal * p.opticalLength;
    float amp   = length(p.radiance) * p.weight;
    float c = cos(phase);
    float s = sin(phase);
    atomicAdd(field[pixelIndex].real, amp * c);
    atomicAdd(field[pixelIndex].imag, amp * s);
}
