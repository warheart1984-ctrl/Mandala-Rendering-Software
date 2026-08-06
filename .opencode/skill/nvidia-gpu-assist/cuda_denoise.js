/** Stub: CUDA denoise — assistOnly, no live GPU. */
module.exports = async function cudaDenoise(task) {
  return {
    assistOnly: true,
    nonAuthoritative: true,
    mode: "cuda_denoise_stub",
    capability: "gpu.compute.nvidia.cuda",
    status: "declared",
    task,
  };
};
