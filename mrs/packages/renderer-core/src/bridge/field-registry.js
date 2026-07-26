/**
 * Multi-field registry for BridgeContract v2.0.
 *
 * Status: **partial** for scalar WaveField3D entries that callers step via
 * WaveBridgeV2; vector / tensor / 4D slots are **skeleton** containers
 * (may be empty arrays). See BRIDGECONTRACT_v2.0.md.
 */

/**
 * @typedef {import("./wave-field-3d.js").WaveField3D} WaveField3D
 * @typedef {import("./field-skeletons.js").VectorField3D} VectorField3D
 * @typedef {import("./field-skeletons.js").TensorField3D} TensorField3D
 * @typedef {import("./field-skeletons.js").WaveField4D} WaveField4D
 */

/**
 * @typedef {Object} FieldRegistryOptions
 * @property {WaveField3D[]} [scalarFields]
 * @property {VectorField3D[]} [vectorFields]
 * @property {TensorField3D[]} [tensorFields]
 * @property {WaveField4D[]} [waveFields4D]
 */

export class FieldRegistry {
  /**
   * @param {FieldRegistryOptions} [options]
   */
  constructor(options = {}) {
    /** @type {WaveField3D[]} */
    this.scalarFields = options.scalarFields ?? [];
    /** @type {VectorField3D[]} */
    this.vectorFields = options.vectorFields ?? [];
    /** @type {TensorField3D[]} */
    this.tensorFields = options.tensorFields ?? [];
    /** @type {WaveField4D[]} */
    this.waveFields4D = options.waveFields4D ?? [];
  }

  /** @returns {number} */
  get scalarCount() {
    return this.scalarFields.length;
  }
}
