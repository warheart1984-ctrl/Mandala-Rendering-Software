#include "kernels/vulkan/rt4d_diagnostic_dispatcher.h"

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <limits>

namespace {

void failLog(const char* message) {
    std::fprintf(stderr, "[rt4d-diagnostic] %s\n", message);
}

bool check(VkResult result, const char* operation, std::string& lastError) {
    if (result == VK_SUCCESS) return true;
    char buffer[256];
    std::snprintf(buffer, sizeof(buffer), "Vulkan failure: %s returned %d",
                  operation, static_cast<int>(result));
    lastError = buffer;
    failLog(buffer);
    return false;
}

bool hasLayer(const char* requested) {
    uint32_t count = 0;
    if (vkEnumerateInstanceLayerProperties(&count, nullptr) != VK_SUCCESS)
        return false;
    std::vector<VkLayerProperties> layers(count);
    if (vkEnumerateInstanceLayerProperties(&count, layers.data()) != VK_SUCCESS)
        return false;
    return std::any_of(layers.begin(), layers.end(), [&](const auto& layer) {
        return std::strcmp(layer.layerName, requested) == 0;
    });
}

bool hasInstanceExtension(const char* requested) {
    uint32_t count = 0;
    if (vkEnumerateInstanceExtensionProperties(nullptr, &count, nullptr) !=
        VK_SUCCESS)
        return false;
    std::vector<VkExtensionProperties> extensions(count);
    if (vkEnumerateInstanceExtensionProperties(nullptr, &count,
                                               extensions.data()) != VK_SUCCESS)
        return false;
    return std::any_of(
        extensions.begin(), extensions.end(), [&](const auto& extension) {
            return std::strcmp(extension.extensionName, requested) == 0;
        });
}

VKAPI_ATTR VkBool32 VKAPI_CALL validationCallback(
    VkDebugUtilsMessageSeverityFlagBitsEXT severity,
    VkDebugUtilsMessageTypeFlagsEXT,
    const VkDebugUtilsMessengerCallbackDataEXT* callbackData, void* userData) {
    auto* state = static_cast<RT4DDiagnosticValidationState*>(userData);
    if (severity & VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT) {
        ++state->errors;
    } else if (severity & VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT) {
        ++state->warnings;
    }
    std::fprintf(stderr, "[rt4d-diagnostic][validation] %s\n",
                 callbackData && callbackData->pMessage
                     ? callbackData->pMessage
                     : "message unavailable");
    return VK_FALSE;
}

std::vector<uint32_t> readSpirv(const char* path) {
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    if (!file) return {};
    const std::streamsize size = file.tellg();
    if (size <= 0 || size % static_cast<std::streamsize>(sizeof(uint32_t)) != 0)
        return {};
    file.seekg(0, std::ios::beg);
    std::vector<uint32_t> words(static_cast<size_t>(size) / sizeof(uint32_t));
    if (!file.read(reinterpret_cast<char*>(words.data()), size)) return {};
    if (words.empty() || words.front() != 0x07230203u) return {};
    return words;
}

struct DispatchObjects {
    explicit DispatchObjects(VkDevice targetDevice) : device(targetDevice) {}
    ~DispatchObjects() {
        if (fence != VK_NULL_HANDLE) vkDestroyFence(device, fence, nullptr);
        if (commandPool != VK_NULL_HANDLE)
            vkDestroyCommandPool(device, commandPool, nullptr);
        if (pipeline != VK_NULL_HANDLE)
            vkDestroyPipeline(device, pipeline, nullptr);
        if (pipelineLayout != VK_NULL_HANDLE)
            vkDestroyPipelineLayout(device, pipelineLayout, nullptr);
        if (shaderModule != VK_NULL_HANDLE)
            vkDestroyShaderModule(device, shaderModule, nullptr);
        if (descriptorPool != VK_NULL_HANDLE)
            vkDestroyDescriptorPool(device, descriptorPool, nullptr);
        if (descriptorLayout != VK_NULL_HANDLE)
            vkDestroyDescriptorSetLayout(device, descriptorLayout, nullptr);
    }

