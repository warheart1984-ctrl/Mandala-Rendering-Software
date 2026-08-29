#pragma once

#include <cstdint>
#include <string>

// Vulkan deviceType / driverId numeric values, kept here so CPU tests do not
// include vulkan.h. Values match vulkan_core.h.

constexpr uint32_t RT4D_PCI_VENDOR_AMD = 0x1002u;
constexpr uint32_t RT4D_PCI_VENDOR_MESA_SOFTWARE = 0x10005u;
constexpr uint32_t RT4D_VK_DEVICE_TYPE_OTHER = 0u;
constexpr uint32_t RT4D_VK_DEVICE_TYPE_INTEGRATED_GPU = 1u;
constexpr uint32_t RT4D_VK_DEVICE_TYPE_DISCRETE_GPU = 2u;
constexpr uint32_t RT4D_VK_DEVICE_TYPE_VIRTUAL_GPU = 3u;
constexpr uint32_t RT4D_VK_DEVICE_TYPE_CPU = 4u;
constexpr uint32_t RT4D_VK_DRIVER_ID_MESA_RADV = 3u;

struct RT4DAdapterIdentity {
    std::string name;
    std::string driverName;
    uint32_t vendorId = 0;
    uint32_t deviceId = 0;
    uint32_t driverVersion = 0;
    uint32_t deviceType = 0;
    uint32_t driverId = 0;
};

// Hardware-oracle gate: Mesa RADV on an AMD GPU. CPU/llvmpipe never qualify.
bool rt4dAdapterIsAmdRadv(const RT4DAdapterIdentity& adapter);
