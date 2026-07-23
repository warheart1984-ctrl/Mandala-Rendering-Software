import type { SurfaceId } from "@mrs/scene-schema";

/** DTO SurfaceId → @mrs/renderer-core registry id */
export const SURFACE_ID_MAP: Record<SurfaceId, string> = {
  clifford_torus: "clifford-torus",
  hopf_surface: "hopf-surface",
  tesseract: "tesseract",
  trefoil_4d: "trefoil-4d",
  torus_3d: "torus-3d",
};

export function toCoreSurfaceId(id: SurfaceId): string {
  const mapped = SURFACE_ID_MAP[id];
  if (!mapped) {
    throw new Error(`Unknown SurfaceId: ${String(id)}`);
  }
  return mapped;
}
