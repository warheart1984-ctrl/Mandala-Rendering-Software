#include <chrono>
#include <iostream>
#include <fstream>
#include "VulkanComputeEngine.h"

struct PassTime { const char* name; double ms; };

int main(){
    VulkanComputeEngine eng;
    eng.init({});
    auto measure = [&](VulkanComputeEngine::RT4DPassType t, int x, int y){
        auto s = std::chrono::high_resolution_clock::now();
        eng.dispatchRT4DPass(0, t, x, y);
        eng.submitFrame(); eng.waitFrame();
        auto e = std::chrono::high_resolution_clock::now();
        return std::chrono::duration<double,std::milli>(e-s).count();
    };
    
    PassTime times[6];
    times[0]={"RAYGEN", measure(VulkanComputeEngine::RT4DPassType::RAYGEN,32,18)};
    times[1]={"BVH", measure(VulkanComputeEngine::RT4DPassType::BVH,32,18)};
    times[2]={"SHADE", measure(VulkanComputeEngine::RT4DPassType::SHADE,32,18)};
    times[3]={"TEMPORAL", measure(VulkanComputeEngine::RT4DPassType::TEMPORAL,24,14)};
    times[4]={"DENOISE", measure(VulkanComputeEngine::RT4DPassType::DENOISE,24,14)};
    times[5]={"RESOLVE", measure(VulkanComputeEngine::RT4DPassType::RESOLVE,24,14)};
    
    std::ofstream out("rt4d_profile.json");
    out << "{\n\"passes\":[\n";
    for(int i=0;i<6;i++){
        out << "  {\"name\":\""<<times[i].name<<"\",\"ms\":"<<times[i].ms<<"}"<<(i<5?",":"")<<"\n";
    }
    out << "]}\n";
    for(auto& t: times) std::cout << t.name << ": " << t.ms << "ms\n";
    eng.shutdown();
    return 0;
}
