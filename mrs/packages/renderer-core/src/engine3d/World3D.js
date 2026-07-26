import { Body3D } from "../math3d/physics.js";
import { vec3 } from "../math3d/vec3.js";

/**
 * Minimal 3D world container for the EngineHost demo loop.
 *
 * Status: **partial** — holds stable Body3D refs + mesh vertices; not a scene
 * graph, not Unreal/PhysX parity.
 *
 * Canonical mesh access matches the locked engine loop:
 *   geometryVertices: world.mesh.vertices
 */
export class World3D {
  constructor(options = {}) {
    /** @type {import("../math3d/physics.js").RigidBody3D[]} */
    this.bodies = [];
    /** @type {{ vertices: { x: number, y: number, z: number }[] }} */
    this.mesh = {
      vertices: options.vertices
        ? options.vertices.map((v) => vec3(v.x, v.y, v.z))
        : [],
    };
    this._nextBodyId = 0;
  }

  /** @deprecated Prefer world.mesh.vertices — kept as a mirror for callers. */
  get vertices() {
    return this.mesh.vertices;
  }

  set vertices(value) {
    this.mesh.vertices = value;
  }

  /**
   * @param {import("../math3d/physics.js").RigidBody3D | object} bodyOrOptions
   * @returns {import("../math3d/physics.js").RigidBody3D}
   */
  addBody(bodyOrOptions = {}) {
    const body =
      bodyOrOptions instanceof Body3D
        ? bodyOrOptions
        : new Body3D(bodyOrOptions);
    if (body.id == null) {
      body.id = this._nextBodyId++;
    } else if (typeof body.id === "number" && body.id >= this._nextBodyId) {
      this._nextBodyId = body.id + 1;
    }
    this.bodies.push(body);
    return body;
  }

  /**
   * @param {{ x: number, y: number, z: number }[]} vertices
   */
  setVertices(vertices) {
    this.mesh.vertices = vertices.map((v) => vec3(v.x, v.y, v.z));
  }

  /**
   * Clear force accumulators (used so step-3 apply is the sole deposit after
   * WaveBridge.evaluate's side-effect applyWaveForceToBody).
   */
  clearForces() {
    for (const body of this.bodies) {
      body.forceAccum.x = 0;
      body.forceAccum.y = 0;
      body.forceAccum.z = 0;
      if (body.forceAccum.w !== undefined) body.forceAccum.w = 0;
    }
  }
}
