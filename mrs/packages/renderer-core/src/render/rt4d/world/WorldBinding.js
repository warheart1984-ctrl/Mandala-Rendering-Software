/**
 * Bind WorldDocument v2 → CPU helpers — Phase C **skeleton** (Drive-G-1).
 * Guards missing sections. Does not claim multi-GPU wave tiling.
 */
import { WaveField } from "../physics/WaveField.js";
import { CurvatureField } from "../physics/CurvatureField.js";
import { ForceField } from "../physics/ForceField.js";

/**
 * @typedef {object} WorldContext
 * @property {object} worldDoc
 * @property {import("../physics/WaveField.js").WaveField|null} waveField
 * @property {import("../physics/CurvatureField.js").CurvatureField} curvature
 * @property {import("../physics/ForceField.js").ForceField} force
 * @property {boolean} waveEnabled
 */

/**
 * @param {object} worldDoc
 * @returns {WorldContext}
 */
export function bindWorld(worldDoc) {
  const doc = worldDoc && typeof worldDoc === "object" ? worldDoc : {};
  const wave = doc.wave && typeof doc.wave === "object" ? doc.wave : null;
  const curvatureCfg =
    doc.curvature && typeof doc.curvature === "object" ? doc.curvature : {};
  const physicsCfg =
    doc.physics && typeof doc.physics === "object" ? doc.physics : {};

  const waveEnabled = Boolean(wave?.enabled);
  /** @type {import("../physics/WaveField.js").WaveField|null} */
  let waveField = null;
  if (waveEnabled && wave) {
    waveField = new WaveField({
      gridSize: wave.gridSize,
      c: wave.c,
      dt: wave.dt,
      initialState: wave.initialState,
    });
  }

  const gravity = physicsCfg.gravity;
  const force = new ForceField({
    g:
      gravity && typeof gravity === "object"
        ? {
            x: gravity.x ?? 0,
            y: gravity.y ?? -9.81,
            z: gravity.z ?? 0,
          }
        : undefined,
    waveField,
    gamma: wave?.gamma ?? 0,
    waveDir: wave?.waveDir,
  });

  const curvature = new CurvatureField({
    k0: curvatureCfg.k0 ?? 0,
    center: curvatureCfg.center,
    sigma: curvatureCfg.sigma,
    alpha: curvatureCfg.alpha ?? 0,
    beta: wave?.beta ?? 0,
    waveField,
  });

  return {
    worldDoc: doc,
    waveField,
    curvature,
    force,
    waveEnabled,
  };
}
