#include <hip/hip_runtime.h>
#include <cstdio>

__global__ void addOne(int* x) {
  if (threadIdx.x == 0 && blockIdx.x == 0) {
    x[0] = x[0] + 1;
  }
}

int main() {
  int deviceCount = 0;
  hipError_t st = hipGetDeviceCount(&deviceCount);
  std::printf("hipGetDeviceCount status=%d count=%d\n", (int)st, deviceCount);
  if (st != hipSuccess || deviceCount < 1) {
    std::printf("NO_DEVICE\n");
    return 2;
  }
  int h = 41;
  int* d = nullptr;
  st = hipMalloc((void**)&d, sizeof(int));
  if (st != hipSuccess) { std::printf("hipMalloc fail %d\n", (int)st); return 3; }
  st = hipMemcpy(d, &h, sizeof(int), hipMemcpyHostToDevice);
  if (st != hipSuccess) { std::printf("H2D fail %d\n", (int)st); return 4; }
  hipLaunchKernelGGL(addOne, dim3(1), dim3(1), 0, 0, d);
  st = hipDeviceSynchronize();
  if (st != hipSuccess) { std::printf("sync fail %d\n", (int)st); return 5; }
  st = hipMemcpy(&h, d, sizeof(int), hipMemcpyDeviceToHost);
  hipFree(d);
  std::printf("RESULT=%d\n", h);
  return (h == 42) ? 0 : 6;
}
