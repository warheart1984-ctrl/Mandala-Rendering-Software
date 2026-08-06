/** Stub: TAO VLM — assistOnly, no live GPU. */
module.exports = async function taoVlm(task) {
  return {
    assistOnly: true,
    nonAuthoritative: true,
    mode: "tao_vlm_stub",
    capability: "gpu.inference.nvidia.tao",
    status: "declared",
    task,
  };
};
