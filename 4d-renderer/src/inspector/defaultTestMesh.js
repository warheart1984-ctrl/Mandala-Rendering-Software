/**
 * Default mesh for inspector WS / smoke tests.
 * Not Hyper-Caustic Lens (that scene is RT4D implicits without mesh faces).
 * Status: test fixture — prepares a pickable triangle mesh for wire round-trips.
 */
export function createDefaultInspectorTestMesh() {
  return {
    vertices: [
      { x: 0, y: 0, z: 0, w: 0 },
      { x: 1, y: 0, z: 0, w: 0 },
      { x: 0, y: 1, z: 0, w: 0 },
      { x: 0, y: 0, z: 1, w: 0 },
      { x: 0.5, y: 0.5, z: 0.5, w: 0.2 },
    ],
    faces: [
      [0, 1, 2],
      [0, 1, 3],
      [0, 2, 3],
      [1, 2, 4],
    ],
  };
}