    VkDevice device;
    VkDescriptorSetLayout descriptorLayout = VK_NULL_HANDLE;
    VkDescriptorPool descriptorPool = VK_NULL_HANDLE;
    VkPipelineLayout pipelineLayout = VK_NULL_HANDLE;
    VkShaderModule shaderModule = VK_NULL_HANDLE;
    VkPipeline pipeline = VK_NULL_HANDLE;
    VkCommandPool commandPool = VK_NULL_HANDLE;
    VkFence fence = VK_NULL_HANDLE;
};

}  // namespace

RT4DDiagnosticBuffer::RT4DDiagnosticBuffer(RT4DDiagnosticDispatcher& dispatcher)
    : dispatcher_(dispatcher) {}

RT4DDiagnosticBuffer::~RT4DDiagnosticBuffer() { shutdown(); }

bool RT4DDiagnosticBuffer::init(VkDeviceSize size) {
    shutdown();
    size_ = size;
    VkBufferCreateInfo bufferCreate{};
    bufferCreate.sType = VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO;
    bufferCreate.size = size;
    bufferCreate.usage = VK_BUFFER_USAGE_STORAGE_BUFFER_BIT;
    bufferCreate.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
    if (!check(vkCreateBuffer(dispatcher_.device(), &bufferCreate, nullptr,
                               &buffer_),
               "vkCreateBuffer", dispatcher_.lastError_))
        return false;

    VkMemoryRequirements requirements{};
    vkGetBufferMemoryRequirements(dispatcher_.device(), buffer_,
                                  &requirements);
    uint32_t memoryType = 0;
    if (!dispatcher_.findMemoryType(
            requirements.memoryTypeBits,
            VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT |
                VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
            memoryType)) {
        dispatcher_.lastError_ = "no host-visible coherent memory type";
        failLog(dispatcher_.lastError_.c_str());
        return false;
    }
    VkMemoryAllocateInfo allocate{};
    allocate.sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
    allocate.allocationSize = requirements.size;
    allocate.memoryTypeIndex = memoryType;
    if (!check(vkAllocateMemory(dispatcher_.device(), &allocate, nullptr,
                               &memory_),
               "vkAllocateMemory", dispatcher_.lastError_) ||
        !check(vkBindBufferMemory(dispatcher_.device(), buffer_, memory_, 0),
               "vkBindBufferMemory", dispatcher_.lastError_))
        return false;
    return true;
}

bool RT4DDiagnosticBuffer::write(const void* source, size_t byteCount) {
    if (byteCount > size_ || source == nullptr) return false;
    void* mapped = nullptr;
    if (!check(vkMapMemory(dispatcher_.device(), memory_, 0, byteCount, 0,
                           &mapped),
               "vkMapMemory(write)", dispatcher_.lastError_))
        return false;
    std::memcpy(mapped, source, byteCount);
    vkUnmapMemory(dispatcher_.device(), memory_);
    return true;
}

bool RT4DDiagnosticBuffer::read(void* destination, size_t byteCount) const {
    if (byteCount > size_ || destination == nullptr) return false;
    void* mapped = nullptr;
    if (!check(vkMapMemory(dispatcher_.device(), memory_, 0, byteCount, 0,
                           &mapped),
               "vkMapMemory(read)", dispatcher_.lastError_))
        return false;
    std::memcpy(destination, mapped, byteCount);
    vkUnmapMemory(dispatcher_.device(), memory_);
    return true;
}

void RT4DDiagnosticBuffer::shutdown() {
    if (buffer_ != VK_NULL_HANDLE)
        vkDestroyBuffer(dispatcher_.device(), buffer_, nullptr);
    if (memory_ != VK_NULL_HANDLE)
        vkFreeMemory(dispatcher_.device(), memory_, nullptr);
    buffer_ = VK_NULL_HANDLE;
    memory_ = VK_NULL_HANDLE;
    size_ = 0;
}

