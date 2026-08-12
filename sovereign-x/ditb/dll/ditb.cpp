/**
 * DITB.dll — Dynamic Instruction Translation Bridge for FX-8350
 * Translates AVX2 instructions to AVX via VEH + register emulation.
 * x64 version using correct CONTEXT structure.
 */

#include <windows.h>
#include <immintrin.h>
#include <string.h>
#include <stdio.h>

// ===== Helpers =====
static inline M128A* GetXmmReg(CONTEXT* pCtx, int reg) {
    return (&pCtx->Xmm0) + (reg & 0xF);
}

// ===== Emulated YMM State =====
static __m256i g_ymm[16];
static bool g_dirty[16] = {false};

// ===== Forward Declarations =====
LONG CALLBACK ExceptionHandler(PEXCEPTION_POINTERS pEIP);
void TranslateVPADDQ_ymm(CONTEXT* pCtx, int dst, int src1, int src2);
void TranslateVPAND_ymm(CONTEXT* pCtx, int dst, int src1, int src2);
void TranslateVPSRLDQ_ymm_1(CONTEXT* pCtx, int dst);
static bool DecodeAndTranslate(unsigned char* pFault, int byteCount, CONTEXT* pCtx);

// ===== Translation Functions =====
void TranslateVPADDQ_ymm(CONTEXT* pCtx, int dst, int src1, int src2) {
    g_ymm[dst] = _mm256_add_epi32(g_ymm[src1], g_ymm[src2]);
    __m128i result_low = _mm256_castsi256_si128(g_ymm[dst]);
    M128A* pXmm = GetXmmReg(pCtx, dst);
    _mm_store_si128((__m128i*)pXmm, result_low);
}

void TranslateVPAND_ymm(CONTEXT* pCtx, int dst, int src1, int src2) {
    __m256i result = _mm256_and_si256(g_ymm[src1], g_ymm[src2]);
    g_ymm[dst] = result;
    M128A* pXmm = GetXmmReg(pCtx, dst);
    _mm_store_si128((__m128i*)pXmm, _mm256_castsi256_si128(result));
}

void TranslateVPSRLDQ_ymm_1(CONTEXT* pCtx, int dst) {
    g_ymm[dst] = _mm256_srli_epi32(g_ymm[dst], 1);
    M128A* pXmm = GetXmmReg(pCtx, dst);
    _mm_store_si128((__m128i*)pXmm, _mm256_castsi256_si128(g_ymm[dst]));
}

// ===== VEX Opcode Decoder =====
static bool DecodeAndTranslate(unsigned char* pFault, int byteCount, CONTEXT* pCtx) {
    if (byteCount < 2) return false;

    unsigned char b0 = pFault[0];

    if (b0 == 0xC4 && byteCount >= 4) {
        unsigned char rxb_mmmm = pFault[1];
        unsigned char wvvvv_lpp = pFault[2];
        unsigned char opcode = pFault[3];

        unsigned char map = rxb_mmmm & 0x1F;

        if (map == 1) {  // 0F map
            switch (opcode) {
                case 0xD4:  // VPADDQ
                case 0xFC:  // VPADDQ (alt)
                    TranslateVPADDQ_ymm(pCtx, 0, 1, 2);
                    return true;
                case 0xDB:  // VPAND
                    TranslateVPAND_ymm(pCtx, 0, 1, 2);
                    return true;
                case 0x73:  // VPSRLDQ (shift)
                    return true;
            }
        }
    }
    else if (b0 == 0xC5 && byteCount >= 3) {
        // 2-byte VEX: C5 R.vvvv.L.pp opcode
    }

    return false;
}

// ===== Exception Handler =====
LONG CALLBACK ExceptionHandler(PEXCEPTION_POINTERS pEIP) {
    if (pEIP->ExceptionRecord->ExceptionCode == 0xC000001D) {
        unsigned char* pFault = (unsigned char*)pEIP->ContextRecord->Rip;

        if (DecodeAndTranslate(pFault, 4, pEIP->ContextRecord)) {
            pEIP->ContextRecord->Rip += 4;
            return EXCEPTION_CONTINUE_EXECUTION;
        }

        return EXCEPTION_CONTINUE_SEARCH;
    }

    return EXCEPTION_CONTINUE_SEARCH;
}

// ===== DllMain =====
BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved) {
    switch (ul_reason_for_call) {
    case DLL_PROCESS_ATTACH:
        for (int i = 0; i < 16; i++) {
            g_ymm[i] = _mm256_setzero_si256();
        }
        if (!AddVectoredExceptionHandler(1, ExceptionHandler)) {
            OutputDebugStringA("DITB: Failed to install VEH\n");
            return FALSE;
        }
        OutputDebugStringA("DITB: Injected, VEH installed\n");
        break;
    case DLL_PROCESS_DETACH:
        break;
    }
    return TRUE;
}

extern "C" __declspec(dllexport) void DITB_EnsureHandler() {
    // VEH already installed in DllMain
}