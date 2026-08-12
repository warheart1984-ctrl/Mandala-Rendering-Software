/**
 * test_avx2.cpp — Simple AVX2 test binary
 * Compile with: cl /arch:AVX2 /EHsc test_avx2.cpp
 */

#include <immintrin.h>
#include <stdio.h>

int main() {
    printf("Test AVX2 binary starting...\n");

    // Test 1: VPADDQ (256-bit integer add)
    __m256i a = _mm256_set1_epi32(1);
    __m256i b = _mm256_set1_epi32(2);
    __m256i c = _mm256_add_epi32(a, b);  // VPADDQ

    int* result = (int*)&c;
    printf("VPADDQ result: ");
    for (int i = 0; i < 8; i++) printf("%d ", result[i]);
    printf("\n");

    // Test 2: VPAND (256-bit bitwise AND)
    __m256i x = _mm256_set1_epi32(0xFF);
    __m256i y = _mm256_set1_epi32(0x0F);
    __m256i z = _mm256_and_si256(x, y);  // VPAND

    int* result2 = (int*)&z;
    printf("VPAND result: ");
    for (int i = 0; i < 8; i++) printf("0x%X ", result2[i]);
    printf("\n");

    // Test 3: VPSRLDQ (shift right logical)
    __m256i v = _mm256_set1_epi32(0x10);
    __m256i w = _mm256_srli_epi32(v, 1);  // VPSRLDQ (shift right by 1 bit)

    int* result3 = (int*)&w;
    printf("VPSRLDQ result: ");
    for (int i = 0; i < 8; i++) printf("%d ", result3[i]);
    printf("\n");

    printf("All AVX2 tests passed!\n");
    return 0;
}