#pragma once

// Shared SME utility helpers - small, header-only, deterministic.

#include <string>
#include <vector>
#include <sstream>
#include <fstream>
#include <filesystem>
#include <iomanip>
#include <cctype>

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

namespace sme::util {

inline bool fileExists(const std::string& path) {
    std::error_code ec;
    return std::filesystem::exists(path, ec) && std::filesystem::is_regular_file(path, ec);
}

inline std::string readFileToString(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return {};
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

inline std::vector<std::string> readLines(const std::string& path) {
    std::vector<std::string> lines;
    std::ifstream in(path);
    if (!in) return lines;
    std::string line;
    while (std::getline(in, line)) {
        if (!line.empty()) lines.push_back(line);
    }
    return lines;
}

inline std::string toLower(std::string s) {
    for (auto& c : s) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    return s;
}

// JSON string escaping for contract output fields. Keeps the CLI contract
// valid even when embedded values contain quotes, backslashes, or newlines
// (e.g. Windows paths, LLM responses, transcripts).
inline std::string jsonEscape(const std::string& s) {
    std::ostringstream out;
    out << std::hex;
    for (unsigned char c : s) {
        switch (c) {
            case '"':  out << "\\\""; break;
            case '\\': out << "\\\\"; break;
            case '\b': out << "\\b"; break;
            case '\f': out << "\\f"; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default:
                if (c < 0x20) {
                    out << "\\u" << std::setw(4) << std::setfill('0') << static_cast<int>(c);
                } else {
                    out << static_cast<char>(c);
                }
        }
    }
    out << std::dec;
    return out.str();
}

// Directory of the running executable (no trailing separator).
// Lets CLIs resolve suite-relative assets regardless of the working directory.
inline std::string exeDir() {
#ifdef _WIN32
    std::vector<wchar_t> buf(MAX_PATH);
    DWORD n = GetModuleFileNameW(nullptr, buf.data(), static_cast<DWORD>(buf.size()));
    while (n == buf.size() && GetLastError() == ERROR_INSUFFICIENT_BUFFER) {
        buf.resize(buf.size() * 2);
        n = GetModuleFileNameW(nullptr, buf.data(), static_cast<DWORD>(buf.size()));
    }
    if (n == 0) return "";
    std::wstring w(buf.data(), n);
    auto slash = w.find_last_of(L"\\/");
    if (slash == std::wstring::npos) return "";
    std::wstring dir = w.substr(0, slash);
    int len = WideCharToMultiByte(CP_UTF8, 0, dir.c_str(), static_cast<int>(dir.size()), nullptr, 0, nullptr, nullptr);
    if (len <= 0) return "";
    std::string out(static_cast<size_t>(len), '\0');
    WideCharToMultiByte(CP_UTF8, 0, dir.c_str(), static_cast<int>(dir.size()), &out[0], len, nullptr, nullptr);
    return out;
#else
    return ".";
#endif
}

// Suite root: three levels above the executable in both build layouts
// (<suiteRoot>/modules/<m>/build/<exe> standalone, <suiteRoot>/build/modules/<m>/<exe> suite build).
inline std::string suiteRoot() {
    std::string dir = exeDir();
    for (int i = 0; i < 3; ++i) {
        auto sep = dir.find_last_of("\\/");
        if (sep == std::string::npos) break;
        dir = dir.substr(0, sep);
    }
    return dir;
}

#ifdef _WIN32
// Convert a UTF-8 path to the platform native (wchar_t) form for Win32 APIs.
inline std::wstring toWide(const std::string& s) {
    if (s.empty()) return {};
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), static_cast<int>(s.size()), nullptr, 0);
    if (n <= 0) return {};
    std::wstring w(static_cast<size_t>(n), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), static_cast<int>(s.size()), &w[0], n);
    return w;
}
#else
inline std::wstring toWide(const std::string& s) { return std::wstring(s.begin(), s.end()); }
#endif

} // namespace sme::util
