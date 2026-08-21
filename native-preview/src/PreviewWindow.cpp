/**
 * PreviewWindow — Cross-platform Vulkan preview window
 * Linux/X11 implementation replaces Win32
 */

#include "VulkanComputeEngine.h"
#include <iostream>

#if defined(_WIN32)
#include <windows.h>
#include "PreviewWindow.cpp"
#else
#include "PreviewWindowLinux.h"
#endif

int main() {
    std::cout << "Mandala 4D Preview — Linux/X11 Vulkan" << std::endl;
    std::cout << "Vulkan Compute Engine build successful." << std::endl;
    
    if (!initX11Preview("Mandala 4D RT4D", 1280, 720)) {
        std::cerr << "Failed to initialize preview window" << std::endl;
        return 1;
    }
    
    std::cout << "Preview window initialized. Closing..." << std::endl;
    destroyX11Preview();
    
    return 0;
}
