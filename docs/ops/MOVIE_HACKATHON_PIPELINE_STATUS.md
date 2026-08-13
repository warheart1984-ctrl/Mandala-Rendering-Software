# Mandala Movie Hackathon — Pipeline Completion Status

> **Snapshot:** ~85% complete. Remaining work is standard Mandala 4D cinema
> pipeline integration (camera motion / timing / host hook), not diffusion
> infrastructure.

## Demo Hardware (current)

| GPU | Role | Notes |
|-----|------|-------|
| AMD RX 580 (Polaris, Vulkan) | **Live demo GPU** | sd-server Vulkan backend, SD-Turbo-GGUF; ~9-22 s warm per 512x512 frame. **512x512 only** — a 1024 request OOMs sd-server (5.4 GB Vulkan_Host buffer vs 3.75 GiB heap). Recovery: restart `sd_server_13306.bat`. |
| AMD R9 380 (Tonga) | **Not installed** | Stale references to `sdcpp.backend=cpu` / Tonga paths do **not** apply to the demo. Do not quote R9 380 timings in the video. |

Cloud fallback: `CLOUD_BACKEND=cloudflare` (Workers AI, free FLUX.1-schnell,
~3 s/image) when the local GPU must not stall live.

## What's DONE (~85%)

| Component | Status |
|-----------|--------|
| Local SD diffusion | ✅ Working — SD-Turbo-GGUF generates PNGs via sd-server + bridge (:13305) |
| Frame generation | ✅ 4-frame sequence generated with proper prompts |
| Movie manifest format | ✅ Matches Unity GovernedMovieCapture.cs exactly |
| Provenance JSON | ✅ Follows governance schema (intentId, worldId, timelineId, etc.) |
| Constitution compliance | ✅ All P1-P5 principles honored, 16/16 conformance checks pass |
| Zero-cost operation | ✅ Local models, no API fees; Cloudflare FLUX free tier as polish fallback |
| Demo GPU | ✅ RX 580 Vulkan path proven end-to-end; restart fallback scripted |

## What's REMAINING (~15%)

| Component | Effort |
|-----------|--------|
| Actual movie encoding (PNG sequence → MP4) | trivial — `ffmpeg -y -framerate 1 -i frame_%05d.png output.mp4` |
| Unity3D integration | Attach GovernedMovieCapture component to scene, call StartGovernedRecord() |
| Unreal integration | Add UGovernedMovieCaptureComponent to level, call FGovernedMovieCapture::TryStart() |
| Automated frame timing | Link prompt sequence to FPS (e.g., 30fps = 30 frames for 1s movie) |
| Camera motion / 4D transform | Mandala's 4D math pipeline (s3.js, transform.js, projector.js) drives frame generation — the differentiator |

## Key Distinction

The diffusion + governance part is complete: generate any number of frames
locally at zero cost, with proper Mandala manifests + provenance. The remaining
work is the **Mandala 4D cinema pipeline integration** any movie project needs:

1. Connect generated frames to the render timeline — the 4D transform system
   decides which prompt appears at each frame/time.
2. Hook into the existing playback/recording system — manifests/provenance are
   ready; tell the engine to use them.
3. Optional: ffmpeg PNG sequence → MP4 (one-liner).

## Demo Constraints

- Keep every request at **512x512**; never let a stale browser page send 1024.
- Rehearse the failover: `Stop-Process` sd-server → `sd_server_13306.bat` → ~30-60 s model reload.
- Video arc: hardware stats → pipeline boot → short local render → money shot (Cloudflare FLUX if time-critical).
