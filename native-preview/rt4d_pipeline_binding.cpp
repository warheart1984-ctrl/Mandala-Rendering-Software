#include "VulkanComputeEngine.h"
#include <fstream>
#include <vector>

std::vector<uint32_t> readSpirv(const std::string& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) return {};
    file.seekg(0, std::ios::end);
    size_t size = file.tellg();
    file.seekg(0, std::ios::beg);
    std::vector<uint32_t> data(size/4);
    file.read(reinterpret_cast<char*>(data.data()), size);
    return data;
}

bool VulkanComputeEngine::createRT4DPipelines() {
    std::vector<VkPipeline> pipelines;
    struct ShaderInfo { std::string spvName; RT4DPassType type; };
    std::vector<ShaderInfo> shaders = {
        {"spirv_rt4d/RAYGEN.spv", RT4DPassType::RAYGEN},
        {"spirv_rt4d/BVH.spv", RT4DPassType::BVH},
        {"spirv_rt4d/SHADE.spv", RT4DPassType::SHADE},
        {"spirv_rt4d/RESOLVE.spv", RT4DPassType::RESOLVE}
    };
    
    for (auto& s : shaders) {
        auto code = readSpirv(s.spvName);
        if (code.empty()) continue;
        
        VkShaderModuleCreateInfo moduleInfo{};
        moduleInfo.sType = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO;
        moduleInfo.codeSize = code.size() * sizeof(uint32_t);
        moduleInfo.pCode = code.data();
        
        VkShaderModule mod;
        vkCreateShaderModule(device_, &moduleInfo, nullptr, &mod);
        
        VkPipelineShaderStageCreateInfo stage{};
        stage.sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
        stage.stage = VK_SHADER_STAGE_COMPUTE_BIT;
        stage.module = mod;
        stage.pName = "main";
        
        VkComputePipelineCreateInfo pipeInfo{};
        pipeInfo.sType = VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO;
        pipeInfo.stage = stage;
        pipeInfo.layout = rt4dPipelineLayout_;
        
        VkPipeline pipe;
        vkCreateComputePipelines(device_, VK_NULL_HANDLE, 1, &pipeInfo, nullptr, &pipe);
        rt4dPipelines[static_cast<int>(s.type)] = pipe;
        vkDestroyShaderModule(device_, mod, nullptr);
    }
    return true;
}
