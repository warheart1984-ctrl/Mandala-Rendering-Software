/**
 * Native Vulkan Benchmark - Optimized Configuration with GPU Timing
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
    std::cout << "=== RX 480 Optimized Benchmark (GPU Timed) ===\n";
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
    uint32_t pipelineId = engine.createComputePipeline(shaderId, 64, 1, 1, "test-pipeline");
    uint32_t bufferId = engine.createBuffer(1024 * 1024, true, nullptr);
    
    std::cout << "Running OPTIMIZED benchmark with GPU timing...\n";
    std::cout << "Testing with 256 workgroups (16384 threads)\n\n";
    
    const int iterations = 20;
    std::vector<double> times;
    
    for (int i = 0; i < iterations; i++) {
        double gpuTime = 0;
        engine.dispatchKernelTimed(pipelineId, 256, 1, 1, {}, gpuTime);
        times.push_back(gpuTime);
        if (i % 5 == 0) {
            std::cout << "  Iteration " << i << ": " << gpuTime << " ms\n";
        }
    }
    
    double sum = 0;
    double min = times[0];
    double max = times[0];
    for (double t : times) {
        sum += t;
        if (t < min) min = t;
        if (t > max) max = t;
    }
    double avg = sum / times.size();
    
    std::cout << "\nOptimized Results:\n";
    std::cout << "  Average GPU time: " << avg << " ms\n";
    std::cout << "  Min: " << min << " ms\n";
    std::cout << "  Max: " << max << " ms\n";
    
    engine.shutdown();
    return 0;
}
