# White Paper — The SD-CPP Vulkan Bridge: Running Stable Diffusion on an FX-8350 + RX 580

> **Author:** MRS engineering session (opencode) — August 2026
> **Status:** Verified working end-to-end
> **Product line:** Mandala Rendering System (MRS) — Genblaze local image backend
> **Related lawbook:** `AGENTS.md` (local AI-use routing: `http://127.0.0.1:13305/api/v1`)

---

## Abstract

This paper documents the root-cause analysis and the production fix that enabled
local Stable Diffusion image generation on a 2012-era AMD FX-8350 CPU with a
2017-era AMD RX 580 (Polaris) 4 GB GPU — hardware that every off-the-shelf
backend failed on. The solution is a **three-process bridge**: a stdlib-only
Python reverse proxy on port `13305` (the public, contract-stable endpoint) that
routes image requests to a **from-source build of stable-diffusion.cpp** on port
`13306` (running on the RX 580 via Vulkan) and everything else to the existing
**LemonadeServer** on port `13307`.

Two fixes were required to make diffusion work at all:

1. **ISA bug fix** — Lemonade's bundled sd-cpp binaries (both CPU and "Vulkan")
   are compiled for AVX2 and die with `STATUS_ILLEGAL_INSTRUCTION`
   (`0xC000001D`) on the FX-8350, which tops out at AVX1. We rebuild
   stable-diffusion.cpp from source targeting baseline x64.
2. **fp16 gate fix** — ggml-vulkan disables fp16 unless the Vulkan 1.2 core
   feature `shaderFloat16` is advertised. This driver exposes the equivalent
   extension `VK_KHR_shader_float16_int8` (which the card supports) but reports
   `shaderFloat16 = false`, so fp16 was disabled, buffers were f32, and the VAE
   decode OOM'd on 4 GB of VRAM. A two-line patch honors the extension.
3. **Memory fix** — the VAE decode activation buffer is ~2.08 GB in f32 and does
   not fit after a 1.93 GB model on a 3.75 GiB heap. `--vae-tiling` splits the
   decode into tiles and fits inside the budget.

Verified result: 512×512 SD-Turbo image in ~41 s (4-step config), VAE decode in
~6.5–9.7 s tiled, fp16 enabled (`fp16: 1`), CPU dispatch safe.

---

## 1. Problem Statement

The MRS local image pipeline (Genblaze `lemonade_provider.py`) calls an
OpenAI-compatible images API at `http://127.0.0.1:13305/api/v1/images/generations`.
The host intended to serve that endpoint is unusual:

| Component | Spec |
|---|---|
| CPU | AMD FX-8350 (2012, "Piledriver"). **No AVX2/FMA/F16C.** SSE4.2/AVX1 only |
| GPU | AMD RX 580 (Polaris). Vulkan heap **3.75 GiB** |
| Driver | AMD proprietary, Vulkan 1.3.260, `shaderFloat16 = false`, `VK_KHR_shader_float16_int8` present |
| Lemonade | 11.5.2, `sdcpp.backend = "vulkan"`, port 13305 (in `config.json`) |
| SD model | `Green-Sky/SD-Turbo-GGUF` → `sd_turbo-f16-q8_0.gguf` (1.88 GB, in the HF hub cache) |

Every attempt to use Lemonade's bundled SD produced a **500 error** from the
Lemonade server. The underlying sd-server process was crashing with
`0xC000001D` (`STATUS_ILLEGAL_INSTRUCTION`) — the classic signature of a binary
compiled with `-mavx2` running on a pre-AVX2 CPU. Notably, Lemonade's "vulkan"
sd-server also crashed, because its CPU-side (ggml-cpu) code is AVX2.

The **official** stable-diffusion.cpp release binary (master-817) ran on this CPU
because it ships runtime-dispatched CPU DLLs (`ggml-cpu-sandybridge.dll` etc.).
It loaded the model (1.93 GB in VRAM) and sampled at ~1.3 it/s, but then **the
VAE decode OOM'd**:

```
ggml_vulkan: Device memory allocation of size 1207959552 failed.
vk::Device::allocateMemory: ErrorOutOfDeviceMemory
ggml_extend.hpp:72 - ggml_gallocr_reserve_n_impl: failed to allocate Vulkan0
buffer of size 2080440328
```

