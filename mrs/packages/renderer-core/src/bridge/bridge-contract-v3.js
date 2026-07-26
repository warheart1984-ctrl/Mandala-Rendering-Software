import { vec3, add3, scale3, length3 } from "../math3d/vec3.js";
import { vec4 } from "../math/vec4.js";
import { sampleWaveAtPosition, waveGradientAtPosition } from "./bridge-map.js";
import { stepWaveField3D } from "./wave-field-3d.js";
import { resolveCouplingArray } from "./bridge-contract-v2.js";
import {
  sampleCurvatureAtPosition,
  stepTensorField3D,
  tensorGradientAtPosition,
} from "./tensor-field.js";
import {
  sampleVectorAtPosition,
  stepVectorField3D,
  vectorFieldDivergenceAtPosition,
} from "./vector-field.js";
import { stepWaveField4D } from "./wave-field-4d.js";

/**
 * BridgeContract v3.0 — tensor-coupled multi-field bridge.
 *
 * Status: **partial** for scalar FD + discrete κ/∂κ proxies + coupling formulas.
 * Not continuum GR, not live portals, not an enforced “reality fabric”.
 * Vector step / tensor step / 4D wave / portal events: **skeleton** or **declared**.
 *
 * Formulas (per scalar layer s, with optional aligned vector/tensor fields):
 *   F = −k ∇ψ + λ (div V) ê_iso + μ ∇κ̂   (ê_iso = (1,1,1) isotropic div proxy)
 *   w = α ψ + β κ
 *   M = γ ψ + δ |V| + ε κ
 *   Θ = σ ψ κ
 *
 * @typedef {import("./field-registry.js").FieldRegistry} FieldRegistry
 * @typedef {import("./bridge-contract-v2.js").BridgeInputs3Dv2} BridgeInputs3Dv2
 * @typedef {import("./bridge-contract-v2.js").BridgeOutputsV2} BridgeOutputsV2
 */

/**
 * @implements {{ evaluate: (inputs: BridgeInputs3Dv2) => BridgeOutputsV2 }}
 */
export class WaveBridgeV3 {
  /**
   * @param {FieldRegistry} registry
   * @param {object} [couplings]
   * @param {number[]} [couplings.alpha] α — wave lift
   * @param {number[]} [couplings.beta] β — curvature lift
   * @param {number[]} [couplings.kForce] k — wave force
   * @param {number[]} [couplings.lambdaDiv] λ — divergence coupling
   * @param {number[]} [couplings.muTensor] μ — ∂κ force coupling
   * @param {number[]} [couplings.gammaVisual] γ — ψ mod
   * @param {number[]} [couplings.deltaVisual] δ — |V| mod
   * @param {number[]} [couplings.epsilonVisual] ε — κ mod
   * @param {number[]} [couplings.sigmaTransition] σ — Θ = σ ψ κ
   */
  constructor(registry, couplings = {}) {
    if (!registry) throw new Error("WaveBridgeV3 requires a FieldRegistry");
    this.registry = registry;
    const n = registry.scalarCount;
    this.alpha = resolveCouplingArray(couplings.alpha, n, 1, "alpha");
    this.beta = resolveCouplingArray(couplings.beta, n, 0, "beta");
    this.kForce = resolveCouplingArray(couplings.kForce, n, 1, "kForce");
    this.lambdaDiv = resolveCouplingArray(couplings.lambdaDiv, n, 0, "lambdaDiv");
    this.muTensor = resolveCouplingArray(couplings.muTensor, n, 0, "muTensor");
    this.gammaVisual = resolveCouplingArray(couplings.gammaVisual, n, 1, "gammaVisual");
    this.deltaVisual = resolveCouplingArray(couplings.deltaVisual, n, 0, "deltaVisual");
    this.epsilonVisual = resolveCouplingArray(couplings.epsilonVisual, n, 0, "epsilonVisual");
    this.sigmaTransition = resolveCouplingArray(
      couplings.sigmaTransition,
      n,
      1,
      "sigmaTransition",
    );
  }

  /** Step scalars for real; vector/tensor/4D remain no-op skeletons when present. */
  stepAllFields(deltaTime) {
    const { registry } = this;
    for (const f of registry.scalarFields) {
      stepWaveField3D(f, deltaTime ?? f.dt);
    }
    for (const vf of registry.vectorFields) stepVectorField3D(vf);
    for (const tf of registry.tensorFields) stepTensorField3D(tf);
    for (const wf of registry.waveFields4D) stepWaveField4D(wf);
  }

