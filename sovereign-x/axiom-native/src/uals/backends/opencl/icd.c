#include <string.h>
#include <windows.h>
#include "ocl_ctx.h"

uals_ocl_api uals_ocl;

static void *resolve(HMODULE lib, const char *name) {
  void *p = (void *)GetProcAddress(lib, name);
  return p;
}

uals_status uals_ocl_load(void) {
  static HMODULE lib = NULL;
  if (lib) return UALS_OK;
  lib = LoadLibraryA("OpenCL.dll");
  if (!lib) return UALS_ERR_UNSUPPORTED;
  uals_ocl.clGetPlatformIDs = (pfn_clGetPlatformIDs)resolve(lib, "clGetPlatformIDs");
  uals_ocl.clGetDeviceIDs = (pfn_clGetDeviceIDs)resolve(lib, "clGetDeviceIDs");
  uals_ocl.clGetDeviceInfo = (pfn_clGetDeviceInfo)resolve(lib, "clGetDeviceInfo");
  uals_ocl.clCreateContext = (pfn_clCreateContext)resolve(lib, "clCreateContext");
  uals_ocl.clCreateCommandQueue = (pfn_clCreateCommandQueue)resolve(lib, "clCreateCommandQueue");
  uals_ocl.clReleaseCommandQueue = (pfn_clReleaseCommandQueue)resolve(lib, "clReleaseCommandQueue");
  uals_ocl.clReleaseContext = (pfn_clReleaseContext)resolve(lib, "clReleaseContext");
  uals_ocl.clCreateProgramWithSource = (pfn_clCreateProgramWithSource)resolve(lib, "clCreateProgramWithSource");
  uals_ocl.clBuildProgram = (pfn_clBuildProgram)resolve(lib, "clBuildProgram");
  uals_ocl.clGetProgramBuildInfo = (pfn_clGetProgramBuildInfo)resolve(lib, "clGetProgramBuildInfo");
  uals_ocl.clCreateKernel = (pfn_clCreateKernel)resolve(lib, "clCreateKernel");
  uals_ocl.clSetKernelArg = (pfn_clSetKernelArg)resolve(lib, "clSetKernelArg");
  uals_ocl.clCreateBuffer = (pfn_clCreateBuffer)resolve(lib, "clCreateBuffer");
  uals_ocl.clEnqueueNDRangeKernel = (pfn_clEnqueueNDRangeKernel)resolve(lib, "clEnqueueNDRangeKernel");
  uals_ocl.clEnqueueMapBuffer = (pfn_clEnqueueMapBuffer)resolve(lib, "clEnqueueMapBuffer");
  uals_ocl.clEnqueueUnmapMemObject = (pfn_clEnqueueUnmapMemObject)resolve(lib, "clEnqueueUnmapMemObject");
  uals_ocl.clFinish = (pfn_clFinish)resolve(lib, "clFinish");
  uals_ocl.clReleaseMemObject = (pfn_clReleaseMemObject)resolve(lib, "clReleaseMemObject");
  uals_ocl.clReleaseKernel = (pfn_clReleaseKernel)resolve(lib, "clReleaseKernel");
  uals_ocl.clReleaseProgram = (pfn_clReleaseProgram)resolve(lib, "clReleaseProgram");
  if (!uals_ocl.clGetPlatformIDs || !uals_ocl.clGetDeviceIDs || !uals_ocl.clGetDeviceInfo ||
      !uals_ocl.clCreateContext || !uals_ocl.clCreateCommandQueue || !uals_ocl.clCreateProgramWithSource ||
      !uals_ocl.clBuildProgram || !uals_ocl.clCreateKernel || !uals_ocl.clSetKernelArg ||
      !uals_ocl.clCreateBuffer || !uals_ocl.clEnqueueNDRangeKernel || !uals_ocl.clEnqueueMapBuffer ||
      !uals_ocl.clEnqueueUnmapMemObject || !uals_ocl.clFinish) {
    FreeLibrary(lib);
    lib = NULL;
    return UALS_ERR_UNSUPPORTED;
  }
  return UALS_OK;
}

