const fluxGenerate = require("./flux_generate");
const taoVlm = require("./tao_vlm");
const cudaDenoise = require("./cuda_denoise");

module.exports = {
  async run(task) {
    switch (task.intent) {
      case "lookdev":
        return await fluxGenerate(task);
      case "vision_to_scenespec":
        return await taoVlm(task);
      case "gpu_denoise":
        return await cudaDenoise(task);
      default:
        return {
          assistOnly: true,
          nonAuthoritative: true,
          message: "NVIDIA assist path executed",
          task,
        };
    }
  },
};
