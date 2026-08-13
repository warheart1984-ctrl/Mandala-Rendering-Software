# SD-CPP Bridge (127.0.0.1:13305)

Reverse-proxies one public endpoint to two local backends (plus optional cloud):

| Public path (on :13305)                 | Backend                       | Port  |
|------------------------------------------|-------------------------------|-------|
| `/api/v1/images/generations`, `/edits`   | sd-server or cloud (see below)| 13306 / cloud |
| `/v1/models`, `/v1/images/*`, `/sdapi/*` | sd-server                     | 13306 |
| `/api/v1/chat/*`, `/api/v1/audio/*`, ... | LemonadeServer                | 13307 |
| `/health`, `/api/v1/health`              | bridge (aggregated)           | 13305 |
| `/`, `/ui`                               | bridge (txt2img web UI)       | 13305 |

## Why

The Lemonade bundled sd-cpp backend crashes on CPUs without AVX2 (`0xC000001D`)
and cannot run diffusion on a 4 GB Vulkan card. A from-source build of
stable-diffusion.cpp (baseline x64 + `VK_KHR_shader_float16_int8` fp16 patch +
`--vae-tiling`) runs SD-Turbo on the RX 580. This bridge keeps the OpenAI
schema and the `127.0.0.1:13305` address all downstream tools already use.

## Files

- `bridge.py` — the router (stdlib only, no pip install). Also serves the web UI.
- `start_all.bat` — starts LemonadeServer (:13307), sd-server (:13306), bridge (:13305).
- `.env.example` — template for cloud-backend credentials (copy to `.env`).

## Run

```
start_all.bat
# or manually:
python bridge.py
```

Env overrides: `BRIDGE_HOST` `BRIDGE_PORT` `SD_PORT` (default 13306) `LEMONADE_PORT` (default 13307).

## Cloud backends

Set `CLOUD_BACKEND` (in `.env` or the environment) to route image generation
to a cloud API instead of the RX 580. Resulting PNGs are saved to `OUTPUT_DIR`
(default `outputs/` here) and still returned to the caller in OpenAI format.

| `CLOUD_BACKEND` | Provider                        | Required env vars |
|-----------------|---------------------------------|-------------------|
| *(empty)*       | local sd-server (RX 580)        | —                 |
| `nvidiabuild`   | build.nvidia.com hosted NIM/FLUX| `NVIDIA_API_KEY`, optional `NVIDIA_BASE_URL` |
| `openai`        | OpenAI-compatible (Together, Fireworks, ...) | `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, `CLOUD_MODEL` |

Keys are read from the environment or `tools/sd-bridge/.env` (git-ignored).
Never commit keys to the repo. `CLOUD_STEPS` (default 4) applies to the NIM path.

## Web UI

Open `http://127.0.0.1:13305` for a minimal txt2img page that posts to
`/api/v1/images/generations`. 512x512 only (SD-Turbo native; larger sizes OOM
the RX 580). Ctrl+Enter to generate.

## Notes

- sd-server's OpenAI route ignores JSON `steps`/`cfg_scale`; the server must be
  started with `--steps 4 --cfg-scale 1.0` (already in `start_all.bat`).
- Websockets are not proxied; connect WS clients straight to LemonadeServer on
  :13307 if needed.
- Non-streaming HTTP only (chat `stream=true` is buffered by the bridge).
