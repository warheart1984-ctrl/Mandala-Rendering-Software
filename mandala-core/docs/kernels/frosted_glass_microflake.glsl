// Mandala - Frosted glass microflake BRDF - GLSL
#version 450
layout(local_size_x = 256) in;

layout(binding = 0) buffer Normals { vec3 normals[]; };
layout(binding = 1) buffer Roughness { float roughness[]; };
layout(binding = 2) buffer IOR { float ior[]; };
layout(binding = 3) buffer OutBRDF { float out_brdf[]; };

void main() {
    uint idx = gl_GlobalInvocationID.x;
    vec3 nrm = normals[idx];
    float r = roughness[idx];
    float eta = ior[idx];
    float micro_normal = 1.0 / (1.0 + r * r * 16.0);
    float fresnel = pow(1.0 - abs(dot(nrm, vec3(0,0,1))), 5.0);
    float brdf = micro_normal * (0.7 + 0.3 * fresnel) * (2.0 / (eta*eta + 1.0));
    out_brdf[idx] = brdf;
}
