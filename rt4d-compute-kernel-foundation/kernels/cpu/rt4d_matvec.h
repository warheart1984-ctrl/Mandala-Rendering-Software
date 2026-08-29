#pragma once

#include <cstddef>
#include <string>

// y = A * x
// A: M x N matrix (row-major)
// x: N vector
// y: M vector
//
// Algebra is the definition: y_i = sum_j A_ij * x_j
// Diagnostic-only. No renderer or pixel authority.

bool rt4dMatvecClean(
    const float* A,
    const float* x,
    float* y,
    int M,
    int N,
    std::string* error);

inline std::size_t rt4dMatvecElementCount(int M, int N) {
    if (M <= 0 || N <= 0) return 0;
    return static_cast<std::size_t>(M) * static_cast<std::size_t>(N);
}
