/**
 * PLP v2 minimal validator — Phase C **skeleton** (Drive-G-1).
 * Validates required WorldDocument fields + wave rules when enabled.
 * Not a full constitutional gate.
 */

/**
 * @param {unknown} n
 * @returns {boolean}
 */
function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * @param {object} worldDoc
 * @returns {{ valid: true, errors: [], warnings: string[] } | never}
 */
export function validateWorldDocumentV2(worldDoc) {
  const errors = [];
  const warnings = [];

  if (!worldDoc || typeof worldDoc !== "object") {
    throw new Error("PlpValidator: worldDoc must be an object");
  }

  if (worldDoc.version !== "2.0") {
    errors.push('version must be "2.0"');
  }
  for (const key of ["metadata", "lineage", "geometry", "materials", "render"]) {
    if (!worldDoc[key] || typeof worldDoc[key] !== "object") {
      errors.push(`missing or invalid required field: ${key}`);
    }
  }

  const wave = worldDoc.wave;
  if (wave && wave.enabled === true) {
    const gs = wave.gridSize || {};
    for (const dim of ["nx", "ny", "nz"]) {
      if (!Number.isInteger(gs[dim]) || gs[dim] <= 0) {
        errors.push(`wave.gridSize.${dim} must be a positive integer when wave.enabled`);
      }
    }
    if (!isFiniteNumber(wave.c) || wave.c <= 0) {
      errors.push("wave.c must be a finite number > 0 when wave.enabled");
    }
    if (!isFiniteNumber(wave.dt) || wave.dt <= 0) {
      errors.push("wave.dt must be a finite number > 0 when wave.enabled");
    }
    if (wave.beta !== undefined && !isFiniteNumber(wave.beta)) {
      errors.push("wave.beta must be finite when present");
    }
    if (wave.gamma !== undefined && !isFiniteNumber(wave.gamma)) {
      errors.push("wave.gamma must be finite when present");
    }
    if (wave.waveDir) {
      const { x, y, z } = wave.waveDir;
      if (![x, y, z].every(isFiniteNumber)) {
        errors.push("wave.waveDir components must be finite");
      } else if (x === 0 && y === 0 && z === 0) {
        errors.push("wave.waveDir must be non-zero when wave.enabled");
      }
    }
  }

  if (errors.length) {
    const err = new Error(`PlpValidator: invalid WorldDocument v2: ${errors.join("; ")}`);
    err.name = "PlpValidationError";
    err.errors = errors;
    throw err;
  }

  return { valid: true, errors: [], warnings };
}

export class PlpValidator {
  validate(worldDoc) {
    return validateWorldDocumentV2(worldDoc);
  }
}