The device line in its log said `fp16: 0`. `--vae-tiling`, `--offload-to-cpu`,
`--max-vram`, and `--backend vae=cpu` all crashed that release build at request
time — a second AVX2 leak inside the multi-ISA build's non-dispatched paths.

---

## 2. Root-Cause Analysis

### 2.1 Why the CPU crashes: AVX2

The FX-8350 supports up to AVX1. Any code path compiled with AVX2 instructions
immediately faults. Lemonade's binaries are built for a generic modern x86-64
target (AVX2 baseline). Because the CPU dispatch layer is missing from the
Lemonade sd-cpp integration, the CPU dies before the GPU is ever touched.

### 2.2 Why the VAE OOMs: fp16 is gated on the wrong Vulkan feature

In `ggml/src/ggml-vulkan/ggml-vulkan.cpp`, the device's fp16 capability is set
(around line 5920) as:

```cpp
device->fp16 = !force_disable_f16 && fp16_storage && fp16_compute;
```

`fp16_storage` is `VK_KHR_16bit_storage`; `fp16_compute` is
`VK_KHR_shader_float16_int8`. Both are present on the Polaris driver, so
`device->fp16` is `true`… but the log said `fp16: 0`. The printed value comes
from a second, independent gate:

```cpp
device->fp16 = device->fp16 && vk12_features.shaderFloat16;   // Vulkan 1.2 core feature
```

The AMD driver advertises `Vulkan 1.3.260`, `shaderFloat16 = false`, yet still
exposes `VK_KHR_shader_float16_int8` (which provides the same fp16 support as an
extension). The strict core-feature check therefore disabled fp16 even though
the hardware genuinely supports it. With fp16 off, every weight and intermediate
is f32, VRAM requirements roughly double, and the VAE decode does not fit.

### 2.3 Why tiling was needed

fp16 halves *weight* storage and activation bandwidth, but ggml still allocates
the VAE's largest intermediate activation graph in f32 at the resolution of the
tallest U-Net stage. The single 2.08 GB compute buffer cannot co-exist with the
1.93 GB resident model in a 3.75 GiB heap. `--vae-tiling` processes the VAE
decode in overlapping tiles, shrinking the peak activation footprint to a small
fraction of the image size.

---

## 3. Solution Architecture

```
        (public, contract-stable)
  genblaze / lemonade examples / test_app.py
                     |
                     v
        +-----------------------------+      :13305
        |   bridge.py  (Python stdlib)|
        |   ThreadingHTTPServer       |
        +---------+---------+---------+
                  |                    |
        images    |                    | chat / audio / stt / health passthrough
        +---------v---------+   +------v----------------------+
        |  sd-server        |   |  LemonadeServer             |
        |  :13306           |   |  :13307                     |
        |  Vulkan fp16 ON   |   |  llamacpp / kokoro / ...    |
        |  --vae-tiling     |   |  (moved from 13305)         |
        +-------------------+   +-----------------------------+
                  |
                  v
        RX 580 (Vulkan 1.3, VK_KHR_shader_float16_int8)
```

- **13305 — bridge.py**: reverse proxy. Routes `/api/v1/images/*`, `/v1/images/*`,
  `/v1/models`, `/sdapi/v1/*` to sd-server; `/health` & `/api/v1/health` are
  answered in-process (aggregated); everything else is passed through to
  LemonadeServer with the path unchanged.
- **13306 — sd-server**: our from-source build of stable-diffusion.cpp
  (master-817 + fp16 patch), started with
  `--vae-tiling --steps 4 --cfg-scale 1.0 --sampling-method euler`.
- **13307 — LemonadeServer**: the existing Lemonade server, whose port we moved
  in `config.json` from 13305 to 13307 so the bridge can own 13305.

The bridge keeps every downstream consumer's contract (base URL + OpenAI schema)
intact, which is why no changes to `lemonade_provider.py`, `test_app.py`, or the
vendor examples were required.

---

## 4. The Build (all commands, reproducible)

### 4.1 Prerequisites on this host

- MSVC Build Tools: `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`
  (MSVC 14.44.35207) — no MinGW/clang needed.
- CMake ≥ 3.x (`C:\Program Files\CMake`), Ninja, git.
- Vulkan SDK `C:\VulkanSDK\1.4.350.0` (glslc for shader compilation).

