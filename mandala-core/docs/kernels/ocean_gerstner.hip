// Mandala - Ocean Gerstner wave assist kernel

__global__ void ocean_gerstner_kernel(
    float3* positions,
    float* time,
    float* amplitude,
    float* wavelength,
    float* direction,
    float3* out_displacement,
    const int n
) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx >= n) return;

    float3 p = positions[idx];
    float t = time ? time[idx] : 0.0f;
    float amp = amplitude ? amplitude[idx] : 1.0f;
    float wl = wavelength ? wavelength[idx] : 10.0f;
    float dir = direction ? direction[idx] : 0.0f;

    float k = 2.0f * 3.14159265f / wl;
    float phase = k * (p.x * cosf(dir) + p.z * sinf(dir)) - k * 9.8f / sqrtf(k) * t;

    float sinp = sinf(phase);
    float cosp = cosf(phase);

    float3 disp;
    disp.x = amp * sinf(dir) * sinp;
    disp.y = amp * cosp;
    disp.z = amp * cosf(dir) * sinp;

    out_displacement[idx] = disp;
}
