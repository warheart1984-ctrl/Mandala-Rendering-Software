#pragma once

#include <vulkan/vulkan.h>

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

// Narrow Vulkan diagnostic dispatcher. Owns instance/device, validation,
// host-visible buffers, SPIR-V load, and compute dispatch. Callers: CTest and
// intake CLI. This is not a scene runtime and has no renderer authority.

struct RT4DDiagnosticAdapterInfo {
    std::string name;
    uint32_t vendorId = 0;
    uint32_t deviceId = 0;
    uint32_t driverVersion = 0;
};

struct RT4DDiagnosticValidationState {
    uint32_t warnings = 0;
    uint32_t errors = 0;
};

class RT4DDiagnosticDispatcher;

class RT4DDiagnosticBuffer {
public:
    explicit RT4DDiagnosticBuffer(RT4DDiagnosticDispatcher& dispatcher);
    ~RT4DDiagnosticBuffer();
    RT4DDiagnosticBuffer(const RT4DDiagnosticBuffer&) = delete;
    RT4DDiagnosticBuffer& operator=(const RT4DDiagnosticBuffer&) = delete;

    bool init(VkDeviceSize size);
    bool write(const void* source, size_t byteCount);
    bool read(void* destination, size_t byteCount) const;
    void shutdown();

    VkBuffer buffer() const { return buffer_; }
    VkDeviceSize size() const { return size_; }

private:
    RT4DDiagnosticDispatcher& dispatcher_;
    VkBuffer buffer_ = VK_NULL_HANDLE;
    VkDeviceMemory memory_ = VK_NULL_HANDLE;
    VkDeviceSize size_ = 0;
};

class RT4DDiagnosticDispatcher {
public:
    RT4DDiagnosticDispatcher() = default;
    ~RT4DDiagnosticDispatcher() { shutdown(); }
    RT4DDiagnosticDispatcher(const RT4DDiagnosticDispatcher&) = delete;
    RT4DDiagnosticDispatcher& operator=(const RT4DDiagnosticDispatcher&) = delete;

    bool init();
    void shutdown();
    bool available() const { return device_ != VK_NULL_HANDLE; }

    const RT4DDiagnosticAdapterInfo& adapter() const { return adapter_; }
    const RT4DDiagnosticValidationState& validation() const {
        return validation_;
    }
    VkDevice device() const { return device_; }
    const VkPhysicalDeviceProperties& properties() const { return properties_; }

    bool findMemoryType(uint32_t typeBits, VkMemoryPropertyFlags properties,
                         uint32_t& index) const;

    bool dispatchStorage(const char* spirvPath,
                         const std::vector<RT4DDiagnosticBuffer*>& buffers,
                         const void* pushData, uint32_t pushSize,
                         uint32_t groupCountX);

    std::string lastError() const { return lastError_; }

private:
    friend class RT4DDiagnosticBuffer;

    VkInstance instance_ = VK_NULL_HANDLE;
    VkDebugUtilsMessengerEXT debugMessenger_ = VK_NULL_HANDLE;
    VkPhysicalDevice physicalDevice_ = VK_NULL_HANDLE;
    VkDevice device_ = VK_NULL_HANDLE;
    VkQueue queue_ = VK_NULL_HANDLE;
    uint32_t queueFamily_ = 0;
    VkPhysicalDeviceProperties properties_{};
    VkPhysicalDeviceMemoryProperties memoryProperties_{};
    RT4DDiagnosticAdapterInfo adapter_{};
    RT4DDiagnosticValidationState validation_{};
    bool validationEnabled_ = false;
    bool debugUtilsEnabled_ = false;
    std::string lastError_;
};

template <typename T>
bool rt4dInitializeDiagnosticBuffer(RT4DDiagnosticBuffer& buffer,
                                     const std::vector<T>& values) {
    if (values.empty()) return false;
    const VkDeviceSize size =
        static_cast<VkDeviceSize>(values.size() * sizeof(T));
    return buffer.init(size) &&
           buffer.write(values.data(), static_cast<size_t>(size));
}