  /**
   * @param {BridgeInputs3Dv2} inputs
   * @returns {BridgeOutputsV2}
   */
  evaluate(inputs = {}) {
    const { registry } = this;
    const scalars = registry.scalarFields;
    const n = scalars.length;
    this.stepAllFields(inputs.deltaTime);

    const bodies = inputs.bodies ?? [];
    /** @type {Map<string|number, import("./bridge-contract.js").Vec3[]>} */
    const forces = new Map();

    for (let bi = 0; bi < bodies.length; bi++) {
      const body = bodies[bi];
      /** @type {import("./bridge-contract.js").Vec3[]} */
      const bundle = new Array(n);
      for (let s = 0; s < n; s++) {
        const force = this._forceAt(s, body.position);
        bundle[s] = { x: force.x, y: force.y, z: force.z };
        if (typeof body.applyForce === "function") {
          body.applyForce(force.x, force.y, force.z);
        }
      }
      forces.set(body.id ?? bi, bundle);
    }

    const vertices = inputs.geometryVertices ?? [];
    void (inputs.geometryNormals ?? []);
    void (inputs.geometryTangents ?? []);

    /** @type {import("./bridge-contract.js").Vec4[][]} */
    const lifted4D = new Array(n);
    /** @type {Float32Array[]} */
    const visualMod = new Array(n);
    /** @type {Float32Array[]} */
    const transitions = new Array(n);

    for (let s = 0; s < n; s++) {
      const field = scalars[s];
      const layer = new Array(vertices.length);
      const mod = new Float32Array(vertices.length);
      const trans = new Float32Array(vertices.length);
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const psi = sampleWaveAtPosition(field, v);
        const kappa = this._kappaAt(s, v);
        const vMag = this._vectorMagAt(s, v);
        layer[i] = vec4(v.x, v.y, v.z, this.alpha[s] * psi + this.beta[s] * kappa);
        mod[i] = this.gammaVisual[s] * psi + this.deltaVisual[s] * vMag + this.epsilonVisual[s] * kappa;
        // Θ = σ ψ κ (documented product; not a portal event emitter)
        trans[i] = this.sigmaTransition[s] * psi * kappa;
      }
      lifted4D[s] = layer;
      visualMod[s] = mod;
      transitions[s] = trans;
    }

    return { lifted4D, forces, visualMod, transitions };
  }

  _tensorField(s) {
    return this.registry.tensorFields[s] ?? null;
  }

  _vectorField(s) {
    return this.registry.vectorFields[s] ?? null;
  }

  _kappaAt(s, pos) {
    const tf = this._tensorField(s);
    return tf ? sampleCurvatureAtPosition(tf, pos) : 0;
  }

  _vectorMagAt(s, pos) {
    const vf = this._vectorField(s);
    return vf ? length3(sampleVectorAtPosition(vf, pos)) : 0;
  }

  /**
   * @param {number} s
   * @param {{ x: number, y: number, z: number }} pos
   */
  _forceAt(s, pos) {
    const field = this.registry.scalarFields[s];
    const grad = waveGradientAtPosition(field, pos);
    let force = scale3(grad, -this.kForce[s]);

    const vf = this._vectorField(s);
    if (vf && this.lambdaDiv[s] !== 0) {
      const div = vectorFieldDivergenceAtPosition(vf, pos);
      // Isotropic divergence coupling proxy (scalar → Vec3); not a pressure solver.
      force = add3(force, vec3(this.lambdaDiv[s] * div, this.lambdaDiv[s] * div, this.lambdaDiv[s] * div));
    }

    const tf = this._tensorField(s);
    if (tf && this.muTensor[s] !== 0) {
      const tg = tensorGradientAtPosition(tf, pos);
      force = add3(force, scale3(tg, this.muTensor[s]));
    }

    return force;
  }
}

/**
 * §9 frame helper (v3): step → force bundles → lift/mod/transition layers.
 * Library orchestration only — not CKL / GR / portal enforcement.
 *
 * @param {WaveBridgeV3} bridge
 * @param {BridgeInputs3Dv2} inputs
 * @param {{ integrateBodies?: boolean, bodyDt?: number }} [options]
 */
export function runBridgeFrameV3(bridge, inputs = {}, options = {}) {
  const out = bridge.evaluate(inputs);
  if (options.integrateBodies) {
    const dt = options.bodyDt ?? inputs.deltaTime ?? 1 / 60;
    for (const body of inputs.bodies ?? []) {
      if (typeof body.integrate === "function") body.integrate(dt);
    }
  }
  return out;
}
