#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

// SHA-256 for evidence chains. FNV-1a is debug-only and must not be used
// as an integrity claim.

struct RT4DSha256 {
    uint8_t bytes[32]{};
};

std::string rt4dSha256Hex(const RT4DSha256& digest);
RT4DSha256 rt4dSha256Bytes(const void* data, size_t byteCount);
RT4DSha256 rt4dSha256File(const std::string& path, std::string* error);

uint64_t rt4dFnv1a64Bytes(const void* data, size_t byteCount);
uint64_t rt4dFnv1a64File(const std::string& path, std::string* error);
