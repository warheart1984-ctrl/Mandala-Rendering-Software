#include "kernels/cpu/rt4d_adapter_class.h"

#include <cstdio>

namespace {

int fail(const char* message) {
    std::fprintf(stderr, "[adapter-class] FAIL: %s\n", message);
    return 1;
}

}  // namespace

int main() {
    RT4DAdapterIdentity llvmpipe;
    llvmpipe.name = "llvmpipe (LLVM 20.1.2, 256 bits)";
    llvmpipe.driverName = "llvmpipe";
    llvmpipe.vendorId = RT4D_PCI_VENDOR_MESA_SOFTWARE;
    llvmpipe.deviceType = RT4D_VK_DEVICE_TYPE_CPU;
    llvmpipe.driverId = 0;
    if (rt4dAdapterIsAmdRadv(llvmpipe))
        return fail("llvmpipe was classified as AMD RADV");

    RT4DAdapterIdentity polaris;
    polaris.name = "AMD RADV POLARIS10";
    polaris.driverName = "radv";
    polaris.vendorId = RT4D_PCI_VENDOR_AMD;
    polaris.deviceId = 0x67df;
    polaris.deviceType = RT4D_VK_DEVICE_TYPE_DISCRETE_GPU;
    polaris.driverId = RT4D_VK_DRIVER_ID_MESA_RADV;
    if (!rt4dAdapterIsAmdRadv(polaris))
        return fail("RADV POLARIS10 was not classified as AMD RADV");

    RT4DAdapterIdentity amdvlk = polaris;
    amdvlk.name = "AMD Radeon RX 580 Series";
    amdvlk.driverName = "AMD proprietary driver";
    amdvlk.driverId = 0;
    if (rt4dAdapterIsAmdRadv(amdvlk))
        return fail("non-RADV AMD driver was classified as RADV");

    RT4DAdapterIdentity cpuAmd = polaris;
    cpuAmd.deviceType = RT4D_VK_DEVICE_TYPE_CPU;
    if (rt4dAdapterIsAmdRadv(cpuAmd))
        return fail("CPU deviceType was classified as AMD RADV");

    RT4DAdapterIdentity polarDriverIdOnly;
    polarDriverIdOnly.name = "AMD Radeon RX 580 Series";
    polarDriverIdOnly.vendorId = RT4D_PCI_VENDOR_AMD;
    polarDriverIdOnly.deviceType = RT4D_VK_DEVICE_TYPE_DISCRETE_GPU;
    polarDriverIdOnly.driverId = RT4D_VK_DRIVER_ID_MESA_RADV;
    if (!rt4dAdapterIsAmdRadv(polarDriverIdOnly))
        return fail("RADV driverId without radv in the name was rejected");

    std::fprintf(stderr, "[adapter-class] PASS: RADV gate rejects llvmpipe\n");
    return 0;
}
