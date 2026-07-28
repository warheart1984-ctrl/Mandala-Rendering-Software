/**
 * HyperCausticLensVerifier — official Hyper-Caustic Lens validation hooks.
 *
 * Scene factory SoT: scene/TestHyperCausticLens.js
 * Projection math SoT: Projector4D (rt4d/output/projector.js)
 * Docs: docs/4drs/validation/Hyper-Caustic-Lens.md
 *
 * Status: partial — factory + structural + tolerance-based energy/caustic/
 * temporal sweeps assert; full pixel-hash gallery compare remains optional.
 *
 * Aperture ≠ print: sweeps use ProjectionKernel observation authority only.
 */

import { createHyperCausticLens } from "../scene/TestHyperCausticLens.js";
import { createProjectionState } from "./ProjectionState.js";
import { ProjectionKernel } from "./ProjectionKernel.js";
import { resolveObservationPreset } from "./ObservationModePresets.js";
import { projectPointContinuous } from "./continuityMath.js";

export const HYPER_CAUSTIC_VERIFIER_STATUS = /** @type {const} */ ("partial");

export const HYPER_CAUSTIC_SOT_BANNER =
  "Hyper-Caustic Lens verifier uses observation projection; Projector4D + CPU RT4D print remain SoT. Aperture ≠ print.";

/**
 * @typedef {object} LensVerifierResult
 * @property {boolean} ok
 * @property {"pass"|"soft_skip"|"fail"} verdict
 * @property {string} status
 * @property {string} reason
 * @property {object} [meta]
 */

/**
 * Probe that the validation scene factory is loadable and returns scene+camera.
 * @param {object} [options]
 * @returns {LensVerifierResult}
 */
