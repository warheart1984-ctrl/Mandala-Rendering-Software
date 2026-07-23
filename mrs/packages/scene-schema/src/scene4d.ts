/**
 * Canonical Scene4D tool/widget contract.
 * Surface IDs below are DTO aliases; map to @mrs/renderer-core ids via surface-map.
 */
export type SurfaceId =
  | "clifford_torus"
  | "hopf_surface"
  | "tesseract"
  | "trefoil_4d"
  | "torus_3d";

export type PlaneId = "XY" | "XZ" | "XW" | "YZ" | "YW" | "ZW";

export type Quality = "adaptive" | "performance" | "high" | "ultra";

export type ProjectionType = "perspective" | "orthographic";

export interface RotationPlane {
  plane: PlaneId;
  speed: number;
}

export interface Camera4D {
  position4d: [number, number, number, number];
  target4d: [number, number, number, number];
}

export interface Material4D {
  /** hex color */
  color: string;
  /** 0–1 */
  opacity: number;
  wireframe: boolean;
}

export interface Projection4D {
  type: ProjectionType;
  distance4d: number;
  distance3d: number;
}

export interface Scene4DDTO {
  /** unique scene ID */
  id: string;
  surface: SurfaceId;
  rotations: RotationPlane[];
  projection: Projection4D;
  camera: Camera4D;
  material: Material4D;
  quality: Quality;
  resolution: number;
  /** animation parameter t */
  time: number;
}

export const DEFAULT_CAMERA: Camera4D = {
  position4d: [0, 0, 0, 4],
  target4d: [0, 0, 0, 0],
};

export const DEFAULT_MATERIAL: Material4D = {
  color: "#6ec8ff",
  opacity: 1,
  wireframe: true,
};

export const DEFAULT_PROJECTION: Projection4D = {
  type: "perspective",
  distance4d: 4,
  distance3d: 4,
};
