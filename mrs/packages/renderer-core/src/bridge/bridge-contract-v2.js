import { bridgeMap3Dto4D, sampleWaveAtPosition } from "./bridge-map.js";
import { applyWaveForceToBody } from "./wave-force.js";
import { stepWaveField3D } from "./wave-field-3d.js";
import {
  stepTensorField3D,
  stepVectorField3D,
  stepWaveField4D,
} from "./field-skeletons.js";
import { transitionSignal } from "./transitions.js";

/**
 * BridgeContract v2.0 — multi-field generalization of v1.0.
 *
 * Status: **partial** for scalar WaveField3D stepping + lift/force/mod layers.
 * Vector / tensor / WaveField4D paths are **skeleton** no-ops when present.
 * Portals remain **declared** (see transitions.js). Not CKL-enforced.
 *
 * @typedef {import("./field-registry.js").FieldRegistry} FieldRegistry
 * @typedef {import("./bridge-contract.js").Body3DLike} Body3DLike
 * @typedef {import("./bridge-contract.js").Vec3} Vec3
 * @typedef {import("./bridge-contract.js").Vec4} Vec4
 * @typedef {import("./bridge-contract.js").BridgeInputs3D} BridgeInputs3D
 *
 * @typedef {Object} BridgeInputs3Dv2
 * @property {number} [time]
 * @property {number} [deltaTime]
 * @property {Body3DLike[]} [bodies]
 * @property {Vec3[]} [geometryVertices]
 * @property {Vec3[]} [geometryNormals] Optional; may be empty.
 * @property {Vec3[]} [geometryTangents] Optional; may be empty.
 *
 * @typedef {Object} BridgeOutputsV2
 * @property {Vec4[][]} lifted4D Per scalar-field layer of lifted vertices.
 * @property {Map<string|number, Vec3[]>} forces Body id → per-scalar force bundle.
 * @property {Float32Array[]} visualMod Per-scalar M = γ ψ samples.
 * @property {Float32Array[]} transitions Per-scalar Θ = σ |ψ| samples.
 *
 * @typedef {Object} BridgeContractV2
 * @property {(inputs: BridgeInputs3Dv2) => BridgeOutputsV2} evaluate
 */

/**
 * Pad or validate a coupling coefficient array against scalar field count.
 * Empty / missing → fill with `fill`. Non-empty wrong length → throw.
 * @param {number[]|undefined|null} arr
 * @param {number} n
 * @param {number} fill
 * @param {string} name
 * @returns {number[]}
 */
export function resolveCouplingArray(arr, n, fill, name) {
  if (arr == null || arr.length === 0) {
    return Array.from({ length: n }, () => fill);
  }
  if (arr.length !== n) {
    throw new Error(
      `WaveBridgeV2 ${name}.length (${arr.length}) must equal scalarFields.length (${n})`,
    );
  }
  return arr.slice();
}

/**
 * @implements {BridgeContractV2}
 */
export class WaveBridgeV2 {
  /**
   * @param {FieldRegistry} registry
   * @param {object} [couplings]
   * @param {number[]} [couplings.alphaLift] α per scalar field
   * @param {number[]} [couplings.kForce] k per scalar field
   * @param {number[]} [couplings.ampVisual] γ per scalar field
   * @param {number[]} [couplings.sigmaTransition] σ per scalar field
   */
  constructor(registry, couplings = {}) {
    if (!registry) throw new Error("WaveBridgeV2 requires a FieldRegistry");
    this.registry = registry;
    const n = registry.scalarCount;
    this.alphaLift = resolveCouplingArray(couplings.alphaLift, n, 1, "alphaLift");
    this.kForce = resolveCouplingArray(couplings.kForce, n, 1, "kForce");
    this.ampVisual = resolveCouplingArray(couplings.ampVisual, n, 1, "ampVisual");
    this.sigmaTransition = resolveCouplingArray(
      couplings.sigmaTransition,
      n,
      1,
      "sigmaTransition",
    );
  }

  /**
   * @param {BridgeInputs3Dv2|BridgeInputs3D} inputs
   * @returns {BridgeOutputsV2}
   */
  evaluate(inputs = {}) {
    const { registry } = this;
    const scalars = registry.scalarFields;
    const n = scalars.length;
    const dt = inputs.deltaTime;

    for (let s = 0; s < n; s++) {
      stepWaveField3D(scalars[s], dt ?? scalars[s].dt);
    }

    // Skeleton slots: no-ops when empty or present — do not invent physics.
    for (const vf of registry.vectorFields) stepVectorField3D(vf);
    for (const tf of registry.tensorFields) stepTensorField3D(tf);
    for (const wf of registry.waveFields4D) stepWaveField4D(wf);

    const bodies = inputs.bodies ?? [];
    /** @type {Map<string|number, Vec3[]>} */
    const forces = new Map();
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      /** @type {Vec3[]} */
      const bundle = new Array(n);
      for (let s = 0; s < n; s++) {
        // applyForce only on last scalar so Body3D does not sum k's silently;
        // return the analytic F for each layer and apply each explicitly.
        const force = applyWaveForceToBody(scalars[s], body, this.kForce[s]);
        bundle[s] = { x: force.x, y: force.y, z: force.z };
      }
      forces.set(body.id ?? i, bundle);
    }

    const vertices = inputs.geometryVertices ?? [];
    // Optional normals/tangents accepted for forward-compat; unused in v2 partial.
    void (inputs.geometryNormals ?? []);
    void (inputs.geometryTangents ?? []);

    /** @type {Vec4[][]} */
    const lifted4D = new Array(n);
    /** @type {Float32Array[]} */
    const visualMod = new Array(n);
    /** @type {Float32Array[]} */
    const transitions = new Array(n);

    for (let s = 0; s < n; s++) {
      const field = scalars[s];
      const alpha = this.alphaLift[s];
      const gamma = this.ampVisual[s];
      const sigma = this.sigmaTransition[s];
      /** @type {Vec4[]} */
      const layer = new Array(vertices.length);
      const mod = new Float32Array(vertices.length);
      const trans = new Float32Array(vertices.length);
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const psi = sampleWaveAtPosition(field, v);
        layer[i] = bridgeMap3Dto4D(v, psi, alpha);
        mod[i] = gamma * psi;
        trans[i] = transitionSignal(psi, sigma);
      }
      lifted4D[s] = layer;
      visualMod[s] = mod;
      transitions[s] = trans;
    }

    return { lifted4D, forces, visualMod, transitions };
  }
}

/**
 * §8 frame helper (v2): step registry fields → force bundles → lift layers.
 * Library orchestration only — not CKL / portal enforcement.
 *
 * @param {WaveBridgeV2} bridge
 * @param {BridgeInputs3Dv2} inputs
 * @param {{ integrateBodies?: boolean, bodyDt?: number }} [options]
 * @returns {BridgeOutputsV2}
 */
export function runBridgeFrameV2(bridge, inputs = {}, options = {}) {
  const out = bridge.evaluate(inputs);
  if (options.integrateBodies) {
    const dt = options.bodyDt ?? inputs.deltaTime ?? 1 / 60;
    for (const body of inputs.bodies ?? []) {
      if (typeof body.integrate === "function") body.integrate(dt);
    }
  }
  return out;
}