### 4.2 Clone

```bat
git clone --recurse-submodules https://github.com/ggml-org/stable-diffusion.cpp "C:\Users\My PC\dev\stable-diffusion.cpp"
```

ggml submodule pinned at commit `3f85508`.

### 4.3 fp16 patch — `ggml\src\ggml-vulkan\ggml-vulkan.cpp`

Two lines, honoring `VK_KHR_shader_float16_int8` when the 1.2 core feature is
not advertised:

```diff
-        device->fp16 = device->fp16 && vk12_features.shaderFloat16;
+        device->fp16 = device->fp16 && (vk12_features.shaderFloat16 || fp16_compute);
```

```diff
-    fp16 = fp16 && vk12_features.shaderFloat16;
+    fp16 = fp16 && (vk12_features.shaderFloat16 || fp16_compute);
```

`fp16_compute` is already derived from `VK_KHR_shader_float16_int8` in the same
translation unit (extension scan in `ggml_vk_print_gpu_info`), so no new
detection code is needed.

### 4.4 Configure (from a VS Build Tools developer prompt, or via vcvars64.bat)

```bat
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
cmake -S . -B build-vulkan ^
      -DSD_VULKAN=ON ^
      -DCMAKE_BUILD_TYPE=Release ^
      -DCMAKE_C_FLAGS="/bigobj" ^
      -DCMAKE_CXX_FLAGS="/bigobj" ^
      -G Ninja
cmake --build build-vulkan -j 8
```

Notes:

- `/bigobj` is required: `src/stable-diffusion.cpp` exceeds the MSVC object-file
  section limit (`C1128: number of sections exceeded object file format limit`).
- `SD_VULKAN=ON` enables `GGML_VULKAN`. GGUF support is compiled in by default.
- GGML's `GGML_NATIVE` is ON by default, but on MSVC this means "baseline x64",
  not `-march=native`; the produced binary contains **no AVX2**, so it is safe on
  the FX-8350. The ISA-specialized targets (`ggml-cpu-sandybridge`, etc.) are
  compiled as separate static units and are unused because the full static build
  only emits the baseline path.

