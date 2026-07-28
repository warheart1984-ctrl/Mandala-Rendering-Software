/**
 * Engine3D → RT4D SceneBridge intermediate document types.
 *
 * Status:
 *   - Document schema + capture: **partial** (implemented + tested for spheres /
 *     capped mesh point samples / lattice params).
 *   - Arbitrary triangle mesh → RT4D path-trace: **declared** (not supported;
 *     RT4D still path uses Hypersphere/Hyperplane primitives).
 */

export const ENGINE3D_BRIDGE_SCENE_SCHEMA = "engine3d-bridge-scene/1.1" as const;

export type BridgePrimitiveKind = "hypersphere" | "point_sample" | "triangle" | "oriented_capsule";

export type BridgePrimitiveSource = "body" | "mesh_vertex" | "lattice_node" | "mesh_triangle" | "world_document";

/** 4D center: xyz from Engine3D, w from seed/frame jitter or lattice channel. */
export type Vec4Tuple = readonly [number, number, number, number];

export interface BridgePrimitive {
  kind: BridgePrimitiveKind;
  id: string;
  center: Vec4Tuple;
  radius: number;
  source: BridgePrimitiveSource;
  sourceId?: string;
  materialHint?: string;
  /** Triangle mesh data (only when kind === "triangle") */
  triangle?: {
    vertices: Float32Array;
    normals?: Float32Array;
    indices: Uint16Array | Uint32Array;
  };
  capsule?: {
    a: Vec4Tuple;
    b: Vec4Tuple;
  };
  provenance?: Readonly<Record<string, unknown>>;
}

/**
 * Minimal camera descriptor — Engine3D core has no camera type yet.
 * Status: **partial** (descriptor + defaults; not a full Engine3D camera system).
 */
export interface BridgeCameraDescriptor {
  eye: Vec4Tuple;
  lookAt: Vec4Tuple;
  up: Vec4Tuple;
  fovY: number;
}

export interface BridgeLatticeDescriptor {
  nodeCount: number;
  glyphIntensity: number;
  glyphCount: number;
  shaderParams: Record<string, number>;
}

export interface BridgeMappingNotes {
  /** Triangle meshes are now path-traced as triangles when indices available. */
  polyMeshTriangles: "implemented";
  bodyApproximation: "sphere_from_mass";
  meshVertices: "point_hypersphere_samples_capped";
  lattice: "visualMod_and_optional_mandala_nodes";
}

export interface Engine3DBridgeScene {
  schemaVersion: typeof ENGINE3D_BRIDGE_SCENE_SCHEMA;
  frameIndex: number;
  seed: number;
  primitives: BridgePrimitive[];
  camera: BridgeCameraDescriptor;
  lattice: BridgeLatticeDescriptor;
  mappingNotes: BridgeMappingNotes;
}

export interface SceneBridgeEvidence {
  frameIndex: number;
  seed: number;
  worldHash: string;
  primitiveCount: number;
  cameraHash: string;
  latticeHash: string;
  sceneHash: string;
  /** Present only when a render adapter completes an image (optional). */
  pngChecksum?: string;
}

export interface SceneBridgeCaptureResult {
  scene: Engine3DBridgeScene;
  evidence: SceneBridgeEvidence;
}

export interface SceneBridgeCaptureOptions {
  /** Hard cap on mesh vertex → point samples (default 64). */
  maxMeshSamples?: number;
  /** Base radius before mass scaling (default 0.35). */
  baseBodyRadius?: number;
  /** Radius for mesh vertex point samples (default 0.08). */
  meshSampleRadius?: number;
  /** Include MandalaLattice nodes as small hyperspheres (default true when provided). */
  includeMandalaNodes?: boolean;
  /** Max mandala nodes to sample (default 32). */
  maxMandalaNodes?: number;
  /** Extract triangle meshes when indices available (default true). */
  includeMeshTriangles?: boolean;
  /** Max triangles to extract per mesh (default 128). */
  maxMeshTriangles?: number;
}
