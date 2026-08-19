/**
 * Native Vulkan Benchmark - Optimized Configuration (Working with real SPIR-V)
 */

#include "VulkanComputeEngine.h"
#include <chrono>
#include <iostream>
#include <fstream>
#include <vector>

std::vector<uint32_t> loadSpirv(const char* filename) {
    std::ifstream file(filename, std::ios::binary | std::ios::ate);
    if (!file) {
        std::cerr << "Failed to open " << filename << "\n";
        return {};
    }
    size_t size = file.tellg();
    file.seekg(0, std::ios::beg);
    std::vector<uint32_t> buffer(size / 4);
    file.read(reinterpret_cast<char*>(buffer.data()), size);
    return buffer;
}

int main() {
    std::cout << "=== RX 480 Optimized Benchmark ===\n";
    std::cout << "Configuration: OPTIMIZED (all levers enabled)\n\n";
    
    VulkanComputeEngine engine;
    
    VulkanComputeConfig cfg{};
    cfg.width = 640;
    cfg.height = 480;
    cfg.maxFramesInFlight = 2;
    cfg.enableValidation = false;
    
    cfg.enableAsyncCompute = true;
    cfg.enableTimelineSemaphores = true;
    cfg.enableBindless = true;
    
    if (!engine.init(cfg)) {
        std::cerr << "Failed to init VulkanComputeEngine\n";
        return 1;
    }
    
    auto deviceInfo = engine.getDeviceInfo();
    std::cout << "GPU: " << deviceInfo.deviceName << "\n";
    std::cout << "VRAM: " << (deviceInfo.vramSize / 1024 / 1024) << " MB\n\n";
    
    auto spirv = loadSpirv("test_shader.spv");
    if (spirv.empty()) {
        std::cerr << "Failed to load SPIR-V\n";
        return 1;
    }
    
    uint32_t shaderId = engine.createShaderModule(spirv.data(), spirv.size() * 4, "test");
    if (shaderId == 0) {
        std::cerr << "Failed to create shader module\n";
        return 1;
    }
    
    uint32_t pipelineId = engine.createComputePipeline(shaderId, 64, 1, 1, "test-pipeline");
    if (pipelineId == 0) {
        std::cerr << "Failed to create pipeline\n";
        return 1;
    }
    
    uint32_t bufferId = engine.createBuffer(1024 * 1024, true, nullptr);
    if (bufferId == 0) {
        std::cerr << "Failed to create buffer\n";
        return 1;
    }
    
    std::cout << "Running OPTIMIZED benchmark (100 dispatches)...\n";
    
    for (int i = 0; i < 5; i++) {
        engine.dispatchKernel(pipelineId, 4, 1, 1, {});
    }
    
    const int iterations = 100;
    auto start = std::chrono::high_resolution_clock::now();
    
    for (int i = 0; i < iterations; i++) {
        engine.dispatchKernel(pipelineId, 4, 1, 1, {});
    }
    
    auto end = std::chrono::high_resolution_clock::now();
    double totalMs = std::chrono::duration<double, std::milli>(end - start).count();
    double avgMs = totalMs / iterations;
    
    std::cout << "\nResults (" << iterations << " dispatches):\n";
    std::cout << "  Total time: " << totalMs << " ms\n";
    std::cout << "  Average: " << avgMs << " ms\n";
    
    engine.shutdown();
    return 0;
}
