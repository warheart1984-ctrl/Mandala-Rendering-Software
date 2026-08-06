# SME Suite

Native Windows implementation of the Sovereign Multimodal Engine modules.
Every module enforces a constitutional contract chain before it executes:

```
intent -> authority -> validation -> decision -> evidence -> verification -> replay -> audit
```

Modules refuse to run when a contract invariant fails, and every successful run
emits an evidence bundle (audit JSON) as machine-readable proof.

## Modules

| Module | Language | Backend | Purpose | Status |
|--------|----------|---------|---------|--------|
| sme-txt | C++17 | llama.cpp (GGUF), ONNX Runtime (ONNX) | Local LLM chat/completion | Working |
| sme-vis | C++17 | ONNX Runtime (MobileNetV2 ONNX) | Image classification | Working |
| sme-aud | C++17 | whisper.cpp (GGML) | Speech transcription | Working |
| sme-gen | C++17 | HTTP (httplib) | Stable Diffusion txt2img client | Working |
| sme-vid | C# (net10.0) | FFmpeg process | Transcode / extract / trim | Working |

## Layout

```
sme-suite/
  config/            shared config
  contracts/         per-module contract JSON + schema
  shared/            ContractEngine (lawbook chain) + sme_util
  third_party/       llama.cpp, whisper.cpp, stb, httplib, nlohmann, ONNX Runtime
  tools/             vendored single-header deps (stb/httplib/nlohmann)
  modules/
    sme-txt/         C++ CLI
    sme-vis/         C++ CLI
    sme-aud/         C++ CLI
    sme-gen/         C++ CLI
    sme-vid/         C# CLI
  models/            test assets (ggml-base.bin, test-tone.wav, mobilenetv2-12.onnx)
```

## Build

Requires: Visual Studio 2022 Build Tools (MSVC x64), CMake >= 3.20, Ninja.
sme-vid additionally requires .NET SDK (net10.0) and FFmpeg on PATH.

Each C++ module builds standalone from its directory:

```bat
cmd /c "call ""C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"" && cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_MAKE_PROGRAM=""<ninja.exe>"" && cmake --build build"
```

Or build the whole suite from `sme-suite/` (all C++ modules):

```bat
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_MAKE_PROGRAM="<ninja.exe>" && cmake --build build
```

sme-vid:

```bat
dotnet build -c Release modules/sme-vid
```

Post-build steps copy all required DLLs (onnxruntime.dll, llama.dll, ggml*.dll,
whisper.dll, parakeet.dll) next to each executable. Executables resolve the
suite root from their own location (not the working directory), so they run
from anywhere.

## Run

### sme-txt — chat completion

```
sme_txt.exe <model.gguf> "<prompt>" [--max_tokens 128] [--threads 4]
```

Test model: `G:\Mandala Rendering Software\models\tinyllama-1.1b\ggml-model-q4_k_m.bin`
(GGUF, 636 MB). Output: JSON `{ok, intentId, response, promptTokens, outputTokens, msPerToken}`.

### sme-vis — image classification

```
sme_vis.exe <image.png>
```

Uses MobileNetV2 ONNX (1000 ImageNet classes). Output: top labels with
confidence. Refuses non-existent images with `ok:false` + evidence JSON.

### sme-aud — speech transcription

```
sme_aud.exe <audio.wav>
```

Uses whisper base (`sme-suite/models/ggml-base.bin`). Output: transcript JSON.

### sme-gen — Stable Diffusion client

```
sme_gen.exe "<prompt>" <out.png> [--endpoint http://127.0.0.1:7860]
```

Posts to `/sdapi/v1/txt2img`, base64-decodes `images[0]`.

### sme-vid — video processing

```
sme_vid.exe <preset> <input> <output> [--ffmpeg <path>]
```

Presets: `transcode-h264`, `extract-audio`, `trim`. Contract refuses missing
input / invalid preset with `ok:false` JSON.

## Contract / evidence model

Each module loads its contract from `contracts/<module>.contract.json` and
enforces invariants at runtime through the shared `ContractEngine`
(`shared/contract_engine.{h,cpp}`). On success the engine attaches:

- `intentId` (declared purpose, never empty)
- authority (module contract id)
- validation results per invariant
- output summary
- verification + replay + audit markers

On failure the module prints `ok:false` with the violating invariant id and
exits non-zero, so downstream orchestrators can audit every refusal.
