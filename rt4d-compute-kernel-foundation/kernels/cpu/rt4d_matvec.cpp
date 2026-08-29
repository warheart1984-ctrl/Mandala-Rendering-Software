#include "kernels/cpu/rt4d_matvec.h"

bool rt4dMatvecClean(const float* A, const float* x, float* y, int M, int N,
                    std::string* error) {
    if (A == nullptr || x == nullptr || y == nullptr) {
        if (error) *error = "matvec requires non-null A, x, and y";
        return false;
    }
    if (M <= 0 || N <= 0) {
        if (error) *error = "matvec requires positive M and N";
        return false;
    }
    for (int i = 0; i < M; ++i) {
        const float* row = A + static_cast<std::size_t>(i) * static_cast<std::size_t>(N);
        float acc = 0.0f;
        for (int j = 0; j < N; ++j) {
            acc += row[j] * x[j];
        }
        y[i] = acc;
    }
    return true;
}
