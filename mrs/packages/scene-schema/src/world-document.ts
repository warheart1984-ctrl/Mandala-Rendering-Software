/**
 * WorldDocument v1 — declared DTOs for 4D Engine World Format.
 * Parallel to Scene4DDTO; does not replace or alter the ChatGPT widget contract.
 *
 * Status: declared TypeScript shapes. Runtime loaders / PLP enforcement not claimed here.
 * Spec: docs/4d-engine/v1/world-format/WORLD_FORMAT_V1.md
 */

export type WorldSchemaVersion = "1.0";

export type GeometryKind = "surface" | "meshRef" | "sdfRef" | "empty";

/** Renderer-core registry ids (hyphenated). Not Scene4DDTO underscore aliases. */
export type CoreSurfaceId =
  | "clifford-torus"
  | "hopf-surface"
  | "tesseract"
  | "trefoil-4d"
  | "torus-3d"
  | (string & {});

export interface Rotate4D {
  xy?: number;
  xz?: number;
  xw?: number;
  yz?: number;
  yw?: number;
  zw?: number;
}

export type Vec4Tuple = [number, number, number, number];

export interface Transform4D {
  translate?: Vec4Tuple;
  rotate?: Rotate4D;
  scale?: Vec4Tuple;
}

export interface WorldGeometry {
  kind: GeometryKind;
  /** Required when kind === "surface" — prefer renderer-core ids */
  surfaceId?: CoreSurfaceId;
  uri?: string;
  resolution?: number;
}

export interface WorldMaterial {
  id: string;
  color?: string;
  opacity?: number;
  wireframe?: boolean;
}

export interface WorldEntity {
  id: string;
  name?: string;
  transform4d?: Transform4D;
  geometry: WorldGeometry;
  materialId?: string;
  tags?: string[];
  userData?: Record<string, unknown>;
}

export interface ObservationHint {
  modeId: string;
  params?: Record<string, number>;
}

export interface WorldDocument {
  schemaVersion: WorldSchemaVersion;
  id: string;
  name?: string;
  description?: string;
  units?: string;
  materials?: WorldMaterial[];
  entities: WorldEntity[];
  defaultObservation?: ObservationHint;
  metadata?: Record<string, unknown>;
}

/**
 * Lossy declared mapping note: a one-surface WorldDocument MAY be summarized as
 * Scene4DDTO for ChatGPT tools, but ids/fields differ — use surface-map adapters.
 * This helper does not perform a full conversion (not enforced).
 */
export function isWorldDocument(value: unknown): value is WorldDocument {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === "1.0" &&
    typeof v.id === "string" &&
    Array.isArray(v.entities)
  );
}
