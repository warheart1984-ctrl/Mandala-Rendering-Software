#include "kernels/cpu/rt4d_matvec.h"

#include <cmath>
#include <cstddef>

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
        const float* row =
            A + static_cast<std::size_t>(i) * static_cast<std::size_t>(N);
        float acc = 0.0f;
        for (int j = 0; j < N; ++j) {
            if (!std::isfinite(row[j]) || !std::isfinite(x[j])) {
                if (error) *error = "matvec requires finite A and x";
                return false;
            }
            acc += row[j] * x[j];
        }
        if (!std::isfinite(acc)) {
            if (error) *error = "matvec produced a non-finite result";
            return false;
        }
        y[i] = acc;
    }
    return true;
}
