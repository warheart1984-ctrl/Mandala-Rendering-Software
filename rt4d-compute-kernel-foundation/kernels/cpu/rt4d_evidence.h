#pragma once

#include "kernels/cpu/rt4d_sha256.h"

#include <cstddef>
#include <cstdint>
#include <string>

enum class RT4DPublishStatus {
    published,
    overwrite_rejected,
    unwritable,
    disk_full,
    empty_or_truncated,
    invalid_path
};

struct RT4DPublishResult {
    RT4DPublishStatus status = RT4DPublishStatus::invalid_path;
    std::string path;
    std::string sha256;
    uint64_t fnv1a64 = 0;  // debug/local id only; never an integrity claim
    std::string detail;
};

const char* rt4dPublishStatusName(RT4DPublishStatus status);

// Atomic publish: refuse overwrite, write via .partial, then rename.
RT4DPublishResult rt4dPublishBytes(const std::string& path, const void* data,
                                     size_t byteCount);
RT4DPublishResult rt4dPublishText(const std::string& path,
                                    const std::string& text);

struct RT4DFailureReceipt {
    std::string schema = "rt4d-failure-receipt/0.1";
    std::string mode = "diagnostic_only";
    std::string operation;
    std::string path;
    std::string status;
    std::string detail;
    bool rendererPixelAuthority = false;
};

bool rt4dWriteFailureReceipt(const std::string& path,
                             const RT4DFailureReceipt& receipt,
                             std::string* error);

std::string rt4dJsonEscape(const std::string& value);
