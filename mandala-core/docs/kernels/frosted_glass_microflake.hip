// Mandala - Frosted glass microflake BRDF assist kernel
// HIP assist-only: computes evidence, no authority

__global__ void frosted_glass_microflake_kernel(
    float3* normals,
    float* roughness,
    float* ior,
    float* out_brdf,
    const int n
) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx >= n) return;

    float3 nrm = normals[idx];
    float r = roughness ? roughness[idx] : 0.2f;
    float eta = ior ? ior[idx] : 1.5f;

    // Microflake anisotropy approximation
    float micro_normal = 1.0f / (1.0f + r * r * 16.0f);
    float fresnel = powf(1.0f - fabsf(dot(nrm, make_float3(0,0,1))), 5.0f);
    float brdf = micro_normal * (0.7f + 0.3f * fresnel) * (2.0f / (eta*eta + 1.0f));

    out_brdf[idx] = brdf;
}
