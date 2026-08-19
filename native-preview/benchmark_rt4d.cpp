/**
 * RT4D Ray Tracer Benchmark - Real Workloads
 * Tests RX 480 with actual RT4D shaders
 */

#include "VulkanComputeEngine.h"
#include <chrono>
#include <iostream>
#include <fstream>
#include <vector>
#include <numeric>

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
    std::cout << "=== RT4D Ray Tracer Benchmark ===\n";
    std::cout << "Real workloads with RT4D shaders\n\n";
    
    VulkanComputeEngine engine;
    
    VulkanComputeConfig cfg{};
    cfg.width = 1920;
    cfg.height = 1080;
    cfg.maxFramesInFlight = 2;
    cfg.enableValidation = false;
    cfg.enableAsyncCompute = false;
    cfg.enableTimelineSemaphores = false;
    cfg.enableBindless = false;
    
    if (!engine.init(cfg)) {
        std::cerr << "Failed to init VulkanComputeEngine\n";
        return 1;
    }
    
    auto deviceInfo = engine.getDeviceInfo();
    std::cout << "GPU: " << deviceInfo.deviceName << "\n";
    std::cout << "VRAM: " << (deviceInfo.vramSize / 1024 / 1024) << " MB\n\n";
    
    // Load RT4D shaders
    auto raygenSpv = loadSpirv("raygen.spv");
    auto shadeSpv = loadSpirv("shade.spv");
    
    if (raygenSpv.empty() || shadeSpv.empty()) {
        std::cerr << "Failed to load shaders\n";
        return 1;
    }
    
    uint32_t raygenShader = engine.createShaderModule(raygenSpv.data(), raygenSpv.size() * 4, "raygen");
    uint32_t shadeShader = engine.createShaderModule(shadeSpv.data(), shadeSpv.size() * 4, "shade");
    
    uint32_t raygenPipeline = engine.createComputePipeline(raygenShader, 64, 1, 1, "raygen-pipeline");
    uint32_t shadePipeline = engine.createComputePipeline(shadeShader, 64, 1, 1, "shade-pipeline");
    
    // Create buffers for 1920x1080 = 2,073,600 rays
    const uint32_t numRays = 1920 * 1080;
    const uint32_t bufferSize = numRays * sizeof(float) * 4;
    
    uint32_t rayOrigins = engine.createBuffer(bufferSize, true, nullptr);
    uint32_t rayDirs = engine.createBuffer(bufferSize, true, nullptr);
    uint32_t hitBuffer = engine.createBuffer(numRays * 16, true, nullptr);
    
    std::cout << "Testing with " << numRays << " rays (1920x1080)\n";
    std::cout << "Workgroups: " << (numRays + 63) / 64 << " (64 threads each)\n\n";
    
    const int iterations = 10;
    std::vector<double> raygenTimes, shadeTimes;
    
    // Warmup
    for (int i = 0; i < 3; i++) {
        double t;
        engine.dispatchKernelTimed(raygenPipeline, (numRays + 63) / 64, 1, 1, {}, t);
        engine.dispatchKernelTimed(shadePipeline, (numRays + 63) / 64, 1, 1, {}, t);
    }
    
    std::cout << "Ray Generation Benchmark:\n";
    for (int i = 0; i < iterations; i++) {
        double gpuTime = 0;
        engine.dispatchKernelTimed(raygenPipeline, (numRays + 63) / 64, 1, 1, {}, gpuTime);
        raygenTimes.push_back(gpuTime);
        std::cout << "  Iteration " << i << ": " << gpuTime << " ms\n";
    }
    
    std::cout << "\nShading Benchmark:\n";
    for (int i = 0; i < iterations; i++) {
        double gpuTime = 0;
        engine.dispatchKernelTimed(shadePipeline, (numRays + 63) / 64, 1, 1, {}, gpuTime);
        shadeTimes.push_back(gpuTime);
        std::cout << "  Iteration " << i << ": " << gpuTime << " ms\n";
    }
    
    auto avg = [](const std::vector<double>& v) {
        return std::accumulate(v.begin(), v.end(), 0.0) / v.size();
    };
    
    std::cout << "\n=== Results ===\n";
    std::cout << "Ray Generation:\n";
    std::cout << "  Average: " << avg(raygenTimes) << " ms\n";
    std::cout << "  Min: " << *std::min_element(raygenTimes.begin(), raygenTimes.end()) << " ms\n";
    std::cout << "  Max: " << *std::max_element(raygenTimes.begin(), raygenTimes.end()) << " ms\n";
    
    std::cout << "\nShading:\n";
    std::cout << "  Average: " << avg(shadeTimes) << " ms\n";
    std::cout << "  Min: " << *std::min_element(shadeTimes.begin(), shadeTimes.end()) << " ms\n";
    std::cout << "  Max: " << *std::max_element(shadeTimes.begin(), shadeTimes.end()) << " ms\n";
    
    std::cout << "\nExpected ranges:\n";
    std::cout << "  Stock RX 480: 6-12ms small kernels, 30-50ms heavy\n";
    std::cout << "  Optimized: ~2.85ms dispatch overhead\n";
    
    engine.shutdown();
    return 0;
}
