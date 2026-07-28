/**
 * RT4D Adapter — converts Engine3D SceneBridge primitives to RT4D render objects.
 *
 * Status: **partial**
 *   - Hypersphere → RT4D Hypersphere: implemented
 *   - Triangle → RT4D HyperTriangle: implemented
 *   - Point samples → RT4D Hypersphere: implemented
 *   - Material mapping: partial (uses material hints)
 *   - Camera conversion: partial (basic mapping)
 */

import type { BridgePrimitive, BridgeCameraDescriptor, Engine3DBridgeScene } from "./types.js";

/** RT4D HyperTriangle-compatible vertex tuple */
export type Rt4dVertexTuple = readonly [number, number, number, number];

/**
 * Convert a BridgePrimitive to RT4D render objects.
 * Returns an array of RT4D-compatible objects (Hypersphere or HyperTriangle data).
 */
export function bridgePrimitiveToRt4d(primitive: BridgePrimitive): {
  kind: string;
  data: unknown;
  materialHint?: string;
} {
  switch (primitive.kind) {
    case "hypersphere":
    case "point_sample":
      return {
        kind: "hypersphere",
        data: {
          center: primitive.center as Rt4dVertexTuple,
          radius: primitive.radius,
        },
        materialHint: primitive.materialHint,
      };
    case "triangle":
      if (!primitive.triangle) {
        throw new Error(`Triangle primitive ${primitive.id} missing triangle data`);
      }
      // Convert 3D triangle vertices to 4D by adding the w-coordinate from center
      const w = primitive.center[3];
      const vertices: Rt4dVertexTuple[] = [];
      for (let i = 0; i < primitive.triangle.vertices.length; i += 3) {
        vertices.push([
          primitive.triangle.vertices[i] ?? 0,
          primitive.triangle.vertices[i + 1] ?? 0,
          primitive.triangle.vertices[i + 2] ?? 0,
          w,
        ] as Rt4dVertexTuple);
      }
      return {
        kind: "hypertriangle",
        data: {
          vertices,
          indices: Array.from(primitive.triangle.indices),
        },
        materialHint: primitive.materialHint,
      };
    case "oriented_capsule":
      if (!primitive.capsule) {
        throw new Error(`Oriented capsule primitive ${primitive.id} missing capsule endpoints`);
      }
      return {
        kind: "oriented-capsule",
        data: {
          a: primitive.capsule.a,
          b: primitive.capsule.b,
          radius: primitive.radius,
          center: primitive.center,
        },
        materialHint: primitive.materialHint,
      };
    default:
      throw new Error(`Unknown primitive kind: ${(primitive as BridgePrimitive).kind}`);
  }
}

/**
 * Convert a BridgeCameraDescriptor to RT4D camera parameters.
 */
export function bridgeCameraToRt4d(camera: BridgeCameraDescriptor): {
  eye: Rt4dVertexTuple;
  lookAt: Rt4dVertexTuple;
  up: Rt4dVertexTuple;
  fovY: number;
} {
  return {
    eye: camera.eye as Rt4dVertexTuple,
    lookAt: camera.lookAt as Rt4dVertexTuple,
    up: camera.up as Rt4dVertexTuple,
    fovY: camera.fovY,
  };
}

/**
 * Convert an entire Engine3DBridgeScene to RT4D render data.
 */
export function bridgeSceneToRt4d(scene: Engine3DBridgeScene): {
  primitives: Array<{
    kind: string;
    data: unknown;
    materialHint?: string;
  }>;
  camera: ReturnType<typeof bridgeCameraToRt4d>;
  lattice: typeof scene.lattice;
  metadata: {
    schemaVersion: string;
    frameIndex: number;
    seed: number;
    primitiveCount: number;
  };
} {
  const primitives = scene.primitives.map(bridgePrimitiveToRt4d);
  const camera = bridgeCameraToRt4d(scene.camera);
  
  return {
    primitives,
    camera,
    lattice: scene.lattice,
    metadata: {
      schemaVersion: scene.schemaVersion,
      frameIndex: scene.frameIndex,
      seed: scene.seed,
      primitiveCount: primitives.length,
    },
  };
}

/**
 * Material hint to RT4D material ID mapping.
 * This is a basic mapping; full material system integration would be more complex.
 */
export function materialHintToRt4dId(hint?: string): string {
  switch (hint) {
    case "surf":
      return "lambertian";
    case "shadow":
      return "shadow-catcher";
    case "radiant-core":
      return "emissive";
    default:
      return "default";
  }
}

/**
 * Convert bridge primitives with material hints to RT4D material assignments.
 */
export function assignRt4dMaterials(
  primitives: ReturnType<typeof bridgePrimitiveToRt4d>[],
): Map<string, string> {
  const assignments = new Map<string, string>();
  for (const prim of primitives) {
    if (prim.materialHint) {
      const rt4dId = materialHintToRt4dId(prim.materialHint);
      assignments.set(prim.kind, rt4dId);
    }
  }
  return assignments;
}
