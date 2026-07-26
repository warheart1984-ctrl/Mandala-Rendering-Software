import { bridgeMap3Dto4D, sampleWaveAtPosition } from "./bridge-map.js";
import { applyWaveForceToBody } from "./wave-force.js";
import { stepWaveField3D } from "./wave-field-3d.js";

/**
 * BridgeContract v1.0 types and WaveBridge implementation.
 *
 * Status: **partial** — discrete FD wave bridge; not CKL-enforced; not a
 * continuum PDE proof. See BRIDGECONTRACT_v1.0.md.
 *
 * @typedef {import("./wave-field-3d.js").WaveField3D} WaveField3D
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * @typedef {{ x: number, y: number, z: number, w: number }} Vec4
 *
 * @typedef {{
 *   id?: string | number,
 *   position: Vec3,
 *   mass?: number,
 *   acceleration?: Vec3,
 *   applyForce?: (fx: number, fy: number, fz: number) => void,
 * }} Body3DLike
 *
 * @typedef {Object} BridgeInputs3D
 * @property {number} [time] Simulation time (seconds); recorded for provenance-style callers.
 * @property {number} [deltaTime] Field step dt; defaults to field.dt.
 * @property {Body3DLike[]} [bodies]
 * @property {Vec3[]} [geometryVertices]
 *
 * @typedef {Object} BridgeOutputs
 * @property {Vec4[]} lifted4D X₄ = (x, y, z, α ψ) per vertex.
 * @property {Map<string|number, Vec3>} forces Body id → F = −k ∇ψ.
 * @property {number[]} visualMod M = γ ψ per vertex.
 *
 * @typedef {Object} BridgeContract
 * @property {(inputs: BridgeInputs3D) => BridgeOutputs} evaluate
 */

/**
 * Concrete BridgeContract v1.0.
 *
 * Couplings: α = alphaLift (w-lift), k = kForce (force), γ = ampVisual (mod).
 * Formulas: F = −k ∇ψ, X₄ = (x,y,z,αψ), M = γψ.
 *
 * @implements {BridgeContract}
 */
export class WaveBridge {
  /**
   * @param {WaveField3D} field
   * @param {number} [alphaLift=1]
   * @param {number} [kForce=1]
   * @param {number} [ampVisual=1]
   */
  constructor(field, alphaLift = 1, kForce = 1, ampVisual = 1) {
    if (!field) throw new Error("WaveBridge requires a WaveField3D");
    this.field = field;
    this.alphaLift = alphaLift;
    this.kForce = kForce;
    this.ampVisual = ampVisual;
  }

  /**
   * @param {BridgeInputs3D} inputs
   * @returns {BridgeOutputs}
   */
  evaluate(inputs = {}) {
    const field = this.field;
    const dt = inputs.deltaTime ?? field.dt;
    stepWaveField3D(field, dt);

    const bodies = inputs.bodies ?? [];
    /** @type {Map<string|number, Vec3>} */
    const forces = new Map();
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const force = applyWaveForceToBody(field, body, this.kForce);
      forces.set(body.id ?? i, { x: force.x, y: force.y, z: force.z });
    }

    const vertices = inputs.geometryVertices ?? [];
    /** @type {Vec4[]} */
    const lifted4D = new Array(vertices.length);
    /** @type {number[]} */
    const visualMod = new Array(vertices.length);
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      const psi = sampleWaveAtPosition(field, v);
      visualMod[i] = this.ampVisual * psi;
      lifted4D[i] = bridgeMap3Dto4D(v, psi, this.alphaLift);
    }

    return { lifted4D, forces, visualMod };
  }
}

/**
 * §7 frame helper (v1): step field → forces → optional body integrate → lift.
 * Does not claim CKL / governance enforcement — library orchestration only.
 *
 * @param {WaveBridge} bridge
 * @param {BridgeInputs3D} inputs
 * @param {{ integrateBodies?: boolean, bodyDt?: number }} [options]
 * @returns {BridgeOutputs}
 */
export function runBridgeFrame(bridge, inputs = {}, options = {}) {
  const out = bridge.evaluate(inputs);
  if (options.integrateBodies) {
    const dt = options.bodyDt ?? inputs.deltaTime ?? bridge.field.dt;
    const bodies = inputs.bodies ?? [];
    for (const body of bodies) {
      if (typeof body.integrate === "function") body.integrate(dt);
    }
  }
  return out;
}
