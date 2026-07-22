/** @typedef {{ x: number, y: number, z: number, w: number }} Vec4 */

export function vec4(x = 0, y = 0, z = 0, w = 0) {
  return { x, y, z, w };
}

export function emptyInspectorResult() {
  return {
    schemaVersion: "1.1",
    ok: false,
    position: vec4(),
    normal4D: vec4(0, 0, 1, 0),
    tangentBasis: { t1: vec4(1, 0, 0, 0), t2: vec4(0, 1, 0, 0) },
    curvature: {
      k1: 0,
      k2: 0,
      dir1: vec4(1, 0, 0, 0),
      dir2: vec4(0, 1, 0, 0),
      /** MRS-IC Invariant 3.5 — true until second fundamental forms exist. */
      curvatureStub: true,
    },
    jacobian: [
      [1, 0],
      [0, 1],
      [0, 0],
      [0, 0],
    ],
    projectionMatrix: [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ],
    hyperplanes: [],
    rotationPlanes: [],
    topology: {
      incidentCellIds: [],
      neighborCellIds: [],
      isBoundary: false,
    },
    provenance: {
      primitiveId: -1,
      faceIndex: -1,
      bvhPath: [],
    },
    shaderDebug: null,
  };
}

export function dropWProjectionMatrix() {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}
