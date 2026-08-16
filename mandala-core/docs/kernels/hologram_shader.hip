// Mandala - Hologram shader assist kernel

__global__ void hologram_shader_kernel(
    float3* uv,
    float* time,
    float* scanlines,
    float3* out_color,
    const int n
) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx >= n) return;

    float3 u = uv[idx];
    float t = time ? time[idx] : 0.0f;
    float s = scanlines ? scanlines[idx] : 200.0f;

    float scan = sinf(u.y * s + t * 2.0f) * 0.5f + 0.5f;
    float flicker = 0.8f + 0.2f * sinf(t * 50.0f + u.x * 10.0f);

    float3 cyan = make_float3(0.0f, 1.0f, 1.0f);
    float3 magenta = make_float3(1.0f, 0.0f, 1.0f);

    float3 color = cyan * scan + magenta * (1.0f - scan);
    color = color * flicker;

    // Fresnel rim
    float rim = 1.0f - fabsf(u.y);
    color = color + make_float3(rim * 0.5f, rim * 0.3f, rim * 0.7f);

    out_color[idx] = color;
}