bool RT4DDiagnosticDispatcher::findMemoryType(
    uint32_t typeBits, VkMemoryPropertyFlags properties, uint32_t& index) const {
    for (uint32_t i = 0; i < memoryProperties_.memoryTypeCount; ++i) {
        if ((typeBits & (1u << i)) &&
            (memoryProperties_.memoryTypes[i].propertyFlags & properties) ==
                properties) {
            index = i;
            return true;
        }
    }
    return false;
}

bool RT4DDiagnosticDispatcher::init() {
    shutdown();
    validationEnabled_ = hasLayer("VK_LAYER_KHRONOS_validation");
    debugUtilsEnabled_ = validationEnabled_ &&
        hasInstanceExtension(VK_EXT_DEBUG_UTILS_EXTENSION_NAME);

    VkApplicationInfo application{};
    application.sType = VK_STRUCTURE_TYPE_APPLICATION_INFO;
    application.pApplicationName = "rt4d-diagnostic-dispatcher";
    application.applicationVersion = VK_MAKE_VERSION(0, 1, 0);
    application.pEngineName = "RT4D Diagnostic Substrate";
    application.engineVersion = VK_MAKE_VERSION(0, 1, 0);
    application.apiVersion = VK_API_VERSION_1_1;

    const char* validationLayer = "VK_LAYER_KHRONOS_validation";
    const char* debugExtension = VK_EXT_DEBUG_UTILS_EXTENSION_NAME;
    VkDebugUtilsMessengerCreateInfoEXT debugCreate{};
    debugCreate.sType = VK_STRUCTURE_TYPE_DEBUG_UTILS_MESSENGER_CREATE_INFO_EXT;
    debugCreate.messageSeverity =
        VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT |
        VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT;
    debugCreate.messageType = VK_DEBUG_UTILS_MESSAGE_TYPE_GENERAL_BIT_EXT |
        VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT |
        VK_DEBUG_UTILS_MESSAGE_TYPE_PERFORMANCE_BIT_EXT;
    debugCreate.pfnUserCallback = validationCallback;
    debugCreate.pUserData = &validation_;

    VkInstanceCreateInfo create{};
    create.sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO;
    create.pApplicationInfo = &application;
    if (validationEnabled_) {
        create.enabledLayerCount = 1;
        create.ppEnabledLayerNames = &validationLayer;
    }
    if (debugUtilsEnabled_) {
        create.enabledExtensionCount = 1;
        create.ppEnabledExtensionNames = &debugExtension;
        create.pNext = &debugCreate;
    }
    if (!check(vkCreateInstance(&create, nullptr, &instance_),
               "vkCreateInstance", lastError_))
        return false;

    if (debugUtilsEnabled_) {
        const auto createMessenger =
            reinterpret_cast<PFN_vkCreateDebugUtilsMessengerEXT>(
                vkGetInstanceProcAddr(instance_,
                                       "vkCreateDebugUtilsMessengerEXT"));
        if (!createMessenger ||
            !check(createMessenger(instance_, &debugCreate, nullptr,
                                    &debugMessenger_),
                   "vkCreateDebugUtilsMessengerEXT", lastError_))
            return false;
    }

    uint32_t physicalCount = 0;
    if (!check(vkEnumeratePhysicalDevices(instance_, &physicalCount, nullptr),
               "vkEnumeratePhysicalDevices(count)", lastError_) ||
        physicalCount == 0) {
        lastError_ = "no Vulkan physical devices";
        failLog(lastError_.c_str());
        return false;
    }
    std::vector<VkPhysicalDevice> devices(physicalCount);
    if (!check(vkEnumeratePhysicalDevices(instance_, &physicalCount,
                                         devices.data()),
               "vkEnumeratePhysicalDevices(list)", lastError_))
        return false;

    int bestScore = std::numeric_limits<int>::min();
    for (VkPhysicalDevice candidate : devices) {
        uint32_t queueCount = 0;
        vkGetPhysicalDeviceQueueFamilyProperties(candidate, &queueCount,
                                                 nullptr);
        std::vector<VkQueueFamilyProperties> queues(queueCount);
        vkGetPhysicalDeviceQueueFamilyProperties(candidate, &queueCount,
                                                 queues.data());
        for (uint32_t family = 0; family < queueCount; ++family) {
            if (!(queues[family].queueFlags & VK_QUEUE_COMPUTE_BIT)) continue;
            VkPhysicalDeviceProperties properties{};
            vkGetPhysicalDeviceProperties(candidate, &properties);
            int score = 0;
            switch (properties.deviceType) {
                case VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU:
                    score = 1000;
                    break;
                case VK_PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU:
                    score = 800;
                    break;
                case VK_PHYSICAL_DEVICE_TYPE_VIRTUAL_GPU:
                    score = 600;
                    break;
                case VK_PHYSICAL_DEVICE_TYPE_CPU:
                    score = 100;
                    break;
                default:
                    score = 300;
                    break;
            }
            if (!(queues[family].queueFlags & VK_QUEUE_GRAPHICS_BIT))
                score += 25;
            if (score > bestScore) {
                bestScore = score;
                physicalDevice_ = candidate;
                queueFamily_ = family;
                properties_ = properties;
            }
        }
    }
    if (physicalDevice_ == VK_NULL_HANDLE) {
        lastError_ = "no compute-capable queue";
        failLog(lastError_.c_str());
        return false;
    }

    const float priority = 1.0f;
    VkDeviceQueueCreateInfo queueCreate{};
    queueCreate.sType = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO;
    queueCreate.queueFamilyIndex = queueFamily_;
    queueCreate.queueCount = 1;
    queueCreate.pQueuePriorities = &priority;
    VkDeviceCreateInfo deviceCreate{};
    deviceCreate.sType = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO;
    deviceCreate.queueCreateInfoCount = 1;
    deviceCreate.pQueueCreateInfos = &queueCreate;
    if (!check(vkCreateDevice(physicalDevice_, &deviceCreate, nullptr, &device_),
               "vkCreateDevice", lastError_))
        return false;
    vkGetDeviceQueue(device_, queueFamily_, 0, &queue_);
    vkGetPhysicalDeviceMemoryProperties(physicalDevice_, &memoryProperties_);
    adapter_.name = properties_.deviceName;
    adapter_.vendorId = properties_.vendorID;
    adapter_.deviceId = properties_.deviceID;
    adapter_.driverVersion = properties_.driverVersion;
    std::fprintf(stderr, "[rt4d-diagnostic] adapter=%s vendor=0x%x device=0x%x\n",
                 adapter_.name.c_str(), adapter_.vendorId, adapter_.deviceId);
    return true;
}

