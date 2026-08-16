// Mandala - Iridescent thin-film interference assist kernel

__global__ void iridescent_thin_film_kernel(
    float* thickness,
    float* wavelength,
    float3* normal,
    float3* out_color,
    const int n
) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx >= n) return;

    float t = thickness[idx];
    float wl = wavelength ? wavelength[idx] : 550.0f;
    float3 nrm = normal[idx];

    // Simplified thin-film interference
    float phase = 4.0f * 3.14159265f * t / wl;
    float interference = 0.5f * (1.0f + cosf(phase));

    float3 base = make_float3(0.8f, 0.7f, 1.0f);
    float3 color = base * interference;

    // Fresnel bias
    float fresnel = powf(1.0f - fabsf(dot(nrm, make_float3(0,0,1))), 3.0f);
    color = color + make_float3(fresnel * 0.3f, fresnel * 0.3f, fresnel * 0.5f);

    out_color[idx] = color;
}
