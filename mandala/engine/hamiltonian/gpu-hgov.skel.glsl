#version 450
// H_gov Jacobi relaxation — DECLARED skeleton, not dispatched.
// Status: declared. Not claimed to run on RX 580 / Polaris / any live GPU.
// One invocation per node. CSR adjacency: offsets[], indices[], Jij[].
// Read sigma_in (r,a,e,c,t,jFit), write sigma_out, then swap buffers.
// Do not Gauss-Seidel in-place. W already contains 1/2.
// Jurisdiction coordinate is jFit — do not reuse neighbor index j.

layout(local_size_x = 64) in;

layout(std430, binding = 0) readonly buffer SigmaIn { float sigma_in[]; };   // 6 floats per node
layout(std430, binding = 1) writeonly buffer SigmaOut { float sigma_out[]; };
layout(std430, binding = 2) readonly buffer Offsets { uint offsets[]; };
layout(std430, binding = 3) readonly buffer Indices { uint indices[]; };
layout(std430, binding = 4) readonly buffer Coupling { float Jij[]; };
layout(std430, binding = 5) readonly buffer Params { float alpha[6]; float w[6]; float eta; uint n; };

void main() {
  uint i = gl_GlobalInvocationID.x;
  if (i >= n) return;
  // on-site + Σ_j J_ij w_k (x_i − x_j), then clamp01(x − eta * dH). Stub only.
  uint base = i * 6u;
  for (uint k = 0u; k < 6u; k++) sigma_out[base + k] = sigma_in[base + k];
}
