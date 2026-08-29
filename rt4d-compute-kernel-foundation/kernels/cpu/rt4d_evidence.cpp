#include "kernels/cpu/rt4d_evidence.h"

#include <cerrno>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <system_error>
#ifndef _WIN32
#include <fcntl.h>
#include <unistd.h>
#endif

const char* rt4dPublishStatusName(RT4DPublishStatus status) {
    switch (status) {
        case RT4DPublishStatus::published:
            return "published";
        case RT4DPublishStatus::overwrite_rejected:
            return "overwrite_rejected";
        case RT4DPublishStatus::unwritable:
            return "unwritable";
        case RT4DPublishStatus::disk_full:
            return "disk_full";
        case RT4DPublishStatus::empty_or_truncated:
            return "empty_or_truncated";
        case RT4DPublishStatus::invalid_path:
        default:
            return "invalid_path";
    }
}

std::string rt4dJsonEscape(const std::string& value) {
    std::string out;
    out.reserve(value.size());
    for (unsigned char c : value) {
        if (c == '"' || c == '\\') {
            out.push_back('\\');
            out.push_back(static_cast<char>(c));
        } else if (c == '\n') {
            out += "\\n";
        } else if (c < 0x20) {
            continue;
        } else {
            out.push_back(static_cast<char>(c));
        }
    }
    return out;
}

namespace {

RT4DPublishStatus fromErrno(int code) {
    if (code == ENOSPC || code == EDQUOT) return RT4DPublishStatus::disk_full;
    if (code == EACCES || code == EPERM || code == EROFS || code == EIO)
        return RT4DPublishStatus::unwritable;
    return RT4DPublishStatus::unwritable;
}

}  // namespace

RT4DPublishResult rt4dPublishBytes(const std::string& path, const void* data,
                                    size_t byteCount) {
    RT4DPublishResult result;
    result.path = path;
    if (path.empty() || data == nullptr) {
        result.status = RT4DPublishStatus::invalid_path;
        result.detail = "path or payload missing";
        return result;
    }
    const std::filesystem::path destination(path);
    const std::filesystem::path temporary = path + ".partial";
    std::error_code existsError;
    const bool destinationExists = std::filesystem::exists(destination, existsError);
    const bool temporaryExists = std::filesystem::exists(temporary, existsError);
    if (temporaryExists) {
        result.status = RT4DPublishStatus::overwrite_rejected;
        result.detail = "destination or partial file already exists";
        return result;
    }
    if (destinationExists) {
        std::error_code typeError;
        if (std::filesystem::is_regular_file(destination, typeError) ||
            std::filesystem::is_directory(destination, typeError)) {
            result.status = RT4DPublishStatus::overwrite_rejected;
            result.detail = "destination or partial file already exists";
            return result;
        }
#ifndef _WIN32
        const int fd = ::open(path.c_str(), O_WRONLY);
        if (fd < 0) {
            result.status = fromErrno(errno);
            result.detail = std::strerror(errno);
            return result;
        }
        const ssize_t written =
            ::write(fd, data, byteCount > 0 ? byteCount : 1);
        const int writeErrno = errno;
        ::close(fd);
        if (written < 0) {
            result.status = fromErrno(writeErrno);
            result.detail = std::strerror(writeErrno);
            return result;
        }
#endif
        result.status = RT4DPublishStatus::overwrite_rejected;
        result.detail = "refusing to publish onto a special destination";
        return result;
    }
    if (byteCount == 0) {
        result.status = RT4DPublishStatus::empty_or_truncated;
        result.detail = "refusing to publish an empty artifact";
        return result;
    }
    std::ofstream output(temporary, std::ios::binary | std::ios::trunc);
    if (!output) {
        result.status = fromErrno(errno);
        result.detail = std::strerror(errno);
        return result;
    }
    output.write(static_cast<const char*>(data),
                  static_cast<std::streamsize>(byteCount));
    output.close();
    if (!output) {
        std::error_code removeError;
        std::filesystem::remove(temporary, removeError);
        result.status = fromErrno(errno);
        result.detail = "write failed before rename";
        return result;
    }
    std::error_code sizeError;
    const auto size = std::filesystem::file_size(temporary, sizeError);
    if (sizeError || size != byteCount) {
        std::filesystem::remove(temporary, sizeError);
        result.status = RT4DPublishStatus::empty_or_truncated;
        result.detail = "partial file size mismatch";
        return result;
    }
    std::error_code renameError;
    std::filesystem::rename(temporary, destination, renameError);
    if (renameError) {
        std::filesystem::remove(temporary, sizeError);
        result.status = fromErrno(renameError.value());
        result.detail = renameError.message();
        return result;
    }
    std::string hashError;
    result.sha256 = rt4dSha256Hex(rt4dSha256File(path, &hashError));
    result.fnv1a64 = rt4dFnv1a64File(path, &hashError);
    result.status = RT4DPublishStatus::published;
    result.detail = "published";
    return result;
}

RT4DPublishResult rt4dPublishText(const std::string& path,
                                    const std::string& text) {
    return rt4dPublishBytes(path, text.data(), text.size());
}

bool rt4dWriteFailureReceipt(const std::string& path,
                             const RT4DFailureReceipt& receipt,
                             std::string* error) {
    std::ostringstream json;
    json << "{\n"
         << "  \"schema\": \"" << rt4dJsonEscape(receipt.schema) << "\",\n"
         << "  \"mode\": \"" << rt4dJsonEscape(receipt.mode) << "\",\n"
         << "  \"operation\": \"" << rt4dJsonEscape(receipt.operation) << "\",\n"
         << "  \"path\": \"" << rt4dJsonEscape(receipt.path) << "\",\n"
         << "  \"status\": \"" << rt4dJsonEscape(receipt.status) << "\",\n"
         << "  \"detail\": \"" << rt4dJsonEscape(receipt.detail) << "\",\n"
         << "  \"rendererPixelAuthority\": false\n"
         << "}\n";
    const RT4DPublishResult published = rt4dPublishText(path, json.str());
    if (published.status != RT4DPublishStatus::published) {
        if (error) *error = published.detail;
        return false;
    }
    return true;
}
