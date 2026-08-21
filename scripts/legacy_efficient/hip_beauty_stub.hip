/**
 * HIP beauty assist stub (compile-path evidence only on GCN Tonga).
 *
 * Intent: richer than hip_hello — sketches a tiny RGBA8 tile fill that a
 * future beauty.hip kernel could own. Device runtime on R9 380 / gfx803
 * remains blocked (hipGetDeviceCount==0 under ROCm 7.1); OpenCL still is
 * the proven GPU beauty stand-in.
 *
 * Status: compile **partial**; device run expected **blocked** on this host.
 * Never claim print SoT from this stub.
 */
#include <hip/hip_runtime.h>
#include <cstdio>
#include <cstdint>

#ifndef BEAUTY_STUB_W
#define BEAUTY_STUB_W 8
#endif
#ifndef BEAUTY_STUB_H
#define BEAUTY_STUB_H 8
#endif

__global__ void beautyTileFill(uint8_t* rgba, int width, int height, uint8_t tone) {
  const int x = blockIdx.x * blockDim.x + threadIdx.x;
  const int y = blockIdx.y * blockDim.y + threadIdx.y;
  if (x >= width || y >= height) return;
  const int i = (y * width + x) * 4;
  /* soft warm plate — not photoreal; compile/shape evidence only */
  rgba[i + 0] = tone;
  rgba[i + 1] = static_cast<uint8_t>(tone / 2);
  rgba[i + 2] = static_cast<uint8_t>(tone / 4);
  rgba[i + 3] = 255;
}

int main() {
  int deviceCount = 0;
  hipError_t st = hipGetDeviceCount(&deviceCount);
  std::printf("hipGetDeviceCount status=%d count=%d\n", (int)st, deviceCount);
  if (st != hipSuccess || deviceCount < 1) {
    std::printf("NO_DEVICE beauty_stub\n");
    return 2;
  }

  const int w = BEAUTY_STUB_W;
  const int h = BEAUTY_STUB_H;
  const size_t bytes = static_cast<size_t>(w) * static_cast<size_t>(h) * 4;
  uint8_t* d = nullptr;
  st = hipMalloc(reinterpret_cast<void**>(&d), bytes);
  if (st != hipSuccess) {
    std::printf("hipMalloc fail %d\n", (int)st);
    return 3;
  }

  dim3 block(8, 8);
  dim3 grid((w + block.x - 1) / block.x, (h + block.y - 1) / block.y);
  hipLaunchKernelGGL(beautyTileFill, grid, block, 0, 0, d, w, h, static_cast<uint8_t>(180));
  st = hipDeviceSynchronize();
  if (st != hipSuccess) {
    std::printf("sync fail %d\n", (int)st);
    hipFree(d);
    return 5;
  }

  uint8_t host[BEAUTY_STUB_W * BEAUTY_STUB_H * 4];
  st = hipMemcpy(host, d, bytes, hipMemcpyDeviceToHost);
  hipFree(d);
  if (st != hipSuccess) {
    std::printf("D2H fail %d\n", (int)st);
    return 4;
  }

  std::printf("BEAUTY_STUB_OK w=%d h=%d r0=%u\n", w, h, (unsigned)host[0]);
  return (host[0] == 180 && host[3] == 255) ? 0 : 6;
}