Resulting artifacts (in `build-vulkan\bin\`):

```
sd-server.exe   102,870,016 bytes
sd-cli.exe      102,614,016 bytes
```

### 4.5 Model location

The GGUF model is read directly from the HuggingFace hub cache:

```
C:\Users\My PC\.cache\huggingface\hub\models--Green-Sky--SD-Turbo-GGUF\snapshots\
  19a31586d02d64a73b4419bc193b3ecfaf38e1f0\sd_turbo-f16-q8_0.gguf
```

---

## 5. The Bridge (all working code)

### 5.1 `tools/sd-bridge/bridge.py`

```python
"""SD-CPP <-> Lemonade API bridge (standalone, stdlib only).

Listens on :13305 and routes to two local backends:

    /api/v1/images/*  /v1/*  /sdapi/v1/*   -> stable-diffusion.cpp sd-server  (127.0.0.1:13306)
    /api/v1/chat/*    /api/v1/audio/*      -> LemonadeServer                  (127.0.0.1:13307)
    /health, /api/v1/health                -> aggregated status (200 when SD is healthy)

Why it exists: the bundled Lemonade sd-cpp backend crashes on CPUs without
AVX2 (FX-8350) and cannot run SD on the RX 580. We build stable-diffusion.cpp
from source (baseline x64 + Vulkan fp16 patch) and serve it separately; this
bridge keeps the public endpoint (127.0.0.1:13305) and the OpenAI schema that
downstream tools (genblaze lemonade_provider, lemonade examples, etc.) expect.

Routing rules:
  - Images always go to sd-server. Its OpenAI route ignores `steps`/`cfg_scale`
    from the JSON body, so the server must be started with --steps 4 --cfg-scale
    1.0 (see start_all.bat). `size` and `n` ARE honored.
  - Everything else is passed through to LemonadeServer unchanged (same path).
  - Unknown paths: try lemonade first, then sd-server; 404 if neither answers.

Run:  python bridge.py            (bind 0.0.0.0:13305 by default)
Env:   BRIDGE_HOST  BRIDGE_PORT   SD_PORT=13306  LEMONADE_PORT=13307
"""

from __future__ import annotations

import http.client
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

SD_PORT = int(os.getenv("SD_PORT", "13306"))
LEM_PORT = int(os.getenv("LEMONADE_PORT", "13307"))
BRIDGE_HOST = os.getenv("BRIDGE_HOST", "0.0.0.0")
BRIDGE_PORT = int(os.getenv("BRIDGE_PORT", "13305"))
IMG_TIMEOUT = 600.0
GEN_TIMEOUT = 900.0

LOG_LOCK = threading.Lock()


def log(msg: str) -> None:
    with LOG_LOCK:
        sys.stderr.write(f"[bridge] {msg}\n")
        sys.stderr.flush()


def forward(method: str, path: str, body: bytes | None, port: int, timeout: float) -> tuple[int, str, bytes]:
    """Forward one request to an upstream HTTP/1.1 server and return its full response."""
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
    try:
        conn.request(method, path, body=body)
        resp = conn.getresponse()
        # http.client already decoded chunked transfer-encoding, so the payload
        # length is correct to re-send with Content-Length.
        payload = resp.read()
        return resp.status, resp.getheader("Content-Type", "application/octet-stream"), payload
    finally:
        conn.close()


def sd_healthy() -> bool:
    try:
        status, _, _ = forward("GET", "/v1/models", None, SD_PORT, 3.0)
        return status < 500
    except Exception:
        return False


def lemonade_healthy() -> bool:
    for path in ("/api/v1/health", "/health"):
        try:
            status, _, _ = forward("GET", path, None, LEM_PORT, 3.0)
            if status < 500:
                return status < 400
        except Exception:
            continue
    return False


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "SDCPPBridge/1.0"

    # ---- helpers ---------------------------------------------------------
    def _read_body(self) -> bytes | None:
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length > 0 else None

    def _reply(self, status: int, body: bytes, ctype: str = "application/json") -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, obj) -> None:
        self._reply(status, json.dumps(obj).encode("utf-8"), "application/json")

    # ---- dispatch --------------------------------------------------------
    def _route(self, method: str) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if parsed.query:
            path = f"{path}?{parsed.query}"
        body = self._read_body()
        log(f"{method} {path}")

        if path in ("/health", "/api/v1/health"):
            sd = sd_healthy()
            lemon = lemonade_healthy()
            self._json(
                200 if sd else 503,
                {
                    "status": "ok" if sd else "degraded",
                    "sd_cpp": {"healthy": sd, "port": SD_PORT},
                    "lemonade": {"healthy": lemon, "port": LEM_PORT},
                },
            )
            return

        if path.startswith(("/api/v1/images/", "/v1/images/", "/v1/models", "/sdapi/v1/")):
            target = path[4:] if path.startswith("/api/") else path
            try:
                status, ctype, payload = forward(method, target, body, SD_PORT, IMG_TIMEOUT)
            except Exception as exc:  # noqa: BLE001
                log(f"sd-server forward failed: {exc!r}")
                self._json(502, {"error": f"sd-server unreachable: {exc!r}"})
                return
            self._reply(status, payload, ctype or "application/json")
            return

        # Everything else: Lemonade passthrough (chat, audio/speech, STT, ...).
        try:
            status, ctype, payload = forward(method, path, body, LEM_PORT, GEN_TIMEOUT)
        except Exception as exc:  # noqa: BLE001
            log(f"lemonade forward failed: {exc!r}")
            self._json(502, {"error": f"lemonade unreachable: {exc!r}"})
            return
        if status == 404:
            # Maybe the caller expected an sd-server route we didn't match.
            try:
                status, ctype, payload = forward(method, path, body, SD_PORT, IMG_TIMEOUT)
            except Exception:
                pass
        self._reply(status, payload, ctype or "application/json")

    def do_GET(self) -> None:
        self._route("GET")

    def do_POST(self) -> None:
        self._route("POST")

    def do_PUT(self) -> None:
        self._route("PUT")

    def do_DELETE(self) -> None:
        self._route("DELETE")

    def log_message(self, fmt, *args) -> None:  # silence default stderr noise
        pass


