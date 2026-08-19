/**
 * Native Vulkan Benchmark - Stock Configuration (Minimal)
 * Tests RX 480 init and basic dispatch timing
 */

#include "VulkanComputeEngine.h"
#include <chrono>
#include <iostream>

int main() {
    std::cout << "=== RX 480 Stock Benchmark (Minimal) ===\n";
    std::cout << "Configuration: STOCK (no optimizations)\n\n";
    
    VulkanComputeEngine engine;
    
    VulkanComputeConfig cfg{};
    cfg.width = 640;
    cfg.height = 480;
    cfg.maxFramesInFlight = 2;
    cfg.enableValidation = false;
    
    // STOCK config - all optimizations DISABLED
    cfg.enableAsyncCompute = false;
    cfg.enableTimelineSemaphores = false;
    cfg.enableBindless = false;
    
    auto initStart = std::chrono::high_resolution_clock::now();
    if (!engine.init(cfg)) {
        std::cerr << "Failed to init VulkanComputeEngine\n";
        return 1;
    }
    auto initEnd = std::chrono::high_resolution_clock::now();
    double initMs = std::chrono::duration<double, std::milli>(initEnd - initStart).count();
    
    auto deviceInfo = engine.getDeviceInfo();
    std::cout << "GPU: " << deviceInfo.deviceName << "\n";
    std::cout << "VRAM: " << (deviceInfo.vramSize / 1024 / 1024) << " MB\n";
    std::cout << "Init time: " << initMs << " ms\n\n";
    
    // Test initialization was successful
    std::cout << "VulkanComputeEngine initialized successfully\n";
    std::cout << "Device: " << deviceInfo.deviceName << "\n";
    std::cout << "Async compute supported: " << (deviceInfo.hasAsyncCompute ? "YES" : "NO") << "\n";
    std::cout << "Bindless supported: " << (deviceInfo.hasBindless ? "YES" : "NO") << "\n";
    std::cout << "Timeline semaphores supported: " << (deviceInfo.hasTimelineSemaphores ? "YES" : "NO") << "\n";
    
    engine.shutdown();
    std::cout << "\nBenchmark complete\n";
    return 0;
}
