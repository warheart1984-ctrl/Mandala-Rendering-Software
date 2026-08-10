#!/usr/bin/env python3
"""CL-Gen — Constitutional OpenCL pixel generator (R9 380 / Tonga).

STATUS: **partial**
- Scene-aware still (camera + spheres/planes + emissive + soft shade + grain/DOF-ish post).
- Not Engine3D soft-raster parity (no triangle meshes, no true DOF circle-of-confusion, no MB).
- Not Lemonade SD / SDXL; not ROCm/HIP. Own governed renderer path.

Usage:
  python scripts/legacy-efficient/opencl_cl_gen_still.py \\
    --out docs/4d-engine/proofs/cl-gen/opencl-gen-dim-room.png \\
    --report docs/4d-engine/proofs/cl-gen/opencl-gen-dim-room.json \\
    --scene scripts/legacy-efficient/cl_gen_default_scene.json \\
    --width 512 --height 512
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# OpenCL kernel: compact scene floats packed by host.
# Layout (floats):
#   [0]=nSpheres [1]=nPlanes [2]=nLights [3]=ambient.r [4]g [5]b
#   [6..8]=eye [9..11]=look [12..14]=up [15]=fovRad
#   [16]=grain [17]=dofStrength [18]=focusDist [19]=vignette
#   then lights: 7 floats each (pos3, color3, intensity)
#   then spheres: 10 floats each (center3, radius, albedo3, emissive3)
#   then planes: 9 floats each (point3, normal3, albedo3)
KERNEL = r"""
__kernel void cl_gen_still(
    __global uchar *rgba,
    __global const float *scene,
    const int width,
    const int height,
    const float time_seed
) {
    const int x = get_global_id(0);
    const int y = get_global_id(1);
    if (x >= width || y >= height) return;
    const int pix = (y * width + x) * 4;

    const int nSpheres = (int)scene[0];
    const int nPlanes  = (int)scene[1];
    const int nLights  = (int)scene[2];
    const float3 ambient = (float3)(scene[3], scene[4], scene[5]);
    const float3 eye  = (float3)(scene[6], scene[7], scene[8]);
    const float3 look = (float3)(scene[9], scene[10], scene[11]);
    const float3 upv  = (float3)(scene[12], scene[13], scene[14]);
    const float fov   = scene[15];
    const float grainAmt = scene[16];
    const float dofStr   = scene[17];
    const float focusD   = scene[18];
    const float vignette = scene[19];

    /* Host layout: header20 | lights*7 | spheres*10 | planes*9 */
    const int lightBase = 20;
    const int sphereBase = 20 + nLights * 7;
    const int planeBase = sphereBase + nSpheres * 10;

    /* camera basis */
    float3 forward = look - eye;
    float fl = length(forward);
    if (fl < 1e-6f) forward = (float3)(0.0f, 0.0f, -1.0f);
    else forward = forward / fl;
    float3 right = cross(forward, upv);
    float rl = length(right);
    if (rl < 1e-6f) right = (float3)(1.0f, 0.0f, 0.0f);
    else right = right / rl;
    float3 cup = cross(right, forward);

    float aspect = (float)width / (float)height;
    float u = (2.0f * ((float)x + 0.5f) / (float)width) - 1.0f;
    float v = 1.0f - (2.0f * ((float)y + 0.5f) / (float)height);
    u *= aspect * tan(fov * 0.5f);
    v *= tan(fov * 0.5f);
    float3 rd = normalize(forward + right * u + cup * v);
    float3 ro = eye;

    float bestT = 1e9f;
    float3 hitN = (float3)(0.0f, 1.0f, 0.0f);
    float3 albedo = (float3)(0.02f, 0.02f, 0.03f);
    float3 emissive = (float3)(0.0f, 0.0f, 0.0f);
    int hit = 0;

    for (int i = 0; i < nSpheres && i < 16; i++) {
        int o = sphereBase + i * 10;
        float3 c = (float3)(scene[o], scene[o+1], scene[o+2]);
        float rad = scene[o+3];
        float3 oc = ro - c;
        float b = dot(oc, rd);
        float disc = b*b - dot(oc, oc) + rad*rad;
        if (disc > 0.0f) {
            float t = -b - sqrt(disc);
            if (t > 0.001f && t < bestT) {
                bestT = t;
                float3 p = ro + rd * t;
                hitN = normalize(p - c);
                albedo = (float3)(scene[o+4], scene[o+5], scene[o+6]);
                emissive = (float3)(scene[o+7], scene[o+8], scene[o+9]);
                hit = 1;
            }
        }
    }
    for (int i = 0; i < nPlanes && i < 8; i++) {
        int o = planeBase + i * 9;
        float3 pp = (float3)(scene[o], scene[o+1], scene[o+2]);
        float3 nn = (float3)(scene[o+3], scene[o+4], scene[o+5]);
        float nl = length(nn);
        if (nl < 1e-6f) continue;
        nn = nn / nl;
        float denom = dot(rd, nn);
        if (fabs(denom) < 1e-6f) continue;
        float t = dot(pp - ro, nn) / denom;
        if (t > 0.001f && t < bestT) {
            bestT = t;
            hitN = (denom < 0.0f) ? nn : -nn;
            albedo = (float3)(scene[o+6], scene[o+7], scene[o+8]);
            emissive = (float3)(0.0f, 0.0f, 0.0f);
            hit = 1;
        }
    }

    float3 col = ambient * 0.35f;
    float depth = bestT;
    if (hit) {
        float3 p = ro + rd * bestT;
        col = ambient * albedo;
        col += emissive;

        for (int li = 0; li < nLights && li < 8; li++) {
            int o = lightBase + li * 7;
            float3 lp = (float3)(scene[o], scene[o+1], scene[o+2]);
            float3 lc = (float3)(scene[o+3], scene[o+4], scene[o+5]);
            float li_i = scene[o+6];
            float3 L = lp - p;
            float dist2 = dot(L, L) + 1e-4f;
            L = L / sqrt(dist2);
            float ndl = max(dot(hitN, L), 0.0f);
            float atten = li_i / (1.0f + 0.35f * dist2);
            float shadow = 1.0f;
            float3 sro = p + hitN * 0.01f;
            for (int si = 0; si < nSpheres && si < 16; si++) {
                int so = sphereBase + si * 10;
                float3 sc = (float3)(scene[so], scene[so+1], scene[so+2]);
                float srad = scene[so+3];
                float3 oc = sro - sc;
                float b = dot(oc, L);
                float disc = b*b - dot(oc, oc) + srad*srad;
                if (disc > 0.0f) {
                    float t = -b - sqrt(disc);
                    if (t > 0.002f && t * t < dist2) {
                        shadow = 0.25f;
                        break;
                    }
                }
            }
            col += albedo * lc * (ndl * atten * shadow);
            float3 H = normalize(L - rd);
            float ndh = max(dot(hitN, H), 0.0f);
            col += lc * (pow(ndh, 32.0f) * 0.12f * atten * shadow);
        }
    } else {
        float sky = 0.5f + 0.5f * rd.y;
        col = ambient * (0.4f + 0.6f * sky) + (float3)(0.01f, 0.012f, 0.02f) * sky;
        depth = 12.0f;
    }

    /* DOF-like: blend toward ambient when off-focus (single-sample approximation) */
    float coc = fabs(depth - focusD) * dofStr;
    coc = clamp(coc, 0.0f, 1.0f);
    col = mix(col, ambient * 2.5f + col * 0.55f, coc * 0.45f);

    /* vignette */
    float ru = u / (aspect * tan(fov * 0.5f) + 1e-4f);
    float rv = v / (tan(fov * 0.5f) + 1e-4f);
    float r2 = ru * ru + rv * rv;
    col *= 1.0f - vignette * smoothstep(0.45f, 1.35f, r2);

    /* Deterministic grain (hash from pixel + seed) */
    float hx = (float)x * 12.9898f + (float)y * 78.233f + time_seed * 37.719f;
    float n = hx * 43758.5453f;
    n = n - floor(n);  // Manual fract() for AMD OpenCL compatibility
    col += (n - 0.5f) * grainAmt;

    col = clamp(col, 0.0f, 1.0f);
    /* mild filmic compress */
    col = col / (1.0f + col * 0.35f);
    col = clamp(col, 0.0f, 1.0f);

    rgba[pix + 0] = (uchar)(col.x * 255.0f);
    rgba[pix + 1] = (uchar)(col.y * 255.0f);
    rgba[pix + 2] = (uchar)(col.z * 255.0f);
    rgba[pix + 3] = (uchar)255;
}
"""


def _v3(obj, key, default):
    v = obj.get(key, default) if isinstance(obj, dict) else default
    if not isinstance(v, (list, tuple)) or len(v) < 3:
        return list(default)
    return [float(v[0]), float(v[1]), float(v[2])]


def pack_scene(scene: dict) -> list[float]:
    """Pack scene JSON into flat float buffer matching KERNEL layout."""
    cam = scene.get("camera") or {}
    post = scene.get("post") or {}
    ambient = _v3(scene, "ambient", [0.02, 0.02, 0.03])
    eye = _v3(cam, "eye", [0.0, 1.2, 3.5])
    look = _v3(cam, "look", [0.0, 1.0, 0.0])
    up = _v3(cam, "up", [0.0, 1.0, 0.0])
    fov_deg = float(cam.get("fovDeg", 50.0))
    fov = math.radians(fov_deg)

    lights = list(scene.get("lights") or [])[:8]
    spheres = list(scene.get("spheres") or [])[:16]
    planes = list(scene.get("planes") or [])[:8]

    header = [
        float(len(spheres)),
        float(len(planes)),
        float(len(lights)),
        ambient[0],
        ambient[1],
        ambient[2],
        eye[0],
        eye[1],
        eye[2],
        look[0],
        look[1],
        look[2],
        up[0],
        up[1],
        up[2],
        fov,
        float(post.get("grain", 0.03)),
        float(post.get("dofStrength", 0.25)),
        float(post.get("focusDist", 3.0)),
        float(post.get("vignette", 0.3)),
    ]

    light_f: list[float] = []
    for L in lights:
        pos = _v3(L, "pos", [0.0, 2.0, 0.0])
        col = _v3(L, "color", [1.0, 1.0, 1.0])
        light_f.extend(pos + col + [float(L.get("intensity", 1.0))])

    sphere_f: list[float] = []
    for S in spheres:
        c = _v3(S, "center", [0.0, 0.5, 0.0])
        alb = _v3(S, "albedo", [0.5, 0.5, 0.5])
        em = _v3(S, "emissive", [0.0, 0.0, 0.0])
        sphere_f.extend(c + [float(S.get("radius", 0.5))] + alb + em)

    plane_f: list[float] = []
    for P in planes:
        pt = _v3(P, "point", [0.0, 0.0, 0.0])
        n = _v3(P, "normal", [0.0, 1.0, 0.0])
        alb = _v3(P, "albedo", [0.1, 0.1, 0.1])
        plane_f.extend(pt + n + alb)

    return header + light_f + sphere_f + plane_f


def default_scene_path() -> Path:
    return Path(__file__).resolve().parent / "cl_gen_default_scene.json"


def main() -> int:
    ap = argparse.ArgumentParser(description="CL-Gen OpenCL scene-aware still")
    ap.add_argument("--width", type=int, default=512)
    ap.add_argument("--height", type=int, default=512)
    ap.add_argument(
        "--out",
        type=Path,
        default=Path("docs/4d-engine/proofs/cl-gen/opencl-gen-dim-room.png"),
    )
    ap.add_argument(
        "--report",
        type=Path,
        default=Path("docs/4d-engine/proofs/cl-gen/opencl-gen-dim-room.json"),
    )
    ap.add_argument("--scene", type=Path, default=None)
    ap.add_argument("--seed", type=float, default=1.0)
    ap.add_argument(
        "--scene-json",
        type=str,
        default=None,
        help="Inline scene JSON string (overrides --scene file)",
    )
    args = ap.parse_args()

    report: dict = {
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "statusTag": "partial",
        "provider": "opencl.gen",
        "capability": "image.gen.opencl",
        "purpose": "CL-Gen scene-aware still on AMD Tonga (R9 380)",
        "ok": False,
        "gapsVsEngine3dSoftRaster": [
            "no triangle mesh raster",
            "no multi-sample true DOF / motion blur / dust volume",
            "analytical spheres+planes only",
            "single soft shadow ray vs spheres",
        ],
    }

    try:
        import numpy as np
        import pyopencl as cl
        from PIL import Image
    except ImportError as exc:
        report["error"] = f"missing dependency: {exc}"
        report["help"] = "pip install pyopencl pillow numpy"
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))
        return 2

    try:
        if args.scene_json:
            scene = json.loads(args.scene_json)
        else:
            scene_path = Path(args.scene) if args.scene else default_scene_path()
            scene = json.loads(scene_path.read_text(encoding="utf-8"))
            report["scenePath"] = str(scene_path).replace("\\", "/")

        packed = pack_scene(scene)
        report["worldContext"] = scene.get("worldContext")
        report["worldProfileId"] = scene.get("worldProfileId")
        report["sphereCount"] = int(packed[0])
        report["planeCount"] = int(packed[1])
        report["lightCount"] = int(packed[2])

        platforms = cl.get_platforms()
        devices = [d for p in platforms for d in p.get_devices()]
        report["platforms"] = [
            {"name": p.name, "version": p.version, "vendor": p.vendor} for p in platforms
        ]
        report["devices"] = [
            {
                "name": d.name,
                "version": d.version,
                "max_compute_units": d.max_compute_units,
                "global_mem_size": d.global_mem_size,
            }
            for d in devices
        ]
        if not devices:
            raise RuntimeError("no OpenCL devices")

        device = next(
            (
                d
                for d in devices
                if "tonga" in d.name.lower() or "380" in d.name.lower()
            ),
            devices[0],
        )
        ctx = cl.Context([device])
        queue = cl.CommandQueue(ctx)
        prg = cl.Program(ctx, KERNEL).build()

        w, h = int(args.width), int(args.height)
        buf = np.zeros((h, w, 4), dtype=np.uint8)
        scene_np = np.asarray(packed, dtype=np.float32)
        cl_rgba = cl.Buffer(ctx, cl.mem_flags.WRITE_ONLY, buf.nbytes)
        cl_scene = cl.Buffer(
            ctx,
            cl.mem_flags.READ_ONLY | cl.mem_flags.COPY_HOST_PTR,
            hostbuf=scene_np,
        )

        t0 = time.perf_counter()
        prg.cl_gen_still(
            queue,
            (w, h),
            None,
            cl_rgba,
            cl_scene,
            np.int32(w),
            np.int32(h),
            np.float32(args.seed),
        )
        cl.enqueue_copy(queue, buf, cl_rgba)
        queue.finish()
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        args.out.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(buf, mode="RGBA").save(args.out)

        report.update(
            {
                "ok": True,
                "deviceName": device.name,
                "width": w,
                "height": h,
                "elapsedMs": round(elapsed_ms, 3),
                "outPath": str(args.out).replace("\\", "/"),
                "byteLength": args.out.stat().st_size,
                "pixelsProduced": True,
                "note": (
                    "CL-Gen OpenCL kernel wrote scene-aware RGBA still. "
                    "Not Lemonade SD; not SDXL; not Engine3D soft-raster parity. "
                    "Status: partial (PASS_WITH_GAPS vs full soft-raster)."
                ),
            }
        )
    except Exception as exc:  # noqa: BLE001
        report["ok"] = False
        report["error"] = f"{type(exc).__name__}: {exc}"

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
