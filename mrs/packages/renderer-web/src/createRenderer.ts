import { CanvasRenderer } from "@mrs/renderer-core/render/canvas";
import { getSurface, sampleSurface } from "@mrs/renderer-core/surfaces";
import type { Scene4DDTO } from "@mrs/scene-schema";
import {
  detectWebGPU,
  type RenderBackend,
  type RendererHandle,
  type RenderState,
} from "./types.js";

/** Map DTO plane ids to CanvasRenderer rotationWeights keys. */
function planesToWeights(
  rotations: Scene4DDTO["rotations"]
): Record<string, number> {
  const weights: Record<string, number> = {
    xw: 0,
    yz: 0,
    zw: 0,
    yw: 0,
    xz: 0,
    xy: 0,
  };
  for (const r of rotations) {
    const key = r.plane.toLowerCase();
    weights[key] = r.speed;
  }
  if (rotations.length === 0) {
    return { xw: 0.7, yz: 1.1, zw: 1.5, yw: 2.0 };
  }
  return weights;
}

/** DTO surface id → renderer-core surface id */
function toCoreSurfaceId(surface: Scene4DDTO["surface"]): string {
  const map: Record<Scene4DDTO["surface"], string> = {
    clifford_torus: "clifford-torus",
    hopf_surface: "hopf-surface",
    tesseract: "tesseract",
    trefoil_4d: "trefoil-4d",
    torus_3d: "torus-3d",
  };
  return map[surface];
}

/**
 * Non-React factory: Canvas2D path only.
 * WebGPU may be detected but is not claimed as an active renderer here
 * (optional/declared — falls back to Canvas2D).
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  spec: Scene4DDTO
): Promise<RendererHandle> {
  const webgpu = await detectWebGPU();
  const backend: RenderBackend = webgpu
    ? "webgpu-unavailable"
    : "canvas2d";
  // Even if WebGPU adapter exists, this package renders via Canvas2D only.
  // Label: WebGPU optional/declared — not an active path in createRenderer.
  void backend;

  const activeBackend: RenderBackend = "canvas2d";

  const renderer = new CanvasRenderer(canvas, {
    profile: "technical",
    d4: spec.projection.distance4d,
    d3: spec.projection.distance3d,
    rotationWeights: planesToWeights(spec.rotations),
    background: "#0e1216",
    renderMode: spec.material.wireframe ? "wireframe" : "solid",
  });

  let mesh = sampleSurface(
    getSurface(toCoreSurfaceId(spec.surface)),
    spec.resolution
  );

  let destroyed = false;
  let time = spec.time;

  const handle: RendererHandle = {
    render(t: number) {
      if (destroyed) return;
      time = t;
      renderer.clear();
      renderer.renderFrame(mesh, t, {
        stroke: spec.material.color,
      });
    },
    resize(width: number, height: number, dpr = 1) {
      if (destroyed) return;
      const w = Math.max(1, Math.floor(width * dpr));
      const h = Math.max(1, Math.floor(height * dpr));
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      renderer.setViewSize(width, height);
      const ctx = canvas.getContext("2d");
      if (ctx && dpr !== 1) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    destroy() {
      destroyed = true;
    },
    getBackend() {
      return activeBackend;
    },
    setD4(d4: number) {
      renderer.d4 = d4;
    },
    adjustRotation(dx: number, dy: number) {
      renderer.rotationWeights.xw =
        (renderer.rotationWeights.xw ?? 0) + dx * 0.01;
      renderer.rotationWeights.yz =
        (renderer.rotationWeights.yz ?? 0) + dy * 0.01;
    },
    getState(): RenderState {
      return {
        time,
        d4: renderer.d4,
        d3: renderer.d3,
        rotationWeights: { ...renderer.rotationWeights },
        backend: activeBackend,
      };
    },
  };

  return handle;
}

export function remesh(spec: Scene4DDTO) {
  return sampleSurface(
    getSurface(toCoreSurfaceId(spec.surface)),
    spec.resolution
  );
}
