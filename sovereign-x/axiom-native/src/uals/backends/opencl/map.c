#include "ocl_ctx.h"

uals_status uals_ocl_launch(uals_context *ctx, const uals_axiom_x_args *args) {
  size_t nbytes = (size_t)args->width * (size_t)args->height * 4u;
  cl_int err = CL_SUCCESS;
  if (ctx->cl_buf) {
    uals_ocl.clReleaseMemObject(ctx->cl_buf);
    ctx->cl_buf = NULL;
  }
  ctx->cl_buf = uals_ocl.clCreateBuffer(ctx->cl_ctx, CL_MEM_WRITE_ONLY, nbytes, NULL, &err);
  if (!ctx->cl_buf || err != CL_SUCCESS) return UALS_ERR_OUT_OF_MEM;
  ctx->buf_bytes = nbytes;
  err = uals_ocl.clSetKernelArg(ctx->cl_kern, 0, sizeof(cl_mem), &ctx->cl_buf);
  if (err == CL_SUCCESS) err = uals_ocl.clSetKernelArg(ctx->cl_kern, 1, sizeof(cl_uint), &args->seed);
  if (err == CL_SUCCESS) err = uals_ocl.clSetKernelArg(ctx->cl_kern, 2, sizeof(cl_uint), &args->spp);
  if (err == CL_SUCCESS) err = uals_ocl.clSetKernelArg(ctx->cl_kern, 3, sizeof(cl_uint), &args->width);
  if (err == CL_SUCCESS) err = uals_ocl.clSetKernelArg(ctx->cl_kern, 4, sizeof(cl_uint), &args->height);
  if (err != CL_SUCCESS) return UALS_ERR_INVALID_ARG;
  size_t global[2] = { args->width, args->height };
  size_t local[2] = { ctx->wg_size, 1 };
  err = uals_ocl.clEnqueueNDRangeKernel(ctx->cl_queue, ctx->cl_kern, 2, NULL, global, local,
                                        0, NULL, NULL);
  if (err != CL_SUCCESS) return UALS_ERR_UNSUPPORTED;
  return UALS_OK;
}

uals_status uals_ocl_launch_integrator(uals_context *ctx, const uals_axiom_x_args *args) {
  size_t nbytes = (size_t)args->width * (size_t)args->height * 4u;
  cl_int err = CL_SUCCESS;
  if (ctx->cl_buf) {
    uals_ocl.clReleaseMemObject(ctx->cl_buf);
    ctx->cl_buf = NULL;
  }
  ctx->cl_buf = uals_ocl.clCreateBuffer(ctx->cl_ctx, CL_MEM_WRITE_ONLY, nbytes, NULL, &err);
  if (!ctx->cl_buf || err != CL_SUCCESS) return UALS_ERR_OUT_OF_MEM;
  ctx->buf_bytes = nbytes;
  err = uals_ocl.clSetKernelArg(ctx->cl_kern_integrator, 0, sizeof(cl_mem), &ctx->cl_buf);
  if (err == CL_SUCCESS) err = uals_ocl.clSetKernelArg(ctx->cl_kern_integrator, 1, sizeof(cl_uint), &args->seed);
  if (err == CL_SUCCESS) err = uals_ocl.clSetKernelArg(ctx->cl_kern_integrator, 2, sizeof(cl_uint), &args->spp);
  if (err == CL_SUCCESS) err = uals_ocl.clSetKernelArg(ctx->cl_kern_integrator, 3, sizeof(cl_uint), &args->width);
  if (err == CL_SUCCESS) err = uals_ocl.clSetKernelArg(ctx->cl_kern_integrator, 4, sizeof(cl_uint), &args->height);
  if (err != CL_SUCCESS) return UALS_ERR_INVALID_ARG;
  size_t global[2] = { args->width, args->height };
  size_t local[2] = { ctx->wg_size, 1 };
  err = uals_ocl.clEnqueueNDRangeKernel(ctx->cl_queue, ctx->cl_kern_integrator, 2, NULL, global, local,
                                        0, NULL, NULL);
  if (err != CL_SUCCESS) return UALS_ERR_UNSUPPORTED;
  return UALS_OK;
}

UALS_API uals_status uals_map(uals_context *ctx, uals_buffer **out_buf,
                              void **out_ptr, size_t *out_bytes) {
  if (!ctx || !out_buf || !out_ptr || !out_bytes) return UALS_ERR_INVALID_ARG;
  if (!ctx->cl_buf) return UALS_ERR_INVALID_ARG;
  cl_int err = CL_SUCCESS;
  void *p = uals_ocl.clEnqueueMapBuffer(ctx->cl_queue, ctx->cl_buf, CL_TRUE,
                                        CL_MAP_READ, 0, ctx->buf_bytes, 0, NULL, NULL, &err);
  if (!p || err != CL_SUCCESS) return UALS_ERR_UNSUPPORTED;
  *out_buf = (uals_buffer *)ctx->cl_buf;
  *out_ptr = p;
  *out_bytes = ctx->buf_bytes;
  return UALS_OK;
}

UALS_API uals_status uals_unmap(uals_context *ctx, uals_buffer *buf) {
  if (!ctx || !buf) return UALS_ERR_INVALID_ARG;
  if (uals_ocl.clEnqueueUnmapMemObject(ctx->cl_queue, (cl_mem)buf, NULL, 0, NULL, NULL) != CL_SUCCESS)
    return UALS_ERR_UNSUPPORTED;
  return UALS_OK;
}

UALS_API uals_status uals_sync(uals_context *ctx) {
  if (!ctx) return UALS_ERR_INVALID_ARG;
  if (uals_ocl.clFinish(ctx->cl_queue) != CL_SUCCESS) return UALS_ERR_UNSUPPORTED;
  return UALS_OK;
}