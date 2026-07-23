export type {
  SurfaceId,
  PlaneId,
  Quality,
  ProjectionType,
  RotationPlane,
  Camera4D,
  Material4D,
  Projection4D,
  Scene4DDTO,
} from "./scene4d.js";

export {
  DEFAULT_CAMERA,
  DEFAULT_MATERIAL,
  DEFAULT_PROJECTION,
} from "./scene4d.js";

/** WorldDocument v1 — declared DTOs (parallel to Scene4DDTO; does not replace it). */
export type {
  WorldSchemaVersion,
  GeometryKind,
  CoreSurfaceId,
  Rotate4D,
  Vec4Tuple,
  Transform4D,
  WorldGeometry,
  WorldMaterial,
  WorldEntity,
  ObservationHint,
  WorldDocument,
} from "./world-document.js";

export { isWorldDocument } from "./world-document.js";
