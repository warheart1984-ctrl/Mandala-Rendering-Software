#include "kernels/cpu/rt4d_adapter_class.h"

#include <algorithm>
#include <cctype>
#include <string>

namespace {

std::string lowerCopy(const std::string& value) {
    std::string out = value;
    std::transform(out.begin(), out.end(), out.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return out;
}

bool containsToken(const std::string& haystack, const char* needle) {
    return lowerCopy(haystack).find(needle) != std::string::npos;
}

}  // namespace

bool rt4dAdapterIsAmdRadv(const RT4DAdapterIdentity& adapter) {
    if (adapter.vendorId != RT4D_PCI_VENDOR_AMD) return false;
    if (adapter.deviceType == RT4D_VK_DEVICE_TYPE_CPU) return false;
    if (containsToken(adapter.name, "llvmpipe") ||
        containsToken(adapter.driverName, "llvmpipe"))
        return false;
    if (adapter.driverId == RT4D_VK_DRIVER_ID_MESA_RADV) return true;
    return containsToken(adapter.driverName, "radv") ||
           containsToken(adapter.name, "radv");
}
