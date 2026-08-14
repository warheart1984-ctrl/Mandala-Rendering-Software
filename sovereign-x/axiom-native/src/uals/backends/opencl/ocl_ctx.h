#ifndef AXIOM_UALS_OCL_CTX_H
#define AXIOM_UALS_OCL_CTX_H

#include <CL/cl.h>
#include "axiom/uals.h"

typedef cl_int (CL_API_CALL *pfn_clGetPlatformIDs)(cl_uint, cl_platform_id *, cl_uint *);
typedef cl_int (CL_API_CALL *pfn_clGetDeviceIDs)(cl_platform_id, cl_device_type, cl_uint, cl_device_id *, cl_uint *);
typedef cl_int (CL_API_CALL *pfn_clGetDeviceInfo)(cl_device_id, cl_device_info, size_t, void *, size_t *);
typedef cl_context (CL_API_CALL *pfn_clCreateContext)(const cl_context_properties *, cl_uint, const cl_device_id *, void (*)(const char *, const void *, size_t, void *), void *, cl_int *);
typedef cl_command_queue (CL_API_CALL *pfn_clCreateCommandQueue)(cl_context, cl_device_id, cl_command_queue_properties, cl_int *);
typedef cl_int (CL_API_CALL *pfn_clReleaseCommandQueue)(cl_command_queue);
typedef cl_int (CL_API_CALL *pfn_clReleaseContext)(cl_context);
typedef cl_program (CL_API_CALL *pfn_clCreateProgramWithSource)(cl_context, cl_uint, const char **, const size_t *, cl_int *);
typedef cl_int (CL_API_CALL *pfn_clBuildProgram)(cl_program, cl_uint, const cl_device_id *, const char *, void (*)(cl_program, void *), void *);
typedef cl_int (CL_API_CALL *pfn_clGetProgramBuildInfo)(cl_program, cl_device_id, cl_program_build_info, size_t, void *, size_t *);
typedef cl_kernel (CL_API_CALL *pfn_clCreateKernel)(cl_program, const char *, cl_int *);
typedef cl_int (CL_API_CALL *pfn_clSetKernelArg)(cl_kernel, cl_uint, size_t, const void *);
typedef cl_mem (CL_API_CALL *pfn_clCreateBuffer)(cl_context, cl_mem_flags, size_t, void *, cl_int *);
typedef cl_int (CL_API_CALL *pfn_clEnqueueNDRangeKernel)(cl_command_queue, cl_kernel, cl_uint, const size_t *, const size_t *, const size_t *, cl_uint, const cl_event *, cl_event *);
typedef void * (CL_API_CALL *pfn_clEnqueueMapBuffer)(cl_command_queue, cl_mem, cl_bool, cl_map_flags, size_t, size_t, cl_uint, const cl_event *, cl_event *, cl_int *);
typedef cl_int (CL_API_CALL *pfn_clEnqueueUnmapMemObject)(cl_command_queue, cl_mem, void *, cl_uint, const cl_event *, cl_event *);
typedef cl_int (CL_API_CALL *pfn_clFinish)(cl_command_queue);
typedef cl_int (CL_API_CALL *pfn_clReleaseMemObject)(cl_mem);
typedef cl_int (CL_API_CALL *pfn_clReleaseKernel)(cl_kernel);
typedef cl_int (CL_API_CALL *pfn_clReleaseProgram)(cl_program);

typedef struct uals_ocl_api {
  pfn_clGetPlatformIDs                 clGetPlatformIDs;
  pfn_clGetDeviceIDs                   clGetDeviceIDs;
  pfn_clGetDeviceInfo                  clGetDeviceInfo;
  pfn_clCreateContext                  clCreateContext;
  pfn_clCreateCommandQueue             clCreateCommandQueue;
  pfn_clReleaseCommandQueue            clReleaseCommandQueue;
  pfn_clReleaseContext                 clReleaseContext;
  pfn_clCreateProgramWithSource        clCreateProgramWithSource;
  pfn_clBuildProgram                   clBuildProgram;
  pfn_clGetProgramBuildInfo            clGetProgramBuildInfo;
  pfn_clCreateKernel                   clCreateKernel;
  pfn_clSetKernelArg                   clSetKernelArg;
  pfn_clCreateBuffer                   clCreateBuffer;
  pfn_clEnqueueNDRangeKernel           clEnqueueNDRangeKernel;
  pfn_clEnqueueMapBuffer               clEnqueueMapBuffer;
  pfn_clEnqueueUnmapMemObject          clEnqueueUnmapMemObject;
  pfn_clFinish                         clFinish;
  pfn_clReleaseMemObject               clReleaseMemObject;
  pfn_clReleaseKernel                  clReleaseKernel;
  pfn_clReleaseProgram                 clReleaseProgram;
} uals_ocl_api;

extern uals_ocl_api uals_ocl;
extern uals_status  uals_ocl_load(void);

typedef struct uals_context {
  uals_backend_kind backend_kind;
  uals_device       device;
  cl_context        cl_ctx;
  cl_device_id      cl_dev;
  cl_command_queue  cl_queue;
  cl_program        cl_prog;
  cl_kernel         cl_kern;
  cl_kernel         cl_kern_integrator;
  cl_mem            cl_buf;
  size_t            buf_bytes;
  int               built;
  uint32_t          wg_size;
  char              kernel_id[64];
} uals_context;

const char *uals_kernel_source(void);
uals_status uals_ocl_ensure_kernel(uals_context *ctx);
uals_status uals_ocl_launch(uals_context *ctx, const uals_axiom_x_args *args);
uals_status uals_ocl_launch_integrator(uals_context *ctx, const uals_axiom_x_args *args);

#endif