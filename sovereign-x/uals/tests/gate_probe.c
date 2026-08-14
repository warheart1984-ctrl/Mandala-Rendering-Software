#include <stdio.h>
#include <string.h>
#include "axiom/uals.h"

int gate_probe(const uals_device **devices, uint32_t *count) {
  uals_status st = uals_probe(UALS_BACKEND_OPENCL, devices, count);
  if (st == UALS_ERR_NO_DEVICE) {
    printf("  no OpenCL device found (ICD not registered on this host)\n");
    return 0;
  }
  if (st != UALS_OK) {
    printf("  probe failed: %s\n", uals_status_str(st));
    return 0;
  }
  printf("  %u device(s):\n", *count);
  for (uint32_t i = 0; i < *count; i++) {
    printf("    [%u] %s vendor=0x%04X mem=%llu MB wg=%u %s\n",
           i, (*devices)[i].name, (*devices)[i].vendor_id,
           (unsigned long long)((*devices)[i].global_mem_bytes >> 20),
           (*devices)[i].max_workgroup_size,
           ((*devices)[i].flags & UALS_DEVICE_FLAG_GPU) ? "GPU" : "CPU");
  }
  return 1;
}