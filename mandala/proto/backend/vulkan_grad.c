/* Tiny Vulkan compute host: ∇φ on a 32³ Float32 grid.
 * Mathematical contract is CPU JS (cpu-reference.mjs). This is a backend.
 * Prefer discrete RADV device. Host-visible buffers only (tiny proto).
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <vulkan/vulkan.h>

static void die(const char *msg, VkResult r) {
  fprintf(stderr, "vulkan_grad: %s (VkResult %d)\n", msg, (int)r);
  exit(3);
}

static uint32_t find_host_memory(VkPhysicalDevice pd, uint32_t type_bits) {
  VkPhysicalDeviceMemoryProperties mp;
  vkGetPhysicalDeviceMemoryProperties(pd, &mp);
  for (uint32_t i = 0; i < mp.memoryTypeCount; i++) {
    if ((type_bits & (1u << i)) &&
        (mp.memoryTypes[i].propertyFlags & VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT) &&
        (mp.memoryTypes[i].propertyFlags & VK_MEMORY_PROPERTY_HOST_COHERENT_BIT)) {
      return i;
    }
  }
  for (uint32_t i = 0; i < mp.memoryTypeCount; i++) {
    if ((type_bits & (1u << i)) &&
        (mp.memoryTypes[i].propertyFlags & VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT)) {
      return i;
    }
  }
  die("no host-visible memory type", VK_ERROR_OUT_OF_DEVICE_MEMORY);
  return 0;
}

static int is_discrete_amd(VkPhysicalDevice pd) {
  VkPhysicalDeviceProperties p;
  vkGetPhysicalDeviceProperties(pd, &p);
  return p.deviceType == VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU;
}

static void *read_file(const char *path, size_t *out_sz) {
  FILE *f = fopen(path, "rb");
  if (!f) {
    fprintf(stderr, "vulkan_grad: cannot open %s\n", path);
    exit(2);
  }
  fseek(f, 0, SEEK_END);
  long n = ftell(f);
  fseek(f, 0, SEEK_SET);
  void *buf = malloc((size_t)n);
  if (!buf || fread(buf, 1, (size_t)n, f) != (size_t)n) {
    fprintf(stderr, "vulkan_grad: read failed %s\n", path);
    exit(2);
  }
  fclose(f);
  *out_sz = (size_t)n;
  return buf;
}

static void write_file(const char *path, const void *data, size_t n) {
  FILE *f = fopen(path, "wb");
  if (!f) {
    fprintf(stderr, "vulkan_grad: cannot write %s\n", path);
    exit(2);
  }
  if (fwrite(data, 1, n, f) != n) {
    fprintf(stderr, "vulkan_grad: write failed %s\n", path);
    exit(2);
  }
  fclose(f);
}

int main(int argc, char **argv) {
  const char *shader = NULL;
  const char *in_path = NULL;
  const char *out_path = NULL;
  uint32_t nx = 32, ny = 32, nz = 32;
  for (int i = 1; i < argc; i++) {
    if (!strcmp(argv[i], "--shader") && i + 1 < argc) shader = argv[++i];
    else if (!strcmp(argv[i], "--in") && i + 1 < argc) in_path = argv[++i];
    else if (!strcmp(argv[i], "--out") && i + 1 < argc) out_path = argv[++i];
    else if (!strcmp(argv[i], "--nx") && i + 1 < argc) nx = (uint32_t)atoi(argv[++i]);
    else if (!strcmp(argv[i], "--ny") && i + 1 < argc) ny = (uint32_t)atoi(argv[++i]);
    else if (!strcmp(argv[i], "--nz") && i + 1 < argc) nz = (uint32_t)atoi(argv[++i]);
  }
  if (!shader || !in_path || !out_path) {
    fprintf(stderr, "usage: vulkan_grad --shader grad.spv --in phi.bin --out grad.bin [--nx 32 --ny 32 --nz 32]\n");
    return 2;
  }

  size_t in_sz = 0;
  float *phi = read_file(in_path, &in_sz);
  uint32_t n = nx * ny * nz;
  if (in_sz != n * sizeof(float)) {
    fprintf(stderr, "vulkan_grad: expected %u floats, got %zu bytes\n", n, in_sz);
    return 2;
  }
  size_t out_bytes = (size_t)n * 3 * sizeof(float);

  VkInstance inst;
  VkApplicationInfo app = {
    .sType = VK_STRUCTURE_TYPE_APPLICATION_INFO,
    .pApplicationName = "mandala-proto-grad",
    .applicationVersion = 1,
    .pEngineName = "mandala-proto",
    .engineVersion = 1,
    .apiVersion = VK_API_VERSION_1_0,
  };
  VkInstanceCreateInfo ici = {
    .sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO,
    .pApplicationInfo = &app,
  };
  VkResult r = vkCreateInstance(&ici, NULL, &inst);
  if (r != VK_SUCCESS) die("vkCreateInstance", r);

  uint32_t pd_count = 0;
  vkEnumeratePhysicalDevices(inst, &pd_count, NULL);
  if (!pd_count) die("no physical devices", VK_ERROR_INITIALIZATION_FAILED);
  VkPhysicalDevice *pds = calloc(pd_count, sizeof(*pds));
  vkEnumeratePhysicalDevices(inst, &pd_count, pds);
  VkPhysicalDevice pd = pds[0];
  for (uint32_t i = 0; i < pd_count; i++) {
    if (is_discrete_amd(pds[i])) {
      pd = pds[i];
      break;
    }
  }
  VkPhysicalDeviceProperties props;
  vkGetPhysicalDeviceProperties(pd, &props);
  fprintf(stderr, "vulkan_grad: device=%s\n", props.deviceName);

  uint32_t qf_count = 0;
  vkGetPhysicalDeviceQueueFamilyProperties(pd, &qf_count, NULL);
  VkQueueFamilyProperties *qfs = calloc(qf_count, sizeof(*qfs));
  vkGetPhysicalDeviceQueueFamilyProperties(pd, &qf_count, qfs);
  uint32_t qfam = UINT32_MAX;
  for (uint32_t i = 0; i < qf_count; i++) {
    if (qfs[i].queueFlags & VK_QUEUE_COMPUTE_BIT) {
      qfam = i;
      break;
    }
  }
  if (qfam == UINT32_MAX) die("no compute queue", VK_ERROR_FEATURE_NOT_PRESENT);
  float prio = 1.f;
  VkDeviceQueueCreateInfo qci = {
    .sType = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO,
    .queueFamilyIndex = qfam,
    .queueCount = 1,
    .pQueuePriorities = &prio,
  };
  VkDeviceCreateInfo dci = {
    .sType = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO,
    .queueCreateInfoCount = 1,
    .pQueueCreateInfos = &qci,
  };
  VkDevice dev;
  r = vkCreateDevice(pd, &dci, NULL, &dev);
  if (r != VK_SUCCESS) die("vkCreateDevice", r);
  VkQueue queue;
  vkGetDeviceQueue(dev, qfam, 0, &queue);

  size_t spirv_sz = 0;
  uint32_t *spirv = read_file(shader, &spirv_sz);
  if (spirv_sz % 4) die("spirv size", VK_ERROR_UNKNOWN);
  VkShaderModuleCreateInfo smci = {
    .sType = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO,
    .codeSize = spirv_sz,
    .pCode = spirv,
  };
  VkShaderModule sm;
  r = vkCreateShaderModule(dev, &smci, NULL, &sm);
  if (r != VK_SUCCESS) die("vkCreateShaderModule", r);

  VkDescriptorSetLayoutBinding binds[2] = {
    { .binding = 0, .descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER, .descriptorCount = 1, .stageFlags = VK_SHADER_STAGE_COMPUTE_BIT },
    { .binding = 1, .descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER, .descriptorCount = 1, .stageFlags = VK_SHADER_STAGE_COMPUTE_BIT },
  };
  VkDescriptorSetLayoutCreateInfo dslci = {
    .sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO,
    .bindingCount = 2,
    .pBindings = binds,
  };
  VkDescriptorSetLayout dsl;
  r = vkCreateDescriptorSetLayout(dev, &dslci, NULL, &dsl);
  if (r != VK_SUCCESS) die("dsl", r);

  VkPushConstantRange pcr = {
    .stageFlags = VK_SHADER_STAGE_COMPUTE_BIT,
    .offset = 0,
    .size = 12,
  };
  VkPipelineLayoutCreateInfo plci = {
    .sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO,
    .setLayoutCount = 1,
    .pSetLayouts = &dsl,
    .pushConstantRangeCount = 1,
    .pPushConstantRanges = &pcr,
  };
  VkPipelineLayout layout;
  r = vkCreatePipelineLayout(dev, &plci, NULL, &layout);
  if (r != VK_SUCCESS) die("pipeline layout", r);

  VkComputePipelineCreateInfo cpci = {
    .sType = VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO,
    .stage = {
      .sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO,
      .stage = VK_SHADER_STAGE_COMPUTE_BIT,
      .module = sm,
      .pName = "main",
    },
    .layout = layout,
  };
  VkPipeline pipe;
  r = vkCreateComputePipelines(dev, VK_NULL_HANDLE, 1, &cpci, NULL, &pipe);
  if (r != VK_SUCCESS) die("compute pipeline", r);

  VkBufferCreateInfo bphi = {
    .sType = VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO,
    .size = in_sz,
    .usage = VK_BUFFER_USAGE_STORAGE_BUFFER_BIT,
    .sharingMode = VK_SHARING_MODE_EXCLUSIVE,
  };
  VkBufferCreateInfo bout = bphi;
  bout.size = out_bytes;
  VkBuffer buf_in, buf_out;
  r = vkCreateBuffer(dev, &bphi, NULL, &buf_in);
  if (r != VK_SUCCESS) die("buf in", r);
  r = vkCreateBuffer(dev, &bout, NULL, &buf_out);
  if (r != VK_SUCCESS) die("buf out", r);

  VkMemoryRequirements mr_in, mr_out;
  vkGetBufferMemoryRequirements(dev, buf_in, &mr_in);
  vkGetBufferMemoryRequirements(dev, buf_out, &mr_out);
  uint32_t mt_in = find_host_memory(pd, mr_in.memoryTypeBits);
  uint32_t mt_out = find_host_memory(pd, mr_out.memoryTypeBits);
  VkMemoryAllocateInfo ai_in = { .sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO, .allocationSize = mr_in.size, .memoryTypeIndex = mt_in };
  VkMemoryAllocateInfo ai_out = { .sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO, .allocationSize = mr_out.size, .memoryTypeIndex = mt_out };
  VkDeviceMemory mem_in, mem_out;
  r = vkAllocateMemory(dev, &ai_in, NULL, &mem_in);
  if (r != VK_SUCCESS) die("alloc in", r);
  r = vkAllocateMemory(dev, &ai_out, NULL, &mem_out);
  if (r != VK_SUCCESS) die("alloc out", r);
  vkBindBufferMemory(dev, buf_in, mem_in, 0);
  vkBindBufferMemory(dev, buf_out, mem_out, 0);

  void *map_in, *map_out;
  vkMapMemory(dev, mem_in, 0, in_sz, 0, &map_in);
  memcpy(map_in, phi, in_sz);
  vkUnmapMemory(dev, mem_in);
  vkMapMemory(dev, mem_out, 0, out_bytes, 0, &map_out);
  memset(map_out, 0, out_bytes);
  vkUnmapMemory(dev, mem_out);

  VkDescriptorPoolSize dps = { .type = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER, .descriptorCount = 2 };
  VkDescriptorPoolCreateInfo dpci = {
    .sType = VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO,
    .maxSets = 1,
    .poolSizeCount = 1,
    .pPoolSizes = &dps,
  };
  VkDescriptorPool pool;
  r = vkCreateDescriptorPool(dev, &dpci, NULL, &pool);
  if (r != VK_SUCCESS) die("pool", r);
  VkDescriptorSetAllocateInfo dsai = {
    .sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO,
    .descriptorPool = pool,
    .descriptorSetCount = 1,
    .pSetLayouts = &dsl,
  };
  VkDescriptorSet dset;
  r = vkAllocateDescriptorSets(dev, &dsai, &dset);
  if (r != VK_SUCCESS) die("dset", r);
  VkDescriptorBufferInfo dbi[2] = {
    { .buffer = buf_in, .offset = 0, .range = in_sz },
    { .buffer = buf_out, .offset = 0, .range = out_bytes },
  };
  VkWriteDescriptorSet writes[2] = {
    { .sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET, .dstSet = dset, .dstBinding = 0, .descriptorCount = 1, .descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER, .pBufferInfo = &dbi[0] },
    { .sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET, .dstSet = dset, .dstBinding = 1, .descriptorCount = 1, .descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER, .pBufferInfo = &dbi[1] },
  };
  vkUpdateDescriptorSets(dev, 2, writes, 0, NULL);

  VkCommandPoolCreateInfo cpoci = {
    .sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO,
    .queueFamilyIndex = qfam,
  };
  VkCommandPool cpool;
  r = vkCreateCommandPool(dev, &cpoci, NULL, &cpool);
  if (r != VK_SUCCESS) die("cmd pool", r);
  VkCommandBufferAllocateInfo cbai = {
    .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO,
    .commandPool = cpool,
    .level = VK_COMMAND_BUFFER_LEVEL_PRIMARY,
    .commandBufferCount = 1,
  };
  VkCommandBuffer cmd;
  r = vkAllocateCommandBuffers(dev, &cbai, &cmd);
  if (r != VK_SUCCESS) die("cmd", r);
  VkCommandBufferBeginInfo cbi = { .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO, .flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT };
  vkBeginCommandBuffer(cmd, &cbi);
  vkCmdBindPipeline(cmd, VK_PIPELINE_BIND_POINT_COMPUTE, pipe);
  vkCmdBindDescriptorSets(cmd, VK_PIPELINE_BIND_POINT_COMPUTE, layout, 0, 1, &dset, 0, NULL);
  uint32_t pcdata[3] = { nx, ny, nz };
  vkCmdPushConstants(cmd, layout, VK_SHADER_STAGE_COMPUTE_BIT, 0, 12, pcdata);
  uint32_t groups = (n + 63) / 64;
  vkCmdDispatch(cmd, groups, 1, 1);
  VkMemoryBarrier barrier = {
    .sType = VK_STRUCTURE_TYPE_MEMORY_BARRIER,
    .srcAccessMask = VK_ACCESS_SHADER_WRITE_BIT,
    .dstAccessMask = VK_ACCESS_HOST_READ_BIT,
  };
  vkCmdPipelineBarrier(cmd, VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT, VK_PIPELINE_STAGE_HOST_BIT, 0, 1, &barrier, 0, NULL, 0, NULL);
  vkEndCommandBuffer(cmd);

  VkSubmitInfo si = { .sType = VK_STRUCTURE_TYPE_SUBMIT_INFO, .commandBufferCount = 1, .pCommandBuffers = &cmd };
  r = vkQueueSubmit(queue, 1, &si, VK_NULL_HANDLE);
  if (r != VK_SUCCESS) die("submit", r);
  r = vkQueueWaitIdle(queue);
  if (r != VK_SUCCESS) die("wait", r);

  vkMapMemory(dev, mem_out, 0, out_bytes, 0, &map_out);
  write_file(out_path, map_out, out_bytes);
  vkUnmapMemory(dev, mem_out);

  printf("{\"ok\":true,\"device\":\"%s\",\"cells\":%u}\n", props.deviceName, n);

  vkDestroyPipeline(dev, pipe, NULL);
  vkDestroyPipelineLayout(dev, layout, NULL);
  vkDestroyDescriptorPool(dev, pool, NULL);
  vkDestroyDescriptorSetLayout(dev, dsl, NULL);
  vkDestroyShaderModule(dev, sm, NULL);
  vkDestroyBuffer(dev, buf_in, NULL);
  vkDestroyBuffer(dev, buf_out, NULL);
  vkFreeMemory(dev, mem_in, NULL);
  vkFreeMemory(dev, mem_out, NULL);
  vkDestroyCommandPool(dev, cpool, NULL);
  vkDestroyDevice(dev, NULL);
  vkDestroyInstance(inst, NULL);
  free(phi);
  free(spirv);
  free(pds);
  free(qfs);
  return 0;
}
