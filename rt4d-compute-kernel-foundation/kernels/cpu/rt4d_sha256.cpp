#include "kernels/cpu/rt4d_sha256.h"

#include <cstring>
#include <fstream>
#include <iterator>
#include <vector>

namespace {

constexpr uint32_t kK[64] = {
    0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u, 0x3956c25bu,
    0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u, 0xd807aa98u, 0x12835b01u,
    0x243185beu, 0x550c7dc3u, 0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u,
    0xc19bf174u, 0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu,
    0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau, 0x983e5152u,
    0xa831c66du, 0xb00327c8u, 0xbf597fc7u, 0xc6e00bf3u, 0xd5a79147u,
    0x06ca6351u, 0x14292967u, 0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu,
    0x53380d13u, 0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
    0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u, 0xd192e819u,
    0xd6990624u, 0xf40e3585u, 0x106aa070u, 0x19a4c116u, 0x1e376c08u,
    0x2748774cu, 0x34b0bcb5u, 0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu,
    0x682e6ff3u, 0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u,
    0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u};

uint32_t rotr(uint32_t x, uint32_t n) {
    return (x >> n) | (x << (32u - n));
}

void process(uint32_t state[8], const uint8_t block[64]) {
    uint32_t w[64];
    for (int i = 0; i < 16; ++i) {
        w[i] = (static_cast<uint32_t>(block[i * 4]) << 24) |
               (static_cast<uint32_t>(block[i * 4 + 1]) << 16) |
               (static_cast<uint32_t>(block[i * 4 + 2]) << 8) |
               static_cast<uint32_t>(block[i * 4 + 3]);
    }
    for (int i = 16; i < 64; ++i) {
        const uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^
                             (w[i - 15] >> 3);
        const uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^
                             (w[i - 2] >> 10);
        w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    uint32_t a = state[0], b = state[1], c = state[2], d = state[3];
    uint32_t e = state[4], f = state[5], g = state[6], h = state[7];
    for (int i = 0; i < 64; ++i) {
        const uint32_t S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const uint32_t ch = (e & f) ^ ((~e) & g);
        const uint32_t temp1 = h + S1 + ch + kK[i] + w[i];
        const uint32_t S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
        const uint32_t temp2 = S0 + maj;
        h = g;
        g = f;
        f = e;
        e = d + temp1;
        d = c;
        c = b;
        b = a;
        a = temp1 + temp2;
    }
    state[0] += a;
    state[1] += b;
    state[2] += c;
    state[3] += d;
    state[4] += e;
    state[5] += f;
    state[6] += g;
    state[7] += h;
}

}  // namespace

std::string rt4dSha256Hex(const RT4DSha256& digest) {
    static const char* kHex = "0123456789abcdef";
    std::string out(64, '0');
    for (int i = 0; i < 32; ++i) {
        out[static_cast<size_t>(i) * 2] = kHex[digest.bytes[i] >> 4];
        out[static_cast<size_t>(i) * 2 + 1] = kHex[digest.bytes[i] & 0x0f];
    }
    return out;
}

RT4DSha256 rt4dSha256Bytes(const void* data, size_t byteCount) {
    uint32_t state[8] = {0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
                          0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u};
    const auto* bytes = static_cast<const uint8_t*>(data);
    size_t offset = 0;
    uint8_t block[64];
    while (byteCount - offset >= 64) {
        process(state, bytes + offset);
        offset += 64;
    }
    const size_t remain = byteCount - offset;
    std::memcpy(block, bytes + offset, remain);
    block[remain] = 0x80;
    if (remain >= 56) {
        std::memset(block + remain + 1, 0, 63 - remain);
        process(state, block);
        std::memset(block, 0, 56);
    } else {
        std::memset(block + remain + 1, 0, 55 - remain);
    }
    const uint64_t bitCount = static_cast<uint64_t>(byteCount) * 8ull;
    for (int i = 0; i < 8; ++i)
        block[63 - i] = static_cast<uint8_t>(bitCount >> (8 * i));
    process(state, block);
    RT4DSha256 digest{};
    for (int i = 0; i < 8; ++i) {
        digest.bytes[i * 4] = static_cast<uint8_t>(state[i] >> 24);
        digest.bytes[i * 4 + 1] = static_cast<uint8_t>(state[i] >> 16);
        digest.bytes[i * 4 + 2] = static_cast<uint8_t>(state[i] >> 8);
        digest.bytes[i * 4 + 3] = static_cast<uint8_t>(state[i]);
    }
    return digest;
}

RT4DSha256 rt4dSha256File(const std::string& path, std::string* error) {
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        if (error) *error = "cannot open file for sha256";
        return {};
    }
    std::vector<char> bytes((std::istreambuf_iterator<char>(input)),
                             std::istreambuf_iterator<char>());
    return rt4dSha256Bytes(bytes.data(), bytes.size());
}

uint64_t rt4dFnv1a64Bytes(const void* data, size_t byteCount) {
    uint64_t hash = 1469598103934665603ull;
    const auto* bytes = static_cast<const uint8_t*>(data);
    for (size_t i = 0; i < byteCount; ++i) {
        hash ^= bytes[i];
        hash *= 1099511628211ull;
    }
    return hash;
}

uint64_t rt4dFnv1a64File(const std::string& path, std::string* error) {
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        if (error) *error = "cannot open file for fnv";
        return 0;
    }
    uint64_t hash = 1469598103934665603ull;
    char c = 0;
    while (input.get(c)) {
        hash ^= static_cast<unsigned char>(c);
        hash *= 1099511628211ull;
    }
    return hash;
}
