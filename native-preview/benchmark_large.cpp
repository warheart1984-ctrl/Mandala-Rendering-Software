/**
 * RT4D Simple Benchmark - Larger Workloads
 */

#include "VulkanComputeEngine.h"
#include <iostream>
#include <fstream>
#include <vector>
#include <numeric>

std::vector<uint32_t> loadSpirv(const char* filename) {
    std::ifstream file(filename, std::ios::binary | std::ios::ate);
    if (!file) return {};
    size_t size = file.tellg();
    file.seekg(0, std::ios::beg);
    std::vector<uint32_t> buffer(size / 4);
    file.read(reinterpret_cast<char*>(buffer.data()), size);
    return buffer;
}

int main() {
    std::cout << "=== RT4D Large Workload Benchmark ===\n";
    
    VulkanComputeEngine engine;
    VulkanComputeConfig cfg{};
    cfg.width = 1920;
    cfg.height = 1080;
    cfg.maxFramesInFlight = 2;
    cfg.enableValidation = false;
    
    if (!engine.init(cfg)) return 1;
    
    auto deviceInfo = engine.getDeviceInfo();
    std::cout << "GPU: " << deviceInfo.deviceName << "\n\n";
    
    // Use simple test shader for large workloads
    auto spv = loadSpirv("test_shader.spv");
    if (spv.empty()) {
        std::cerr << "Failed to load test_shader.spv\n";
        return 1;
    }
    
    uint32_t shader = engine.createShaderModule(spv.data(), spv.size() * 4, "test");
    uint32_t pipeline = engine.createComputePipeline(shader, 64, 1, 1, "test-pipeline");
    
    // Test progressively larger workloads
    std::vector<uint32_t> workgroups = {1024, 4096, 16384, 65536, 262144, 1048576};
    
    std::cout << "Testing with different workload sizes:\n";
    std::cout << "----------------------------------------\n";
    
    for (auto wg : workgroups) {
        const uint32_t threads = wg * 64;
        std::vector<double> times;
        
        // Warmup
        double t;
        engine.dispatchKernelTimed(pipeline, wg, 1, 1, {}, t);
        
        // Benchmark
        for (int i = 0; i < 10; i++) {
            engine.dispatchKernelTimed(pipeline, wg, 1, 1, {}, t);
            times.push_back(t);
        }
        
        double avg = std::accumulate(times.begin(), times.end(), 0.0) / times.size();
        std::cout << "Workgroups: " << wg << " (" << threads << " threads) - Avg: " << avg << " ms\n";
    }
    
    std::cout << "\nExpected: 6-12ms for stock, ~2.85ms for optimized\n";
    engine.shutdown();
    return 0;
}