void RT4DDiagnosticDispatcher::shutdown() {
    if (device_ != VK_NULL_HANDLE) vkDestroyDevice(device_, nullptr);
    if (debugMessenger_ != VK_NULL_HANDLE) {
        const auto destroyMessenger =
            reinterpret_cast<PFN_vkDestroyDebugUtilsMessengerEXT>(
                vkGetInstanceProcAddr(instance_,
                                       "vkDestroyDebugUtilsMessengerEXT"));
        if (destroyMessenger)
            destroyMessenger(instance_, debugMessenger_, nullptr);
    }
    if (instance_ != VK_NULL_HANDLE) vkDestroyInstance(instance_, nullptr);
    instance_ = VK_NULL_HANDLE;
    debugMessenger_ = VK_NULL_HANDLE;
    physicalDevice_ = VK_NULL_HANDLE;
    device_ = VK_NULL_HANDLE;
    queue_ = VK_NULL_HANDLE;
    queueFamily_ = 0;
    properties_ = {};
    memoryProperties_ = {};
    adapter_ = {};
    validation_ = {};
    validationEnabled_ = false;
    debugUtilsEnabled_ = false;
}

bool RT4DDiagnosticDispatcher::dispatchStorage(
    const char* spirvPath, const std::vector<RT4DDiagnosticBuffer*>& buffers,
    const void* pushData, uint32_t pushSize, uint32_t groupCountX) {
    if (!available() || buffers.empty() || groupCountX == 0) return false;
    const std::vector<uint32_t> code = readSpirv(spirvPath);
    if (code.empty()) {
        lastError_ = std::string("invalid SPIR-V: ") +
                     (spirvPath ? spirvPath : "(null)");
        failLog(lastError_.c_str());
        return false;
    }
    if (pushSize > properties_.limits.maxPushConstantsSize) {
        lastError_ = "push constants exceed device limit";
        failLog(lastError_.c_str());
        return false;
    }

    DispatchObjects objects(device_);
    std::vector<VkDescriptorSetLayoutBinding> bindings(buffers.size());
    for (uint32_t i = 0; i < bindings.size(); ++i) {
        bindings[i].binding = i;
        bindings[i].descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;
        bindings[i].descriptorCount = 1;
        bindings[i].stageFlags = VK_SHADER_STAGE_COMPUTE_BIT;
    }
    VkDescriptorSetLayoutCreateInfo descriptorLayoutCreate{};
    descriptorLayoutCreate.sType =
        VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO;
    descriptorLayoutCreate.bindingCount =
        static_cast<uint32_t>(bindings.size());
    descriptorLayoutCreate.pBindings = bindings.data();
    if (!check(vkCreateDescriptorSetLayout(device_, &descriptorLayoutCreate,
                                           nullptr, &objects.descriptorLayout),
               "vkCreateDescriptorSetLayout", lastError_))
        return false;

    VkDescriptorPoolSize poolSize{};
    poolSize.type = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;
    poolSize.descriptorCount = static_cast<uint32_t>(buffers.size());
    VkDescriptorPoolCreateInfo poolCreate{};
    poolCreate.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO;
    poolCreate.maxSets = 1;
    poolCreate.poolSizeCount = 1;
    poolCreate.pPoolSizes = &poolSize;
    if (!check(vkCreateDescriptorPool(device_, &poolCreate, nullptr,
                                     &objects.descriptorPool),
               "vkCreateDescriptorPool", lastError_))
        return false;

    VkDescriptorSetAllocateInfo setAllocate{};
    setAllocate.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO;
    setAllocate.descriptorPool = objects.descriptorPool;
    setAllocate.descriptorSetCount = 1;
    setAllocate.pSetLayouts = &objects.descriptorLayout;
    VkDescriptorSet descriptorSet = VK_NULL_HANDLE;
    if (!check(vkAllocateDescriptorSets(device_, &setAllocate, &descriptorSet),
               "vkAllocateDescriptorSets", lastError_))
        return false;

    std::vector<VkDescriptorBufferInfo> bufferInfos(buffers.size());
    std::vector<VkWriteDescriptorSet> writes(buffers.size());
    for (size_t i = 0; i < buffers.size(); ++i) {
        bufferInfos[i].buffer = buffers[i]->buffer();
        bufferInfos[i].offset = 0;
        bufferInfos[i].range = buffers[i]->size();
        writes[i].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        writes[i].dstSet = descriptorSet;
        writes[i].dstBinding = static_cast<uint32_t>(i);
        writes[i].descriptorCount = 1;
        writes[i].descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;
        writes[i].pBufferInfo = &bufferInfos[i];
    }
    vkUpdateDescriptorSets(device_, static_cast<uint32_t>(writes.size()),
                            writes.data(), 0, nullptr);

    VkPushConstantRange pushRange{};
    pushRange.stageFlags = VK_SHADER_STAGE_COMPUTE_BIT;
    pushRange.offset = 0;
    pushRange.size = pushSize;
    VkPipelineLayoutCreateInfo layoutCreate{};
    layoutCreate.sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;
    layoutCreate.setLayoutCount = 1;
    layoutCreate.pSetLayouts = &objects.descriptorLayout;
    if (pushSize > 0) {
        layoutCreate.pushConstantRangeCount = 1;
        layoutCreate.pPushConstantRanges = &pushRange;
    }
    if (!check(vkCreatePipelineLayout(device_, &layoutCreate, nullptr,
                                     &objects.pipelineLayout),
               "vkCreatePipelineLayout", lastError_))
        return false;

    VkShaderModuleCreateInfo shaderCreate{};
    shaderCreate.sType = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO;
    shaderCreate.codeSize = code.size() * sizeof(uint32_t);
    shaderCreate.pCode = code.data();
    if (!check(vkCreateShaderModule(device_, &shaderCreate, nullptr,
                                     &objects.shaderModule),
               "vkCreateShaderModule", lastError_))
        return false;

    VkComputePipelineCreateInfo pipelineCreate{};
    pipelineCreate.sType = VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO;
    pipelineCreate.stage.sType =
        VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    pipelineCreate.stage.stage = VK_SHADER_STAGE_COMPUTE_BIT;
    pipelineCreate.stage.module = objects.shaderModule;
    pipelineCreate.stage.pName = "main";
    pipelineCreate.layout = objects.pipelineLayout;
    if (!check(vkCreateComputePipelines(device_, VK_NULL_HANDLE, 1,
                                         &pipelineCreate, nullptr,
                                         &objects.pipeline),
               "vkCreateComputePipelines", lastError_))
        return false;

    VkCommandPoolCreateInfo poolInfo{};
    poolInfo.sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
    poolInfo.queueFamilyIndex = queueFamily_;
    if (!check(vkCreateCommandPool(device_, &poolInfo, nullptr,
                                   &objects.commandPool),
               "vkCreateCommandPool", lastError_))
        return false;

    VkCommandBufferAllocateInfo cmdAlloc{};
    cmdAlloc.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
    cmdAlloc.commandPool = objects.commandPool;
    cmdAlloc.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    cmdAlloc.commandBufferCount = 1;
    VkCommandBuffer commandBuffer = VK_NULL_HANDLE;
    if (!check(vkAllocateCommandBuffers(device_, &cmdAlloc, &commandBuffer),
               "vkAllocateCommandBuffers", lastError_))
        return false;

    VkCommandBufferBeginInfo begin{};
    begin.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
    begin.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
    if (!check(vkBeginCommandBuffer(commandBuffer, &begin),
               "vkBeginCommandBuffer", lastError_))
        return false;
    vkCmdBindPipeline(commandBuffer, VK_PIPELINE_BIND_POINT_COMPUTE,
                       objects.pipeline);
    vkCmdBindDescriptorSets(commandBuffer, VK_PIPELINE_BIND_POINT_COMPUTE,
                             objects.pipelineLayout, 0, 1, &descriptorSet, 0,
                             nullptr);
    if (pushSize > 0 && pushData != nullptr) {
        vkCmdPushConstants(commandBuffer, objects.pipelineLayout,
                             VK_SHADER_STAGE_COMPUTE_BIT, 0, pushSize,
                             pushData);
    }
    vkCmdDispatch(commandBuffer, groupCountX, 1, 1);
    VkMemoryBarrier barrier{};
    barrier.sType = VK_STRUCTURE_TYPE_MEMORY_BARRIER;
    barrier.srcAccessMask = VK_ACCESS_SHADER_WRITE_BIT;
    barrier.dstAccessMask = VK_ACCESS_HOST_READ_BIT;
    vkCmdPipelineBarrier(commandBuffer, VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT,
                          VK_PIPELINE_STAGE_HOST_BIT, 0, 1, &barrier, 0,
                          nullptr, 0, nullptr);
    if (!check(vkEndCommandBuffer(commandBuffer), "vkEndCommandBuffer",
               lastError_))
        return false;

    VkFenceCreateInfo fenceCreate{};
    fenceCreate.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;
    if (!check(vkCreateFence(device_, &fenceCreate, nullptr, &objects.fence),
               "vkCreateFence", lastError_))
        return false;
    VkSubmitInfo submit{};
    submit.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    submit.commandBufferCount = 1;
    submit.pCommandBuffers = &commandBuffer;
    if (!check(vkQueueSubmit(queue_, 1, &submit, objects.fence),
               "vkQueueSubmit", lastError_))
        return false;
    if (!check(vkWaitForFences(device_, 1, &objects.fence, VK_TRUE,
                                  10ull * 1000ull * 1000ull * 1000ull),
               "vkWaitForFences", lastError_))
        return false;
    return true;
}
