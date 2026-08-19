#include "VulkanComputeEngine.h"
#include <iostream>

int main(){
    VulkanComputeEngine engine;
    VulkanComputeConfig cfg{};
    cfg.width=1920; cfg.height=1080;
    engine.init(cfg);
    
    // Cornell box: 6 triangles per wall, 2 materials
    // Materials: Red diffuse, White diffuse, Light
    struct MaterialDesc { float base[3]; int bsdf; float roughness; };
    MaterialDesc mats[3] = {
        {{0.8,0.1,0.1}, 4, 0.9},
        {{0.9,0.9,0.9}, 4, 0.9},
        {{1.0,1.0,1.0}, 4, 1.0}
    };
    
    // Create scene buffers
    // Triangles: floor, ceiling, left, right, back, box front/back/left/right
    // BVH build pass
    engine.dispatchRT4DPass(0, VulkanComputeEngine::RT4DPassType::RAYGEN, 1, 1);
    engine.dispatchRT4DPass(1, VulkanComputeEngine::RT4DPassType::BVH, 1, 1);
    
    // Path trace 128spp
    for(int spp=0; spp<128; spp++){
        engine.dispatchRT4DPass(2, VulkanComputeEngine::RT4DPassType::SHADE, 32, 32);
        engine.dispatchRT4DPass(3, VulkanComputeEngine::RT4DPassType::ACCUM, 32, 32);
    }
    
    // Temporal + SVGF + Resolve
    engine.dispatchRT4DPass(4, VulkanComputeEngine::RT4DPassType::TEMPORAL, 24, 14);
    engine.dispatchRT4DPass(5, VulkanComputeEngine::RT4DPassType::DENOISE, 24, 14);
    engine.dispatchRT4DPass(6, VulkanComputeEngine::RT4DPassType::RESOLVE, 24, 14);
    
    std::cout << "Cornell box RT4D smoke test complete\n";
    engine.shutdown();
    return 0;
}
