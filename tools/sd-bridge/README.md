# SD-CPP Bridge (127.0.0.1:13305)

Reverse-proxies one public endpoint to two local backends:

| Public path (on :13305)                 | Backend                       | Port  |
|------------------------------------------|-------------------------------|-------|
| `/api/v1/images/generations`, `/edits`   | sd-server (stable-diffusion.cpp) | 13306 |
| `/v1/models`, `/v1/images/*`, `/sdapi/*` | sd-server                     | 13306 |
| `/api/v1/chat/*`, `/api/v1/audio/*`, ... | LemonadeServer                | 13307 |
| `/health`, `/api/v1/health`              | bridge (aggregated)           | 13305 |

## Why

The Lemonade bundled sd-cpp backend crashes on CPUs without AVX2 (`0xC000001D`)
and cannot run diffusion on a 4 GB Vulkan card. A from-source build of
stable-diffusion.cpp (baseline x64 + `VK_KHR_shader_float16_int8` fp16 patch +
`--vae-tiling`) runs SD-Turbo on the RX 580. This bridge keeps the OpenAI
schema and the `127.0.0.1:13305` address all downstream tools already use.

## Files

- `bridge.py` — the router (stdlib only, no pip install).
- `start_all.bat` — starts LemonadeServer (:13307), sd-server (:13306), bridge (:13305).

## Run

```
start_all.bat
# or manually:
python bridge.py
```

Env overrides: `BRIDGE_HOST` `BRIDGE_PORT` `SD_PORT` (default 13306) `LEMONADE_PORT` (default 13307).

## Notes

- sd-server's OpenAI route ignores JSON `steps`/`cfg_scale`; the server must be
  started with `--steps 4 --cfg-scale 1.0` (already in `start_all.bat`).
- Websockets are not proxied; connect WS clients straight to LemonadeServer on
  :13307 if needed.
- Non-streaming HTTP only (chat `stream=true` is buffered by the bridge).
