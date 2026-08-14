/**
 * ditb_test.cpp — deterministic byte-level harness for DITB decode/emulate
 * Links against ditb.lib (import lib of ditb.dll).
 * No AVX2 needed at runtime: feeds crafted instruction bytes + register
 * state into DITB_DecodeAndEmulate and checks results.
 */

#include <windows.h>
#include <immintrin.h>
#include <stdio.h>
#include <string.h>

extern "C" __declspec(dllimport)
int DITB_DecodeAndEmulate(const unsigned char* bytes, int maxLen,
                          CONTEXT* pCtx, __m256i* ymm, int* consumedOut);

static int g_fails = 0;

static void Check(int cond, const char* name) {
    printf("  %-52s %s\n", name, cond ? "PASS" : "FAIL");
    fflush(stdout);
    if (!cond) g_fails++;
}

static unsigned long long L(const __m256i& v, int lane) {
    return ((unsigned long long*)&v)[lane];
}

int main() {
    setvbuf(stdout, NULL, _IONBF, 0);
    __m256i ymm[16];
    CONTEXT ctx;
    int consumed = 0;

    memset(ymm, 0, sizeof(ymm));
    memset(&ctx, 0, sizeof(ctx));

    printf("DITB decode/emulate harness\n");

    // 1. C5-form VPADDQ with 64-bit carry: vpaddq ymm0,ymm1,ymm2 = C5 F5 D4 C2
    printf("1. C5 VPADDQ carry\n");
    memset(ymm, 0, sizeof(ymm));
    unsigned char i1[] = { 0xC5, 0xF5, 0xD4, 0xC2 };
    ymm[1] = _mm256_set1_epi64x(-1);
    ymm[2] = _mm256_set1_epi64x(2);
    Check(DITB_DecodeAndEmulate(i1, 4, &ctx, ymm, &consumed) == 1, "translated");
    Check(consumed == 4, "length == 4");
    Check(L(ymm[0], 0) == 0x0000000100000001ULL, "carry lane correct");
    Check(L(ymm[0], 3) == 0x0000000100000001ULL, "all lanes correct");

// 2. C4-form VPADDD 3-operand reg: vpaddd ymm1,ymm0,ymm0 = C4 E1 7D FE C8
    printf("2. C4 VPADDD\n");
    memset(ymm, 0, sizeof(ymm));
    unsigned char i2[] = { 0xC4, 0xE1, 0x7D, 0xFE, 0xC8 };
    ymm[0] = _mm256_set1_epi32(5);
    Check(DITB_DecodeAndEmulate(i2, 5, &ctx, ymm, &consumed) == 1, "translated");
    Check(consumed == 5, "length == 5");
    Check(((int*)&ymm[1])[0] == 10 && ((int*)&ymm[1])[7] == 10, "dst ymm1 = 10");

    // 3. C5-form VPSRLDQ byte shift: vpsrldq ymm0,ymm0,1 = C5 FD 73 D0 01
    printf("3. C5 VPSRLDQ byte-shift\n");
    memset(ymm, 0, sizeof(ymm));
    unsigned char i3[] = { 0xC5, 0xFD, 0x73, 0xD0, 0x01 };
    ymm[0] = _mm256_set1_epi32(0x10);
    Check(DITB_DecodeAndEmulate(i3, 5, &ctx, ymm, &consumed) == 1, "translated");
    Check(((int*)&ymm[0])[0] == 0, "low dword = 0 (byte shift)");
    Check(((int*)&ymm[0])[7] == 0, "high dword = 0");

    // 4. C5-form VPSRLDQ is NOT vpsrld: epi32 shift of 0x10>>1 would be 8
    printf("4. C5 VPSRLD vs VPSRLDQ discrimination\n");
    memset(ymm, 0, sizeof(ymm));
    unsigned char i4[] = { 0xC5, 0xFD, 0x72, 0xD0, 0x01 };  // vpsrld ymm0,ymm0,1
    ymm[0] = _mm256_set1_epi32(0x10);
    Check(DITB_DecodeAndEmulate(i4, 5, &ctx, ymm, &consumed) == 1, "translated");
    Check(((int*)&ymm[0])[0] == 8, "vpsrld: 0x10>>1 = 8");

    // 5. Memory operand, mod=10 disp32: vpaddd ymm0,ymm0,[rbp+0x40] = C5 FD FE 85 40 00 00 00
    printf("5. Memory operand [rbp+disp32]\n");
    memset(ymm, 0, sizeof(ymm));
    __declspec(align(32)) int mem5[8];
    for (int i = 0; i < 8; i++) mem5[i] = 100;
    unsigned char i5[] = { 0xC5, 0xFD, 0xFE, 0x85, 0x40, 0x00, 0x00, 0x00 };
    memset(&ctx, 0, sizeof(ctx));
    ctx.Rbp = (ULONG64)((char*)mem5 - 0x40);
    ymm[0] = _mm256_set1_epi32(7);
    Check(DITB_DecodeAndEmulate(i5, 8, &ctx, ymm, &consumed) == 1, "translated");
    Check(consumed == 8, "length == 8");
    Check(((int*)&ymm[0])[0] == 107 && ((int*)&ymm[0])[7] == 107, "7 + 100 = 107");

    // 6. RIP-relative operand: vpaddd ymm0,ymm0,[rip+disp] = C5 FD FE 05 <disp>
    printf("6. RIP-relative operand\n");
    memset(ymm, 0, sizeof(ymm));
    __declspec(align(32)) int mem6[8];
    for (int i = 0; i < 8; i++) mem6[i] = 200;
    unsigned char i6[8] = { 0xC5, 0xFD, 0xFE, 0x05, 0, 0, 0, 0 };
    memset(&ctx, 0, sizeof(ctx));
    ctx.Rip = (ULONG64)i6;
    LONG disp = (LONG)((char*)mem6 - ((char*)i6 + 8));
    memcpy(i6 + 4, &disp, 4);
    ymm[0] = _mm256_set1_epi32(3);
    Check(DITB_DecodeAndEmulate(i6, 8, &ctx, ymm, &consumed) == 1, "translated");
    Check(((int*)&ymm[0])[0] == 203, "3 + 200 = 203");

    // 7. SIB base+index: vpaddd ymm0,ymm0,[rbx+rcx*4] = C5 FD FE 04 8B
    printf("7. SIB base+index*scale\n");
    memset(ymm, 0, sizeof(ymm));
    __declspec(align(32)) int mem7[8];
    for (int i = 0; i < 8; i++) mem7[i] = 50;
    unsigned char i7[] = { 0xC5, 0xFD, 0xFE, 0x04, 0x8B };
    memset(&ctx, 0, sizeof(ctx));
    ctx.Rbx = (ULONG64)mem7;
    ctx.Rcx = 0;
    ymm[0] = _mm256_set1_epi32(9);
    Check(DITB_DecodeAndEmulate(i7, 5, &ctx, ymm, &consumed) == 1, "translated");
    Check(consumed == 5, "length == 5");
    Check(((int*)&ymm[0])[0] == 59, "9 + 50 = 59");

    // 8. VEX.W=1 VPBROADCASTQ from memory: vpbroadcastq ymm0,[rbp+disp] = C4 E2 FD 59 85 <disp>
    printf("8. VPBROADCASTQ (0F38 59)\n");
    memset(ymm, 0, sizeof(ymm));
    unsigned long long mem8 = 0x1122334455667788ULL;
    unsigned char i8[] = { 0xC4, 0xE2, 0xFD, 0x59, 0x85, 0x00, 0x10, 0x00, 0x00 };
    memset(&ctx, 0, sizeof(ctx));
    ctx.Rbp = (ULONG64)((char*)&mem8 - 0x1000);
    Check(DITB_DecodeAndEmulate(i8, 9, &ctx, ymm, &consumed) == 1, "translated");
    Check(consumed == 9, "length == 9");
    Check(L(ymm[0], 0) == 0x1122334455667788ULL && L(ymm[0], 3) == 0x1122334455667788ULL,
          "broadcast all lanes");

    // 9. Group 12 (0x73) VPSLLDQ shift-left-by-bytes: vpslldq ymm0,ymm0,2 = C5 FD 73 F8 02
    printf("9. VPSLLDQ (73 /7)\n");
    memset(ymm, 0, sizeof(ymm));
    unsigned char i9[] = { 0xC5, 0xFD, 0x73, 0xF8, 0x02 };
    ymm[0] = _mm256_set1_epi32(0x10);
    Check(DITB_DecodeAndEmulate(i9, 5, &ctx, ymm, &consumed) == 1, "translated");
    Check(((int*)&ymm[0])[0] == 0x1000, "low dword = 0x1000 (shift left 2 bytes)");

    // 10. Non-256-bit (L=0) must NOT be translated
    printf("10. L=0 rejected\n");
    memset(ymm, 0, sizeof(ymm));
    unsigned char i10[] = { 0xC5, 0xF5, 0xD4, 0xC2 };  // C5 F5: L=0 -> vpaddq xmm
    Check(DITB_DecodeAndEmulate(i10, 4, &ctx, ymm, &consumed) == 0, "not translated");

    // 11. Non-VEX prefix rejected
    printf("11. Legacy prefix rejected\n");
    memset(ymm, 0, sizeof(ymm));
    unsigned char i11[] = { 0x66, 0x0F, 0xFE, 0xC0 };
    Check(DITB_DecodeAndEmulate(i11, 4, &ctx, ymm, &consumed) == 0, "not translated");

    // 12. C4 REX.B register extension: vpaddd ymm1,ymm0,ymm9 = C4 C1 7D FE C9
    printf("12. C4 REX.B (ymm9 src)\n");
    memset(ymm, 0, sizeof(ymm));
    unsigned char i12[] = { 0xC4, 0xC1, 0x7D, 0xFE, 0xC9 };
    ymm[0] = _mm256_set1_epi32(4);
    ymm[9] = _mm256_set1_epi32(6);
    Check(DITB_DecodeAndEmulate(i12, 5, &ctx, ymm, &consumed) == 1, "translated");
    Check(((int*)&ymm[1])[0] == 10, "ymm1 = 4 + 6 = 10");

    printf("\n%s (%d failures)\n", g_fails ? "HARNESS FAILED" : "ALL HARNESS TESTS PASSED", g_fails);
    return g_fails ? 1 : 0;
}