def main() -> None:
    server = ThreadingHTTPServer((BRIDGE_HOST, BRIDGE_PORT), BridgeHandler)
    log(f"bridge listening on {BRIDGE_HOST}:{BRIDGE_PORT} -> sd-server:{SD_PORT} / lemonade:{LEM_PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
```

### 5.2 How the bridge works

1. `ThreadingHTTPServer` accepts one connection per thread — slow image
   generations (tens of seconds) never block chat/TTS requests.
2. `_route()` parses the request path, reads the body by `Content-Length`,
   applies the routing table, and streams the upstream response back verbatim.
3. **Path rewrite**: sd-server exposes its OpenAI routes at `/v1/...` while the
   public contract is `/api/v1/...`. The bridge strips the leading `/api` for
   the image route so `POST /api/v1/images/generations` hits
   `POST /v1/images/generations` on sd-server. Lemonade passthrough keeps the
   path unchanged (Lemonade already serves under `/api/v1/...`).
4. **Health**: both `lemonade_availability()` in genblaze and other tools probe
   `/api/v1/health` (or `/health`). The bridge answers these in-process with an
   aggregated status — 200 when sd-server answers `/v1/models`, 503 otherwise —
   so the app's health endpoint reflects real diffusion availability without
   coupling to Lemonade's (irrelevant-for-SD) health.
5. **404 fallback**: an unknown path is tried against Lemonade first, then
   sd-server, before returning whatever the winner answered.

### 5.3 Launcher — `tools/sd-bridge/start_all.bat`

```bat
@echo off
rem Mandala SD-CPP bridge launcher
rem Public endpoint :13305 (this bridge) -> images :13306 (sd-server) | everything else :13307 (LemonadeServer)
rem Requires: python on PATH, and an existing build at %MRS_SD_BUILD% (default below).

set SD_ROOT=C:\Users\My PC\dev\stable-diffusion.cpp
set SD_EXE=%SD_ROOT%\build-vulkan\bin\sd-server.exe
set SD_MODEL=C:\Users\My PC\.cache\huggingface\hub\models--Green-Sky--SD-Turbo-GGUF\snapshots\19a31586d02d64a73b4419bc193b3ecfaf38e1f0\sd_turbo-f16-q8_0.gguf
set BRIDGE=G:\Mandala Rendering Software\tools\sd-bridge\bridge.py
set LEMONADE_SERVER=C:\Users\My PC\AppData\Local\lemonade_server\bin\LemonadeServer.exe
set LOGS=C:\Users\MYPC~1\AppData\Local\Temp\opencode

echo [1/3] Starting LemonadeServer on :13307 ...
start "lemonade-13307" /min "%LEMONADE_SERVER%"

echo [2/3] Starting sd-server on :13306 (SD-Turbo, 4 steps, cfg 1.0, vae-tiling) ...
start "sd-server-13306" /min cmd /c ""%SD_EXE%" --listen-ip 127.0.0.1 --listen-port 13306 --model "%SD_MODEL%" --vae-tiling --steps 4 --cfg-scale 1.0 --sampling-method euler >> "%LOGS%\sd13306.log" 2>&1"

timeout /t 45 /nobreak >nul

echo [3/3] Starting bridge on :13305 ...
python "%BRIDGE%"
```

### 5.4 Lemonade config change

`C:\Users\My PC\.cache\lemonade\config.json`:

```diff
-    "port":  13305,
+    "port":  13307,
```

The `sdcpp` section remains but is effectively unused — images are served by our
build, not Lemonade's sd-cpp backend.

---

## 6. End-to-End Request Flow

### 6.1 Image generation (the fixed path)

```
POST http://127.0.0.1:13305/api/v1/images/generations
{ "model": "SD-Turbo", "prompt": "...", "size": "512x512",
  "steps": 4, "cfg_scale": 1.0, "response_format": "b64_json", "n": 1 }
        |
        v
bridge.py  ->  path starts with /api/v1/images/  ->  strip /api
        |
        v
POST http://127.0.0.1:13306/v1/images/generations   (sd-server)
   - size 512x512 honored (parsed from "512x512")
   - n honored (batch_count)
   - steps/cfg_scale come from CLI defaults: --steps 4 --cfg-scale 1.0
        |
        v
RX 580 Vulkan: UNet sampling (4 steps, ~1.8 it/s), then VAE decode tiled
        |
        v
{"created": ..., "data": [{"b64_json": "..."}], "output_format": "png"}
        |
        v
bridge relays body verbatim -> genblaze _decode_image_payload() -> PNG bytes
```

### 6.2 Chat / TTS / STT (pass-through, unchanged)

```
POST /api/v1/chat/completions   -> LemonadeServer:13307 (same path)
POST /api/v1/audio/speech       -> LemonadeServer:13307
POST /api/v1/audio/transcriptions -> LemonadeServer:13307
GET  /api/v1/health             -> answered by bridge (aggregated)
```

---

## 7. Verification Results

Measured on this host (FX-8350, RX 580, SD-Turbo GGUF q8_0):

| Check | Result |
|---|---|
| Vulkan device line | `fp16: 1` (was `0` before the patch) |
| Model load | 1929.50 MB VRAM, all resident |
| Diffusion sampling | 4 steps @ ~1.8 it/s (9-step request: 1.81 it/s) |
| VAE decode (tiled) | 6.56 s (9-step run: 9.65 s), **no OOM** |
| Full generation | 41.57 s (9-step request: 111.44 s) |
| Output | valid 512×512 PNG via bridge, 433–788 KB |
| CPU safety | no `0xC000001D` anywhere; baseline-x64 build |

End-to-end smoke tests that pass through the public `:13305` endpoint:

- `GET /api/v1/health` → `{"status":"ok", ...}`
- `POST /api/v1/images/generations` → `b64_json` PNG
- `POST /api/v1/chat/completions` (Llama-3.2-1B-Instruct-GGUF) → `"OK."`
- `POST /api/v1/audio/speech` (kokoro-v1) → MP3 bytes

---

## 8. Operational Notes & Limitations

1. **Non-streaming only.** The bridge buffers upstream responses; chat with
   `stream=true` is collected until completion before being returned. Acceptable
   for the current consumers; a streaming upgrade is a TODO.
2. **WebSockets are not proxied.** WS clients should connect to LemonadeServer
   directly on `:13307`.
3. **Cold start.** Lemonade's first chat call can take minutes (model load on
   the FX-8350). The bridge's passthrough timeout is 900 s to absorb this.
4. **No AVX2 in the build** by construction (MSVC baseline x64). If you later
   build on an AVX2-capable machine, re-pass the flags from §4.4 to keep the
   binary portable, or rely on ggml's runtime-dispatch DLLs in a shared build.
5. **VAE activations stay f32** even with fp16 enabled (fp16 covers weights and
   accumulation, not activations) — hence `--vae-tiling` remains mandatory on
   this card. On a ≥ 8 GB card it can be dropped for speed.
6. **`steps`/`cfg_scale` in the JSON body are ignored** by sd-server's OpenAI
   route (by design in master-817). Server defaults govern. The launcher pins
   them to SD-Turbo values (`4` / `1.0`).
7. **Model id is cosmetic** — sd-server answers with its own id
   (`sd-cpp-local`); Lemonade id `SD-Turbo` etc. still work through the bridge
   because the model field is not validated.

---

## 9. Reproducibility Checklist

- [ ] MSVC Build Tools with the C++ workload installed
- [ ] Vulkan SDK on PATH (`C:\VulkanSDK\1.4.350.0`)
- [ ] `stable-diffusion.cpp` cloned with submodules
- [ ] fp16 patch applied (two lines, §4.3)
- [ ] Configure with `SD_VULKAN=ON` + `/bigobj` (both C and CXX)
- [ ] `cmake --build build-vulkan -j 8` → `bin\sd-server.exe`
- [ ] Lemonade `config.json` port → `13307`; restart LemonadeServer
- [ ] Start sd-server on `13306` with `--vae-tiling --steps 4 --cfg-scale 1.0`
- [ ] `python tools\sd-bridge\bridge.py` on `13305`
- [ ] Smoke: health, image, chat, TTS (§7)

---

## 10. Conclusion

The combination of (a) an AVX2-illegal build, (b) fp16 gated on the wrong Vulkan
feature, and (c) a 2.08 GB f32 VAE buffer had made local diffusion impossible on
this hardware through every prebuilt backend. A from-source build of
stable-diffusion.cpp with a two-line fp16 patch, started with `--vae-tiling`,
turns the RX 580 into a working SD-Turbo device, and a 130-line stdlib Python
bridge preserves the public `127.0.0.1:13305` OpenAI contract for all existing
downstream consumers. The full stack is now: **one patch, one build, three
processes, zero cloud calls.**
