#version 450

layout(local_size_x = 64) in;

layout(std430, binding = 0) readonly buffer Matrix { float v[]; } A;
layout(std430, binding = 1) readonly buffer VectorX { float v[]; } x;
layout(std430, binding = 2) writeonly buffer VectorY { float v[]; } y;

layout(push_constant) uniform Params {
    uint M;
    uint N;
    uint pad0;
    uint pad1;
} params;

// y_i = sum_j A_ij * x_j
void main() {
    uint i = gl_GlobalInvocationID.x;
    if (i >= params.M) return;
    float acc = 0.0;
    uint row = i * params.N;
    for (uint j = 0; j < params.N; ++j) {
        acc += A.v[row + j] * x.v[j];
    }
    y.v[i] = acc;
}
