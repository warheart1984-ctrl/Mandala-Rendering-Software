/**
 * DITB.exe — Launcher
 * Creates suspended process, injects DITB.dll, resumes execution.
 * Usage: DITB.exe <target.exe> [args...]
 */

#include <windows.h>
#include <iostream>
#include <vector>

int wmain(int argc, wchar_t* argv[]) {
    if (argc < 2) {
        std::wcerr << L"Usage: DITB.exe <target.exe> [args...]\n";
        return 1;
    }

    // Build command line
    std::wstring cmdLine = argv[1];
    for (int i = 2; i < argc; i++) {
        cmdLine += L" ";
        cmdLine += argv[i];
    }

    // Create suspended process
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi = {0};

    BOOL ok = CreateProcessW(
        NULL,
        &cmdLine[0],
        NULL, NULL, FALSE,
        CREATE_SUSPENDED,
        NULL, NULL,
        &si, &pi
    );

    if (!ok) {
        std::wcerr << L"Failed to create process: " << GetLastError() << L"\n";
        return 1;
    }

    // Get full path to DITB.dll
    wchar_t dllPath[MAX_PATH];
    DWORD len = GetFullPathNameW(L"ditb.dll", MAX_PATH, dllPath, NULL);
    if (len == 0 || len >= MAX_PATH) {
        std::wcerr << L"Could not resolve ditb.dll path\n";
        return 1;
    }

    // Allocate memory in target for DLL path
    SIZE_T pathSize = (wcslen(dllPath) + 1) * sizeof(wchar_t);
    LPVOID pRemote = VirtualAllocEx(pi.hProcess, NULL, pathSize,
                                    MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    if (!pRemote) {
        std::wcerr << L"VirtualAllocEx failed: " << GetLastError() << L"\n";
        return 1;
    }

    if (!WriteProcessMemory(pi.hProcess, pRemote, dllPath, pathSize, NULL)) {
        std::wcerr << L"WriteProcessMemory failed: " << GetLastError() << L"\n";
        return 1;
    }

    // Get LoadLibraryW address
    LPVOID pLoadLibrary = GetProcAddress(GetModuleHandleW(L"kernel32.dll"), "LoadLibraryW");
    if (!pLoadLibrary) {
        std::wcerr << L"GetProcAddress LoadLibraryW failed\n";
        return 1;
    }

    // Create remote thread to load DLL
    HANDLE hThread = CreateRemoteThread(pi.hProcess, NULL, 0,
                                        (LPTHREAD_START_ROUTINE)pLoadLibrary,
                                        pRemote, 0, NULL);
    if (!hThread) {
        std::wcerr << L"CreateRemoteThread failed: " << GetLastError() << L"\n";
        return 1;
    }

    // Wait for DLL to load
    WaitForSingleObject(hThread, 5000);
    CloseHandle(hThread);

    // Resume target
    ResumeThread(pi.hThread);

    // Wait for target to exit (optional - can also just detach)
    WaitForSingleObject(pi.hProcess, INFINITE);

    DWORD exitCode = 0;
    GetExitCodeProcess(pi.hProcess, &exitCode);

    // Cleanup
    VirtualFreeEx(pi.hProcess, pRemote, 0, MEM_RELEASE);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);

    std::wcout << L"DITB: Target exited with code " << exitCode << L"\n";
    return exitCode;
}