static uals_status vendor_id_of(const char *vendor, uint32_t *out) {
  if (!vendor) return UALS_ERR_INVALID_ARG;
  if (strstr(vendor, "AMD")) { *out = 0x1002; return UALS_OK; }
  if (strstr(vendor, "Advanced Micro Devices")) { *out = 0x1002; return UALS_OK; }
  if (strstr(vendor, "NVIDIA")) { *out = 0x10DE; return UALS_OK; }
  if (strstr(vendor, "Intel")) { *out = 0x8086; return UALS_OK; }
  *out = 0;
  return UALS_OK;
}

UALS_API uals_status uals_probe(uals_backend_kind kind, const uals_device **out_devices,
                                uint32_t *out_count) {
  static uals_device devices[UALS_MAX_DEVICES];
  if (!out_devices || !out_count) return UALS_ERR_INVALID_ARG;
  *out_count = 0;
  if (kind != UALS_BACKEND_OPENCL) return UALS_ERR_UNSUPPORTED;
  uals_status st = uals_ocl_load();
  if (st != UALS_OK) return st;

  cl_platform_id platforms[8];
  cl_uint nplatforms = 0;
  if (uals_ocl.clGetPlatformIDs(8, platforms, &nplatforms) != CL_SUCCESS || nplatforms == 0)
    return UALS_ERR_NO_DEVICE;

  uint32_t found = 0;
  for (cl_uint p = 0; p < nplatforms && found < UALS_MAX_DEVICES; p++) {
    cl_device_id devs[16];
    cl_uint ndevs = 0;
    if (uals_ocl.clGetDeviceIDs(platforms[p], CL_DEVICE_TYPE_ALL, 16, devs, &ndevs) != CL_SUCCESS)
      continue;
    for (cl_uint d = 0; d < ndevs && found < UALS_MAX_DEVICES; d++) {
      uals_device *out = &devices[found];
      memset(out, 0, sizeof(*out));
      out->backend_kind = UALS_BACKEND_OPENCL;
      {
        char vendor[UALS_MAX_NAME] = {0}, name[UALS_MAX_NAME] = {0};
        size_t sz = 0;
        uals_ocl.clGetDeviceInfo(devs[d], CL_DEVICE_VENDOR, sizeof(vendor) - 1, vendor, &sz);
        uals_ocl.clGetDeviceInfo(devs[d], CL_DEVICE_NAME, sizeof(name) - 1, name, &sz);
        vendor_id_of(vendor, &out->vendor_id);
        memcpy(out->name, name, UALS_MAX_NAME - 1);
      }
      {
        cl_ulong mem = 0;
        size_t sz = 0;
        uals_ocl.clGetDeviceInfo(devs[d], CL_DEVICE_GLOBAL_MEM_SIZE, sizeof(mem), &mem, &sz);
        out->global_mem_bytes = (uint64_t)mem;
      }
      {
        size_t wg = 0;
        size_t sz = 0;
        uals_ocl.clGetDeviceInfo(devs[d], CL_DEVICE_MAX_WORK_GROUP_SIZE, sizeof(wg), &wg, &sz);
        out->max_workgroup_size = wg ? (uint32_t)wg : 256;
      }
      {
        cl_device_type dt = 0;
        size_t sz = 0;
        uals_ocl.clGetDeviceInfo(devs[d], CL_DEVICE_TYPE, sizeof(dt), &dt, &sz);
        if (dt & CL_DEVICE_TYPE_GPU) out->flags |= UALS_DEVICE_FLAG_GPU;
        if (dt & CL_DEVICE_TYPE_CPU) out->flags |= UALS_DEVICE_FLAG_CPU;
      }
      found++;
    }
  }
  if (found == 0) return UALS_ERR_NO_DEVICE;
  *out_count = found;
  *out_devices = devices;
  return UALS_OK;
}