export function verifyHyperCausticLensFactory(options = {}) {
  try {
    const { scene, camera } = createHyperCausticLens(options);
    const ok = Boolean(scene && camera);
    return {
      ok,
      verdict: ok ? "pass" : "fail",
      status: HYPER_CAUSTIC_VERIFIER_STATUS,
      reason: ok
        ? "createHyperCausticLens returned scene+camera (factory hook)"
        : "factory returned incomplete bundle",
      meta: {
        hasScene: Boolean(scene),
        hasCamera: Boolean(camera),
        width: camera?.width ?? null,
        height: camera?.height ?? null,
        printSoT: false,
        authority: "observation",
        banner: HYPER_CAUSTIC_SOT_BANNER,
      },
    };
  } catch (err) {
    return {
      ok: false,
      verdict: "fail",
      status: HYPER_CAUSTIC_VERIFIER_STATUS,
      reason: `factory threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Energy / boundedness sweep across soft_caustic κ using official lens fixtures.
 * Asserts finite screen energy proxy within tolerance (not a beauty-print claim).
 *
 * @param {{
 *   width?: number,
 *   height?: number,
 *   kappaSteps?: number[],
 *   energyTol?: number,
 * }} [opts]
 * @returns {LensVerifierResult}
 */
export function verifyHyperCausticLensEnergySweep(opts = {}) {
  const factory = verifyHyperCausticLensFactory(opts);
  if (!factory.ok) return factory;

  const kappas = opts.kappaSteps ?? [0, 0.25, 0.5, 1.0];
  const energyTol = opts.energyTol ?? 1e6;
  const probes = [
    { x: 0, y: 0, z: 0, w: 0 },
    { x: 0.5, y: -0.2, z: 0.3, w: 0.1 },
    { x: -0.4, y: 0.3, z: -0.1, w: -0.05 },
    { x: 0.1, y: 0.1, z: 1.5, w: 0.4 },
  ];

  /** @type {object[]} */
  const steps = [];
  for (const kappa of kappas) {
    const { state } = resolveObservationPreset("soft_caustic", {
      kappa,
      width: opts.width ?? 64,
      height: opts.height ?? 48,
    });
    let energy = 0;
    for (const p of probes) {
      const { screen } = projectPointContinuous(p, state);
      if (!Number.isFinite(screen.sx) || !Number.isFinite(screen.sy)) {
        return {
          ok: false,
          verdict: "fail",
          status: HYPER_CAUSTIC_VERIFIER_STATUS,
          reason: `non-finite screen at kappa=${kappa}`,
          meta: { kappa, screen },
        };
      }
      energy += Math.hypot(screen.sx, screen.sy);
    }
    const ok = energy < energyTol;
    steps.push({ kappa, energy, ok });
    if (!ok) {
      return {
        ok: false,
        verdict: "fail",
        status: HYPER_CAUSTIC_VERIFIER_STATUS,
        reason: `energy proxy ${energy} exceeded tol ${energyTol} at kappa=${kappa}`,
        meta: { steps, printSoT: false, authority: "observation" },
      };
    }
  }

  return {
    ok: true,
    verdict: "pass",
    status: HYPER_CAUSTIC_VERIFIER_STATUS,
    reason: "soft_caustic κ energy/boundedness sweep passed (tolerance-based)",
    meta: { steps, printSoT: false, authority: "observation", banner: HYPER_CAUSTIC_SOT_BANNER },
  };
}

/**
 * Caustic continuity: small Δκ yields bounded Δscreen (Lipschitz-style).
 * @param {{ eps?: number, bound?: number, width?: number, height?: number }} [opts]
 * @returns {LensVerifierResult}
 */
export function verifyHyperCausticLensCausticSweep(opts = {}) {
  const factory = verifyHyperCausticLensFactory(opts);
  if (!factory.ok) return factory;

  const eps = opts.eps ?? 1e-3;
  const bound = opts.bound ?? 500;
  const point = { x: 0.2, y: -0.1, z: 0.5, w: 0.08 };
  const base = resolveObservationPreset("soft_caustic", {
    kappa: 0.4,
    width: opts.width ?? 64,
    height: opts.height ?? 48,
  }).state;
  const a = projectPointContinuous(point, base).screen;
  const b = projectPointContinuous(
    point,
    createProjectionState({ ...base, kappa: base.kappa + eps }),
  ).screen;
  const lip = Math.hypot(b.sx - a.sx, b.sy - a.sy) / eps;
  const ok = Number.isFinite(lip) && lip <= bound;
  return {
    ok,
    verdict: ok ? "pass" : "fail",
    status: HYPER_CAUSTIC_VERIFIER_STATUS,
    reason: ok
      ? `caustic κ continuity lip=${lip.toFixed(4)} <= ${bound}`
      : `caustic κ continuity failed lip=${lip}`,
    meta: { lip, bound, eps, printSoT: false, authority: "observation" },
  };
}

/**
 * Temporal τ sweep: finite samples + local continuity.
 * @param {{ tauSteps?: number[], eps?: number, bound?: number, width?: number, height?: number }} [opts]
 * @returns {LensVerifierResult}
 */
export function verifyHyperCausticLensTemporalSweep(opts = {}) {
  const factory = verifyHyperCausticLensFactory(opts);
  if (!factory.ok) return factory;

  const taus = opts.tauSteps ?? [-0.2, 0, 0.2, 0.5];
  const eps = opts.eps ?? 1e-3;
  const bound = opts.bound ?? 500;
  const point = { x: 0.15, y: 0.05, z: 0.4, w: 0.12 };
  /** @type {object[]} */
  const steps = [];

  for (const tau of taus) {
    const state = createProjectionState({
      modeId: "soft_caustic",
      tau,
      kappa: 0.25,
      width: opts.width ?? 64,
      height: opts.height ?? 48,
      status: "partial",
    });
    const a = projectPointContinuous(point, state).screen;
    const b = projectPointContinuous(
      point,
      createProjectionState({ ...state, tau: tau + eps }),
    ).screen;
    if (![a.sx, a.sy, b.sx, b.sy].every(Number.isFinite)) {
      return {
        ok: false,
        verdict: "fail",
        status: HYPER_CAUSTIC_VERIFIER_STATUS,
        reason: `non-finite temporal screen at tau=${tau}`,
      };
    }
    const lip = Math.hypot(b.sx - a.sx, b.sy - a.sy) / eps;
    const ok = lip <= bound;
    steps.push({ tau, lip, ok });
    if (!ok) {
      return {
        ok: false,
        verdict: "fail",
        status: HYPER_CAUSTIC_VERIFIER_STATUS,
        reason: `temporal τ continuity failed at tau=${tau} lip=${lip}`,
        meta: { steps },
      };
    }
  }

  return {
    ok: true,
    verdict: "pass",
    status: HYPER_CAUSTIC_VERIFIER_STATUS,
    reason: "temporal τ sweep passed (tolerance-based)",
    meta: { steps, printSoT: false, authority: "observation", banner: HYPER_CAUSTIC_SOT_BANNER },
  };
}

/**
 * North-star suite entry: prefers real sweeps; optional hash compare when supplied.
 *
 * @param {{
 *   referenceHash?: string|null,
 *   candidateHash?: string|null,
 *   referencePath?: string|null,
 *   width?: number,
 *   height?: number,
 * }} [opts]
 * @returns {LensVerifierResult}
 */
export function verifyHyperCausticLensNorthStar(opts = {}) {
  const { referenceHash = null, candidateHash = null, referencePath = null } = opts;

  if (referenceHash && candidateHash) {
    if (referenceHash === candidateHash) {
      return {
        ok: true,
        verdict: "pass",
        status: HYPER_CAUSTIC_VERIFIER_STATUS,
        reason: "candidateHash matches referenceHash",
        meta: { referenceHash, candidateHash, printSoT: false },
      };
    }
    return {
      ok: false,
      verdict: "fail",
      status: HYPER_CAUSTIC_VERIFIER_STATUS,
      reason: "candidateHash does not match referenceHash",
      meta: { referenceHash, candidateHash },
    };
  }

  // Real north-star: energy + caustic + temporal sweeps (no soft-skip).
  const energy = verifyHyperCausticLensEnergySweep(opts);
  if (!energy.ok) return energy;
  const caustic = verifyHyperCausticLensCausticSweep(opts);
  if (!caustic.ok) return caustic;
  const temporal = verifyHyperCausticLensTemporalSweep(opts);
  if (!temporal.ok) return temporal;

  return {
    ok: true,
    verdict: "pass",
    status: HYPER_CAUSTIC_VERIFIER_STATUS,
    reason:
      "north-star energy/caustic/temporal sweeps passed (tolerance-based; not a print gallery claim)",
    meta: {
      energy,
      caustic,
      temporal,
      referencePath,
      printSoT: false,
      authority: "observation",
      banner: HYPER_CAUSTIC_SOT_BANNER,
    },
  };
}

/**
 * Wire ProjCC kernel against the lens camera defaults (structural hook).
 * @param {object} [options]
 * @returns {LensVerifierResult}
 */
export function verifyHyperCausticLensProjectionHook(options = {}) {
  const factory = verifyHyperCausticLensFactory(options);
  if (!factory.ok) return factory;
  const { state } = resolveObservationPreset("soft_caustic", {
    kappa: 0.25,
    width: options.width ?? 640,
    height: options.height ?? 480,
  });
  const kernel = new ProjectionKernel(state);
  const probe = kernel.project({ x: 0.1, y: 0, z: 0.2, w: 0.05 });
  const finite =
    Number.isFinite(probe.screen.sx) && Number.isFinite(probe.screen.sy);
  return {
    ok: finite,
    verdict: finite ? "pass" : "fail",
    status: HYPER_CAUSTIC_VERIFIER_STATUS,
    reason: finite
      ? "ProjCC kernel projected probe through soft_caustic (observation; aperture ≠ print)"
      : "non-finite screen sample",
    meta: {
      screen: probe.screen,
      printSoT: false,
      authority: "observation",
      banner: HYPER_CAUSTIC_SOT_BANNER,
    },
  };
}

/**
 * Run all verifier hooks (no soft-skip in default path).
 * @param {object} [opts]
 */
export function runHyperCausticLensVerifierSuite(opts = {}) {
  const results = [
    verifyHyperCausticLensFactory(opts),
    verifyHyperCausticLensProjectionHook(opts),
    verifyHyperCausticLensEnergySweep(opts),
    verifyHyperCausticLensCausticSweep(opts),
    verifyHyperCausticLensTemporalSweep(opts),
    verifyHyperCausticLensNorthStar(opts),
  ];
  const hardFail = results.some((r) => r.verdict === "fail");
  return {
    ok: !hardFail,
    status: HYPER_CAUSTIC_VERIFIER_STATUS,
    printSoT: false,
    authority: "observation",
    banner: HYPER_CAUSTIC_SOT_BANNER,
    results,
  };
}
