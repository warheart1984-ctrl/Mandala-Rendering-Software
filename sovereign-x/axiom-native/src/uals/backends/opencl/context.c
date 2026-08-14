#include <stdlib.h>
#include <string.h>
#include "ocl_ctx.h"

UALS_API uals_status uals_create(const uals_device *dev, const uals_kernel_meta *meta,
                                 uals_context **out_ctx) {
  if (!dev || !meta || !out_ctx) return UALS_ERR_INVALID_ARG;
  uals_status st = uals_ocl_load();
  if (st != UALS_OK) return st;

  cl_platform_id platforms[8];
  cl_uint nplatforms = 0;
  if (uals_ocl.clGetPlatformIDs(8, platforms, &nplatforms) != CL_SUCCESS || nplatforms == 0)
    return UALS_ERR_NO_DEVICE;

  cl_device_id cdev = NULL;
  cl_uint ndevs = 0;
  if (uals_ocl.clGetDeviceIDs(platforms[0], CL_DEVICE_TYPE_ALL, 1, &cdev, &ndevs) != CL_SUCCESS ||
      ndevs == 0)
    return UALS_ERR_NO_DEVICE;

  cl_int err = CL_SUCCESS;
  cl_context_properties props[3] = { CL_CONTEXT_PLATFORM, (cl_context_properties)platforms[0], 0 };
  cl_context cctx = uals_ocl.clCreateContext(props, 1, &cdev, NULL, NULL, &err);
  if (!cctx || err != CL_SUCCESS) return UALS_ERR_UNSUPPORTED;

  cl_command_queue q = uals_ocl.clCreateCommandQueue(cctx, cdev, 0, &err);
  if (!q || err != CL_SUCCESS) {
    uals_ocl.clReleaseContext(cctx);
    return UALS_ERR_UNSUPPORTED;
  }

  uals_context *ctx = (uals_context *)malloc(sizeof(uals_context));
  if (!ctx) {
    uals_ocl.clReleaseCommandQueue(q);
    uals_ocl.clReleaseContext(cctx);
    return UALS_ERR_OUT_OF_MEM;
  }
  memset(ctx, 0, sizeof(*ctx));
  ctx->backend_kind = UALS_BACKEND_OPENCL;
  ctx->device = *dev;
  ctx->cl_ctx = cctx;
  ctx->cl_dev = cdev;
  ctx->cl_queue = q;
  ctx->built = 0;
  *out_ctx = ctx;
  return UALS_OK;
}

UALS_API void uals_destroy(uals_context *ctx) {
  if (!ctx) return;
  if (ctx->cl_buf) uals_ocl.clReleaseMemObject(ctx->cl_buf);
  if (ctx->cl_kern) uals_ocl.clReleaseKernel(ctx->cl_kern);
  if (ctx->cl_kern_integrator) uals_ocl.clReleaseKernel(ctx->cl_kern_integrator);
  if (ctx->cl_prog) uals_ocl.clReleaseProgram(ctx->cl_prog);
  if (ctx->cl_queue) uals_ocl.clReleaseCommandQueue(ctx->cl_queue);
  if (ctx->cl_ctx) uals_ocl.clReleaseContext(ctx->cl_ctx);
  free(ctx);
}